const { google } = require("googleapis");
const { supabase } = require("./_supabase");

function makeAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY
        ?.replace(/\\n/g, "\n").replace(/^"/, "").replace(/"$/, ""),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

// carrito.html (Supabase, definitivo desde el cutover de Etapa 4) manda
// backend:"supabase" — crea el pedido en 004_pedidos/005_ordenes en vez de
// en la hoja 'Ordenes'. Los precios NO se confían del cliente: se resuelven
// de nuevo server-side contra 102_precio_vigente/103_costo_vigente por
// (nombre, talle), así nadie puede manipular el carrito en el navegador
// para pagar menos. La rama de abajo (Sheets) queda intacta, sin usarse,
// como red de seguridad: la usaba el /carrito viejo, archivado en
// _archive/carrito-sheets.html.
// Promo "Chomba Blanca" al 30% off SIEMPRE sobre precio de lista (no sobre
// transferencia, cualquiera sea el método de pago) si el pedido incluye
// otra prenda que no sea medias — hasta 1 unidad EN TOTAL por pedido, aunque
// haya varias líneas de Chomba Blanca en distintos talles. Evaluada acá
// contra el contenido real del pedido, nunca contra un flag que mande el
// cliente (no se puede falsear).
const CHOMBA_PROMO_NOMBRE = "Chomba Blanca";
const CHOMBA_PROMO_PCT = 30;

async function postOrderSupabase(req, res) {
  const { clienteId, items = [], envio = 0, pago = "Transf. Banc." } = req.body;
  if (!clienteId) return res.status(400).json({ error: "Falta clienteId" });
  if (!items.length) return res.status(400).json({ error: "El pedido no tiene items" });

  try {
    const sb = supabase();
    const isCard = /nave|tarjeta/i.test(pago);

    const [{ data: prendas, error: e1 }, { data: talles, error: e2 }, { data: precios, error: e3 }, { data: costos, error: e4 }] = await Promise.all([
      sb.from("001_prendas").select("id,nombre"),
      sb.from("002_talles").select("id,product_id,talle"),
      sb.from("102_precio_vigente").select("talle_id,precio_lista,precio_transferencia"),
      sb.from("103_costo_vigente").select("talle_id,costo"),
    ]);
    if (e1) throw e1; if (e2) throw e2; if (e3) throw e3; if (e4) throw e4;

    const prendaIdByNombre = Object.fromEntries((prendas || []).map(p => [p.nombre, p.id]));
    const talleIdByProdTalle = {};
    (talles || []).forEach(t => { talleIdByProdTalle[`${t.product_id}::${String(t.talle)}`] = t.id; });
    const precioMap = Object.fromEntries((precios || []).map(p => [p.talle_id, p]));
    const costoMap = Object.fromEntries((costos || []).map(c => [c.talle_id, Number(c.costo) || 0]));

    const nonMediaOther = items.some(it => it.nombre !== CHOMBA_PROMO_NOMBRE && !/^medias?\b/i.test(it.nombre || ""));
    let chombaDiscountRemaining = nonMediaOther ? 1 : 0;

    const filas = [];
    for (const item of items) {
      const prendaId = prendaIdByNombre[item.nombre];
      const talleId = prendaId ? talleIdByProdTalle[`${prendaId}::${String(item.talle)}`] : null;
      if (!talleId) return res.status(400).json({ error: `No se encontró "${item.nombre}" talle ${item.talle} en el catálogo` });
      const pr = precioMap[talleId] || {};
      const precioLista = Number(pr.precio_lista) || 0;
      const precioBase = isCard ? precioLista : (Number(pr.precio_transferencia) || 0);
      const cantidad = Number(item.qty) || 1;

      let precioUnit = precioBase, descuentoPct = 0;
      if (item.nombre === CHOMBA_PROMO_NOMBRE && chombaDiscountRemaining > 0 && precioLista > 0) {
        const promoQty = Math.min(cantidad, chombaDiscountRemaining);
        chombaDiscountRemaining -= promoQty;
        const conDescuento = Math.round(precioLista * (1 - CHOMBA_PROMO_PCT / 100));
        precioUnit = Math.round((conDescuento * promoQty + precioBase * (cantidad - promoQty)) / cantidad);
        descuentoPct = precioBase > 0 ? Math.round((1 - precioUnit / precioBase) * 100) : 0;
      }

      filas.push({
        talle_id: talleId, nombre_prenda: item.nombre, talle: String(item.talle),
        cantidad, precio_unitario: precioUnit, costo_unitario: costoMap[talleId] || 0,
        descuento_pct: descuentoPct,
      });
    }

    // "descuento" de cabecera queda siempre en 0: el precio de cada línea ya
    // sale con cualquier descuento aplicado (transferencia y/o la promo), asi
    // que restar algo acá otra vez duplicaría el descuento en total_venta.
    const { data: pedido, error: ePedido } = await sb.from("004_pedidos").insert({
      colegio: "WS", cliente_id: clienteId, forma_pago: pago,
      cargo_envio: Number(envio) || 0, descuento: 0, envio: "retiro",
    }).select().single();
    if (ePedido) throw ePedido;

    const { error: eItems } = await sb.from("005_ordenes").insert(
      filas.map(f => ({ ...f, pedido_id: pedido.id }))
    );
    if (eItems) throw eItems;

    res.status(200).json({ id: pedido.id, numero: pedido.numero, idPedido: pedido.numero, itemsGuardados: filas.length, success: true });
  } catch (err) {
    console.error("Error guardando orden (Supabase):", err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo no permitido" });
  if (req.body && req.body.backend === "supabase") return await postOrderSupabase(req, res);

  try {
    const {
      idPedido, codigoCliente,
      items = [],
      envio = 0,
    } = req.body;

    if (!idPedido || !codigoCliente) {
      return res.status(400).json({ error: "Faltan idPedido o codigoCliente" });
    }
    if (!items.length) {
      return res.status(400).json({ error: "El pedido no tiene items" });
    }

    const sheets = google.sheets({ version: "v4", auth: makeAuth() });
    const spreadsheetId = process.env.SPREADSHEET_ID;

    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const fecha = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;

    const filasOrdenes = items.map(item => [
      fecha,
      idPedido,
      "WS",
      codigoCliente,
      "Transf. Banc.",
      item.nombre,
      item.talle,
      item.qty || 1,
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "'Ordenes'!A:H",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "OVERWRITE",
      requestBody: { values: filasOrdenes },
    });

    // Cargo de envío: se registra en la col F "Cargo Envio" de la fila del pedido
    // en la hoja 'Pedidos' (que se genera sola por fórmula tras el append). Escritura
    // segura: no pisa la celda si tiene fórmula, y nunca bloquea la venta si falla.
    const envioNum = Number(envio) || 0;
    let envioRegistrado = false;
    if (envioNum > 0) {
      try {
        const idsRes = await sheets.spreadsheets.values.get({
          spreadsheetId, range: "'Pedidos'!A:A",
        });
        const ids = idsRes.data.values || [];
        let rowNumber = -1;
        for (let i = 1; i < ids.length; i++) {
          if (String(ids[i][0] || "").trim() === idPedido) { rowNumber = i + 1; break; }
        }
        if (rowNumber > 0) {
          const cellRes = await sheets.spreadsheets.values.get({
            spreadsheetId, range: `'Pedidos'!F${rowNumber}`, valueRenderOption: "FORMULA",
          });
          const cur = (cellRes.data.values?.[0]?.[0]) ?? "";
          if (!(typeof cur === "string" && cur.trim().startsWith("="))) {
            await sheets.spreadsheets.values.update({
              spreadsheetId, range: `'Pedidos'!F${rowNumber}`,
              valueInputOption: "USER_ENTERED", requestBody: { values: [[envioNum]] },
            });
            envioRegistrado = true;
          }
        }
      } catch (e) {
        console.error("No se pudo registrar el cargo de envío:", e.message);
      }
    }

    res.status(200).json({ idPedido, codigoCliente, fecha, itemsGuardados: items.length, envio: envioNum, envioRegistrado, success: true });

  } catch (err) {
    console.error("Error guardando orden:", err);
    res.status(500).json({ error: err.message });
  }
};

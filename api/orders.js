// POST /api/orders — guarda la orden en "Ordenes" y "Pedidos"
//
// "Ordenes" — UNA FILA POR ITEM:
//   A: Fecha       (M/D/YYYY)
//   B: Pedido      (YY-XX, ej: 26-01)
//   C: Colegio     (WS)
//   D: Cliente     (ID del cliente, ej: WS2-Luzuriaga-Maria Victoria)
//   E: Forma pago  (Transf. Banc.)
//   F: Prenda      (nombre de la prenda)
//   G: Talle
//   H: Cant        (cantidad)
//   I: SKU         (formula del sheet — no se escribe)
//   J en adelante: formulas del sheet — no se escriben
//
// "Pedidos" — UNA FILA POR PEDIDO (resumen consolidado):
//   A: ID Pedido
//   B: Cliente
//   C: Cant. Prendas
//   D: Monto Pedido
//   E: Forma de pago
//   F: Fecha Pago   (se completa manualmente)
//   G: Monto Pago   (se completa manualmente)
//   H: Saldo        (formula del sheet)
//   I: Estado Pago  (Al Cobro al crear)
//   J: Envio        (se completa manualmente)
//   K: Estado Envio (se completa manualmente)
//
// Inserta DESPUES del ultimo dato real para no pisar filas-template.
//
// Body: { idPedido, codigoCliente, items:[{nombre,talle,qty,precio}], total, pago }

const { google } = require("googleapis");

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

// Devuelve el numero de fila del sheet (1-based) donde insertar el proximo dato.
// Lee colA y busca la ultima fila donde isRealRow(valor) es true.
async function findNextRow(sheets, sheetName, colLetter, isRealRow) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `'${sheetName}'!${colLetter}:${colLetter}`,
  });
  const rows = res.data.values || [];
  let lastDataSheetRow = 1; // row 1 = header
  for (let i = 1; i < rows.length; i++) {
    const val = (rows[i][0] || "").toString().trim();
    if (isRealRow(val)) {
      lastDataSheetRow = i + 1; // 1-based
    }
  }
  return lastDataSheetRow + 1;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo no permitido" });

  try {
    const {
      idPedido, codigoCliente,
      items = [],
      total = 0,
      pago = "transferencia",
    } = req.body;

    if (!idPedido || !codigoCliente) {
      return res.status(400).json({ error: "Faltan idPedido o codigoCliente" });
    }
    if (!items.length) {
      return res.status(400).json({ error: "El pedido no tiene items" });
    }

    const sheets = google.sheets({ version: "v4", auth: makeAuth() });

    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const fecha = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
    const formaPago = "Transf. Banc.";
    const colegio = "WS";

    // Encontrar primera fila disponible en cada sheet en paralelo
    const [nextOrdenRow, nextPedidoRow] = await Promise.all([
      // Ordenes: col A = Fecha, real si tiene contenido no vacio
      findNextRow(sheets, "Ordenes", "A", val => val.length > 0),
      // Pedidos: col B = Cliente, real si empieza con "WS" seguido de numero
      findNextRow(sheets, "Pedidos", "B", val => /^WS\d/.test(val)),
    ]);

    // ── 1. "Ordenes": una fila por item ──────────────────────────────────────
    const filasOrdenes = items.map(item => [
      fecha,           // A: Fecha
      idPedido,        // B: Pedido
      colegio,         // C: Colegio
      codigoCliente,   // D: Cliente
      formaPago,       // E: Forma de pago
      item.nombre,     // F: Prenda
      item.talle,      // G: Talle
      item.qty || 1,   // H: Cant
      // I: SKU (formula del sheet, no se escribe)
    ]);

    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `'Ordenes'!A${nextOrdenRow}:H${nextOrdenRow + filasOrdenes.length - 1}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: filasOrdenes },
    });

    // ── 2. "Pedidos": una fila resumen por pedido ─────────────────────────────
    const cantPrendas = items.reduce((s, i) => s + (i.qty || 1), 0);

    // Escribimos A:E en un update, e I (Estado Pago) en otro update separado
    // para no tocar H (Saldo, formula del sheet) ni F/G (se completan manual)
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `'Pedidos'!A${nextPedidoRow}:E${nextPedidoRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[idPedido, codigoCliente, cantPrendas, total, formaPago]] },
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `'Pedidos'!I${nextPedidoRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["Al Cobro"]] },
    });

    res.status(200).json({ idPedido, codigoCliente, fecha, itemsGuardados: items.length, success: true });

  } catch (err) {
    console.error("Error guardando orden:", err);
    res.status(500).json({ error: err.message });
  }
};

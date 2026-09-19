// ERP Nord — router unico para la web-app de gestion (Flor).
// Concentra varias acciones en UNA sola funcion serverless para no superar
// el limite de funciones de Vercel.
//
// GET  /api/erp?action=stock       -> stock por prenda/talle (auth)
// GET  /api/erp?action=clientes    -> lista de clientes (auth)
// GET  /api/erp?action=pedidos     -> pedidos con saldo/estado (auth)
// GET  /api/erp?action=dashboard   -> insights financieros (auth)
// GET  /api/erp?action=validate-code&code=XXX -> valida codigo desc. (publico)
// POST /api/erp?action=pedido      -> registra un pedido (escribe Ordenes) (auth)
// POST /api/erp?action=pago        -> registra un pago en Pedidos (auth)
// POST /api/erp?action=entrega     -> registra estado de entrega en Pedidos (auth)
//
// Auth: mismo esquema que /admin — header "Authorization: Bearer <token>".
// El token se obtiene en POST /api/admin/auth con la ADMIN_PASSWORD.

const { google } = require("googleapis");
const crypto = require("crypto");
const arca = require("./arca/_client");

// ── Auth ──────────────────────────────────────────────────────────────────
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

function verifyToken(token) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !token) return false;
  const ts    = Math.floor(Date.now() / (1000 * 60 * 60 * 8));
  const valid = crypto.createHmac("sha256", expected).update(String(ts)).digest("hex");
  return token === valid;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function parseNum(val) {
  if (typeof val === "number") return val;
  if (!val) return 0;
  // Hojas en formato US: "$44,800.00" (coma = miles, punto = decimal)
  return parseFloat(String(val).replace(/[$\s,]/g, "")) || 0;
}

function colLetter(i) {
  // 0 -> A, 1 -> B, ...
  return String.fromCharCode(65 + i);
}

function fechaHoyAR() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  return `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
}

function sheetsClient() {
  return google.sheets({ version: "v4", auth: makeAuth() });
}

// ── Proximo ID de pedido (mismo criterio que /api/pedidos/next-id) ───────────
async function computeNextId(sheets) {
  const result = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: process.env.SPREADSHEET_ID,
    ranges: ["'Pedidos'!A:C", "'Ordenes'!B:D"],
  });
  const [pedidosRows = [], ordenesRows = []] = (result.data.valueRanges || [])
    .map(vr => vr.values || []);
  const currentYear = String(new Date().getFullYear()).slice(-2);
  const numsFrom = (rows, idIdx, cliIdx) => rows.slice(1)
    .filter(r => {
      const id = (r[idIdx] || "").toString().trim();
      const cli = (r[cliIdx] || "").toString().trim();
      return id.startsWith(currentYear + "-") && /^WS\d/.test(cli);
    })
    .map(r => parseInt((r[idIdx] || "").toString().split("-")[1]) || 0);
  const nums = [...numsFrom(pedidosRows, 0, 2), ...numsFrom(ordenesRows, 0, 2)];
  const maxNum = nums.length ? Math.max(...nums) : 0;
  return `${currentYear}-${String(maxNum + 1).padStart(2, "0")}`;
}

// ── GET stock ────────────────────────────────────────────────────────────────
async function getStock(res, colegioFilter) {
  const sheets = sheetsClient();
  const sid = process.env.SPREADSHEET_ID;
  const [stockRes, preciosRes, catRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: sid, range: "'Stock'!A2:J5000", valueRenderOption: "UNFORMATTED_VALUE" }),
    sheets.spreadsheets.values.get({ spreadsheetId: sid, range: "'Lista de precios'!A2:G5000", valueRenderOption: "UNFORMATTED_VALUE" }),
    sheets.spreadsheets.values.get({ spreadsheetId: sid, range: "'Listado de Prendas'!A2:I5000", valueRenderOption: "FORMATTED_VALUE" }),
  ]);

  // Precio Trans (F=5) y Costo (E=4) por SKU desde Lista de precios
  const precioMap = {}, costoMap = {};
  for (const r of (preciosRes.data.values || [])) {
    const sku = String(r[3] || "").trim();
    if (!sku) continue;
    const p = Math.round(Number(r[5]) || 0);
    const c = Math.round(Number(r[4]) || 0);
    if (p) precioMap[sku] = p;
    if (c) costoMap[sku] = c;
  }
  // Filas de encabezado a ignorar (algunas hojas tienen el header en la fila 2)
  const isHeader = (colegio, nombre, sku) =>
    colegio === "Colegio" || nombre === "Prenda" || sku === "SKU";

  // Meta por prenda desde Listado de Prendas: foto (H=7), genero (F=5),
  // categorias (E=4, separadas por coma).
  const metaMap = {};
  for (const r of (catRes.data.values || [])) {
    const nombre = String(r[1] || "").trim();
    if (!nombre || nombre === "Prenda") continue;
    if (!metaMap[nombre]) metaMap[nombre] = { foto: "", genero: "", cats: new Set() };
    const m = metaMap[nombre];
    const foto = String(r[7] || "").trim(); if (foto && !m.foto) m.foto = foto;
    const gen  = String(r[5] || "").trim(); if (gen && !m.genero) m.genero = gen;
    String(r[4] || "").split(",").map(c => c.trim()).filter(Boolean).forEach(c => m.cats.add(c));
  }

  const productsMap = {};
  for (const r of (stockRes.data.values || [])) {
    const colegio = String(r[0] || "").trim();
    const nombre  = String(r[1] || "").trim();
    const sku     = String(r[3] || "").trim();
    // Talles de letra (S/M/L/XL) tienen la col Talle vacia: se toma del SKU
    let talle = String(r[2] ?? "").trim();
    if (!talle && sku) talle = sku.split("-").pop();
    if (!nombre || !talle) continue;
    if (isHeader(colegio, nombre, sku)) continue;
    if (colegioFilter && colegio !== colegioFilter) continue;
    const stock  = Math.round(Number(r[7]) || 0);         // H = Stock actual
    const precio = precioMap[sku] || Math.round(Number(r[9]) || 0); // Precio Unit
    const costo  = costoMap[sku]  || Math.round(Number(r[8]) || 0); // Costo Unit
    const key = `${colegio}||${nombre}`;
    if (!productsMap[key]) {
      const meta = metaMap[nombre] || { foto: "", genero: "", cats: new Set() };
      productsMap[key] = { colegio, nombre, foto: meta.foto || "",
        genero: meta.genero || "", categorias: [...meta.cats], talles: [] };
    }
    productsMap[key].talles.push({ talle, sku, stock, precio, costo });
  }

  const SIZE_ORDER = ["XS","S","M","L","XL","XXL","XXXL"];
  const talleSort = (a, b) => {
    const na = Number(a.talle), nb = Number(b.talle);
    const aNum = !isNaN(na) && a.talle.trim() !== "", bNum = !isNaN(nb) && b.talle.trim() !== "";
    if (aNum && bNum) return na - nb;
    if (aNum) return -1; if (bNum) return 1;
    const ai = SIZE_ORDER.indexOf(a.talle.toUpperCase()), bi = SIZE_ORDER.indexOf(b.talle.toUpperCase());
    if (ai !== -1 && bi !== -1) return ai - bi;
    return a.talle.localeCompare(b.talle);
  };
  const products = Object.values(productsMap).sort((a, b) => a.nombre.localeCompare(b.nombre));
  products.forEach(p => p.talles.sort(talleSort));
  res.setHeader("Cache-Control", "no-store");
  res.json(products);
}

// ── GET clientes ─────────────────────────────────────────────────────────────
async function getClientes(res) {
  const sheets = sheetsClient();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "'Clientes'!A:I",
  });
  const rows = result.data.values || [];
  const clientes = rows.slice(1)
    .filter(r => (r[0] || "").toString().trim() && !isNaN(Number(r[0])))
    .map(r => ({
      nro: r[0] || "",
      nombre: (r[1] || "").trim(),
      apellido: (r[2] || "").trim(),
      colegio: (r[3] || "WS").trim(),
      codigo: (r[4] || "").trim(),    // ID (formula)
      email: (r[5] || "").trim(),
      telefono: (r[6] || "").trim(),
    }));
  res.setHeader("Cache-Control", "no-store");
  res.json(clientes);
}

// ── GET pedidos ──────────────────────────────────────────────────────────────
async function getPedidos(res) {
  const sheets = sheetsClient();
  const [result, facturas] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "'Pedidos'!A:O",
    }),
    getFacturasMap(sheets),
  ]);
  const rows = result.data.values || [];
  // A:ID B:Fecha C:Cliente D:Cant E:Monto F:CargoEnvio G:Descuento H:TotalVenta
  // I:FormaPago J:FechaPago K:MontoPago L:Saldo M:EstadoPago N:Envio O:EstadoEnvio
  const pedidos = rows.slice(1)
    .map((r, i) => ({
      rowNumber:   i + 2,               // fila real en la hoja (1-based, +header)
      id:          (r[0]  || "").trim(),
      fecha:       (r[1]  || "").trim(),
      cliente:     (r[2]  || "").trim(),
      cant:        parseNum(r[3]),
      monto:       parseNum(r[4]),
      cargoEnvio:  parseNum(r[5]),
      descuento:   parseNum(r[6]),
      totalVenta:  parseNum(r[7]),
      formaPago:   (r[8]  || "").trim(),
      fechaPago:   (r[9]  || "").trim(),
      montoPago:   parseNum(r[10]),
      saldo:       parseNum(r[11]),
      estadoPago:  (r[12] || "").trim(),
      envio:       (r[13] || "").trim(),
      estadoEnvio: (r[14] || "").trim(),
    }))
    .filter(p => p.id && /^WS\d/.test(p.cliente))
    .map(p => ({ ...p, factura: facturas[p.id] || null }));
  res.setHeader("Cache-Control", "no-store");
  res.json(pedidos.reverse());
}

// ── GET dashboard ────────────────────────────────────────────────────────────
async function getDashboard(res) {
  const sheets = sheetsClient();
  const sid = process.env.SPREADSHEET_ID;
  const [ordRes, pedRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: sid, range: "'Ordenes'!A2:U20000", valueRenderOption: "UNFORMATTED_VALUE" }),
    sheets.spreadsheets.values.get({ spreadsheetId: sid, range: "'Pedidos'!A2:O5000", valueRenderOption: "UNFORMATTED_VALUE" }),
  ]);

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const porMes = {};       // "YYYY-MM" -> {ventas, ganancia, unidades}
  const productos = {};    // prenda -> {qty, ventas}
  let ventasMes = 0, gananciaMes = 0, ventasAnio = 0, gananciaAnio = 0;
  let prendasMes = 0, prendasAnio = 0;

  for (const r of (ordRes.data.values || [])) {
    const cliente = String(r[3] || "").trim();
    if (!/^WS\d/.test(cliente)) continue;
    const prenda    = String(r[5] || "").trim();
    const cant      = Number(r[7]) || 0;
    const precioTot = Number(r[12]) || 0;   // M = Precio total
    const ganancia  = Number(r[13]) || 0;   // N = Ganancia
    const mes       = Number(r[14]) || 0;   // O = Mes
    const anio      = Number(r[15]) || 0;   // P = Año

    if (anio && mes) {
      const k = `${anio}-${String(mes).padStart(2, "0")}`;
      if (!porMes[k]) porMes[k] = { ventas: 0, ganancia: 0, unidades: 0 };
      porMes[k].ventas   += precioTot;
      porMes[k].ganancia += ganancia;
      porMes[k].unidades += cant;
    }
    if (anio === year) {
      ventasAnio += precioTot; gananciaAnio += ganancia; prendasAnio += cant;
      if (mes === month) { ventasMes += precioTot; gananciaMes += ganancia; prendasMes += cant; }
    }
    if (prenda) {
      if (!productos[prenda]) productos[prenda] = { nombre: prenda, qty: 0, ventas: 0 };
      productos[prenda].qty    += cant;
      productos[prenda].ventas += precioTot;
    }
  }

  // Serie de los ultimos 12 meses (ordenada cronologicamente)
  const serie = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const v = porMes[k] || { ventas: 0, ganancia: 0, unidades: 0 };
    serie.push({ label: `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`, ventas: Math.round(v.ventas), ganancia: Math.round(v.ganancia), unidades: v.unidades || 0 });
  }

  const topProductos = Object.values(productos)
    .sort((a, b) => b.qty - a.qty).slice(0, 8)
    .map(p => ({ nombre: p.nombre, qty: p.qty, ventas: Math.round(p.ventas) }));

  // Cobros pendientes (L = Saldo idx 11) y entregas pendientes (O = Estado Envio idx 14)
  let totalPendiente = 0, entregasPendientes = 0;
  const pendientes = [];
  for (const r of (pedRes.data.values || [])) {
    const id = String(r[0] || "").trim();
    const cliente = String(r[2] || "").trim();
    if (!id || !/^WS\d/.test(cliente)) continue;
    const saldo = Number(r[11]) || 0;
    if (saldo > 0.5) {
      totalPendiente += saldo;
      pendientes.push({ id, cliente, saldo: Math.round(saldo) });
    }
    const estadoEnvio = String(r[14] || "").trim();
    if (!/entreg/i.test(estadoEnvio)) entregasPendientes++;
  }
  pendientes.sort((a, b) => b.saldo - a.saldo);

  res.setHeader("Cache-Control", "no-store");
  res.json({
    ventasMes: Math.round(ventasMes),
    gananciaMes: Math.round(gananciaMes),
    ventasAnio: Math.round(ventasAnio),
    gananciaAnio: Math.round(gananciaAnio),
    prendasMes,
    prendasAnio,
    totalPendiente: Math.round(totalPendiente),
    pendientesCount: pendientes.length,
    entregasPendientes,
    pendientes: pendientes.slice(0, 30),
    serie,
    topProductos,
  });
}

// ── GET ordenes — detalle de prendas por pedido (hoja 'Ordenes') ─────────────
async function getOrdenes(res) {
  const sheets = sheetsClient();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "'Ordenes'!A2:N20000",
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const rows = result.data.values || [];
  // A:Fecha B:Pedido C:Colegio D:Cliente E:FormaPago F:Prenda G:Talle H:Cant
  // I:SKU J:CostoUnit K:PrecioUnit L:CostoTotal M:PrecioTotal N:Ganancia
  const grouped = {};
  const order = [];
  for (const r of rows) {
    const id      = String(r[1] || "").trim();
    const cliente = String(r[3] || "").trim();
    if (!id || !/^WS\d/.test(cliente)) continue;
    if (!grouped[id]) {
      grouped[id] = { id, fecha: String(r[0] || "").trim(), cliente,
        formaPago: String(r[4] || "").trim(), items: [], total: 0, ganancia: 0 };
      order.push(id);
    }
    const precio      = Math.round(Number(r[10]) || 0);
    const precioTotal = Math.round(Number(r[12]) || 0);
    const ganancia    = Math.round(Number(r[13]) || 0);
    grouped[id].items.push({
      nombre: String(r[5] || "").trim(),
      talle:  String(r[6] ?? "").trim(),
      qty:    Number(r[7]) || 1,
      precio, precioTotal, ganancia,
    });
    grouped[id].total    += precioTotal;
    grouped[id].ganancia += ganancia;
  }
  const ordenes = order.map(id => grouped[id]).reverse();
  res.setHeader("Cache-Control", "no-store");
  res.json(ordenes);
}

// ── GET validate-code (publico, portado de /api/validate-code) ───────────────
async function validateCode(req, res) {
  const code = (req.query.code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ valid: false, error: "Código vacío" });
  const sheets = sheetsClient();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Codigos!A2:F200",
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const rows = result.data.values || [];
  const row = rows.find(r => String(r[0] || "").trim().toUpperCase() === code);
  if (!row) return res.json({ valid: false, error: "Código no encontrado" });
  const [, descPct, usosMax, usosActuales, activo, validoHasta] = row;
  if (String(activo).toUpperCase() !== "SI") return res.json({ valid: false, error: "Código inactivo" });
  if (usosMax > 0 && usosActuales >= usosMax) return res.json({ valid: false, error: "Código agotado" });
  if (validoHasta) {
    const [d, m, y] = String(validoHasta).split("/");
    const expiry = new Date(`${y}-${m}-${d}T23:59:59-03:00`);
    if (expiry < new Date()) return res.json({ valid: false, error: "Código vencido" });
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ valid: true, descuento: Number(descPct) || 0, codigo: row[0] });
}

// ── POST pedido — registra las prendas en 'Ordenes' ──────────────────────────
// Body: { codigoCliente, colegio, formaPago, items:[{nombre,talle,qty}] }
// La hoja 'Pedidos' y el stock se actualizan solos por formulas.
async function postPedido(req, res) {
  const { codigoCliente, colegio = "WS", formaPago = "Transf. Banc.", items = [] } = req.body || {};
  if (!codigoCliente) return res.status(400).json({ error: "Falta codigoCliente" });
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "El pedido no tiene items" });

  const sheets = sheetsClient();
  const idPedido = await computeNextId(sheets);
  const fecha = fechaHoyAR();

  const filas = items.map(it => [
    fecha,                    // A Fecha
    idPedido,                 // B Pedido
    colegio,                  // C Colegio
    codigoCliente,            // D Cliente
    formaPago,                // E Forma de pago
    it.nombre,                // F Prenda
    it.talle,                 // G Talle
    it.qty || 1,              // H Cant
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "'Ordenes'!A:H",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "OVERWRITE",
    requestBody: { values: filas },
  });

  res.json({ success: true, idPedido, itemsGuardados: filas.length });
}

// ── Escritura segura en Pedidos: no pisa celdas que tengan formula ───────────
// updates: { colIndex: value }  (colIndex 0-based sobre A:O)
async function safeUpdatePedido(sheets, idPedido, updates) {
  const sid = process.env.SPREADSHEET_ID;
  // Ubicar la fila por ID (col A). Se leen valores calculados.
  const idsRes = await sheets.spreadsheets.values.get({ spreadsheetId: sid, range: "'Pedidos'!A:A" });
  const ids = idsRes.data.values || [];
  let rowNumber = -1;
  for (let i = 1; i < ids.length; i++) {
    if (String(ids[i][0] || "").trim() === idPedido) { rowNumber = i + 1; break; }
  }
  if (rowNumber < 0) return { ok: false, error: "Pedido no encontrado en la hoja Pedidos" };

  // Leer la fila como FORMULA para saber que columnas son calculadas
  const rowRes = await sheets.spreadsheets.values.get({
    spreadsheetId: sid,
    range: `'Pedidos'!A${rowNumber}:O${rowNumber}`,
    valueRenderOption: "FORMULA",
  });
  const rowVals = (rowRes.data.values || [[]])[0] || [];

  const data = [];
  const skipped = [];
  for (const [colIdxStr, value] of Object.entries(updates)) {
    const colIdx = Number(colIdxStr);
    const cell = rowVals[colIdx];
    if (typeof cell === "string" && cell.trim().startsWith("=")) { skipped.push(colIdx); continue; }
    data.push({ range: `'Pedidos'!${colLetter(colIdx)}${rowNumber}`, values: [[value]] });
  }
  if (data.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sid,
      requestBody: { valueInputOption: "USER_ENTERED", data },
    });
  }
  return { ok: true, rowNumber, updated: data.length, skipped };
}

// ── POST pago ────────────────────────────────────────────────────────────────
// Body: { idPedido, montoPago, fechaPago?, formaPago?, estadoPago? }
async function postPago(req, res) {
  const { idPedido, montoPago, fechaPago, formaPago, estadoPago } = req.body || {};
  if (!idPedido) return res.status(400).json({ error: "Falta idPedido" });
  if (montoPago == null || isNaN(Number(montoPago))) return res.status(400).json({ error: "Monto de pago invalido" });

  const sheets = sheetsClient();
  const updates = {
    9:  fechaPago || fechaHoyAR(),   // J Fecha Pago
    10: Number(montoPago),           // K Monto Pago
  };
  if (formaPago)  updates[8]  = formaPago;   // I Forma de pago
  if (estadoPago) updates[12] = estadoPago;  // M Estado Pago

  const r = await safeUpdatePedido(sheets, idPedido, updates);
  if (!r.ok) return res.status(404).json(r);
  res.json({ success: true, ...r });
}

// ── POST entrega ─────────────────────────────────────────────────────────────
// Body: { idPedido, estadoEnvio, envio? }
async function postEntrega(req, res) {
  const { idPedido, estadoEnvio, envio } = req.body || {};
  if (!idPedido) return res.status(400).json({ error: "Falta idPedido" });
  if (!estadoEnvio) return res.status(400).json({ error: "Falta estadoEnvio" });

  const sheets = sheetsClient();
  const updates = { 14: estadoEnvio };  // O Estado Envio
  if (envio) updates[13] = envio;       // N Envio

  const r = await safeUpdatePedido(sheets, idPedido, updates);
  if (!r.ok) return res.status(404).json(r);
  res.json({ success: true, ...r });
}

// ── Facturación ARCA (Factura C) ─────────────────────────────────────────────
// Registro en una pestaña "Facturas" (aditiva, no toca las hojas existentes).
async function getFacturasMap(sheets) {
  try {
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "'Facturas'!A2:I5000",
    });
    const map = {};
    for (const row of (r.data.values || [])) {
      const id = String(row[0] || "").trim();
      if (!id) continue;
      map[id] = {
        importe: parseNum(row[2]), tipoReceptor: (row[3] || "").trim(),
        nro: (row[4] || "").trim(), cae: (row[5] || "").trim(),
        caeVto: (row[6] || "").trim(), fecha: (row[7] || "").trim(),
        ambiente: (row[8] || "").trim(),
      };
    }
    return map;
  } catch (e) {
    return {}; // la pestaña todavía no existe
  }
}

async function ensureFacturasSheet(sheets) {
  const sid = process.env.SPREADSHEET_ID;
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sid, fields: "sheets.properties.title" });
  const existe = (meta.data.sheets || []).some(s => s.properties.title === "Facturas");
  if (existe) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sid,
    requestBody: { requests: [{ addSheet: { properties: { title: "Facturas" } } }] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: sid, range: "'Facturas'!A1:I1", valueInputOption: "RAW",
    requestBody: { values: [["ID Pedido", "Cliente", "Importe", "Tipo receptor", "Nro Comprobante", "CAE", "Vto CAE", "Fecha", "Ambiente"]] },
  });
}

// POST facturar — emite Factura C para un pedido y la registra.
// Body: { idPedido, cliente, importe, docTipo?, docNro? }
async function postFacturar(req, res) {
  const { idPedido, cliente = "", importe, docTipo = 99, docNro = "" } = req.body || {};
  if (!idPedido) return res.status(400).json({ error: "Falta idPedido" });
  const imp = Number(importe);
  if (!imp || imp <= 0) return res.status(400).json({ error: "Importe inválido" });

  const faltan = arca.faltanCredenciales();
  if (faltan.length) return res.status(400).json({ error: "Faltan credenciales de ARCA en Vercel: " + faltan.join(", ") });

  const sheets = sheetsClient();

  // No duplicar: si el pedido ya tiene factura, la devuelve.
  const yaMap = await getFacturasMap(sheets);
  if (yaMap[idPedido] && yaMap[idPedido].cae) {
    return res.json({ ok: true, yaFacturado: true, factura: yaMap[idPedido] });
  }

  let factura;
  try {
    factura = await arca.emitirFacturaC({ docTipo: parseInt(docTipo, 10), docNro, importe: imp, concepto: 1 });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e.message });
  }

  // Registrar (best-effort: la factura ya se emitió en ARCA).
  let registrado = true;
  try {
    await ensureFacturasSheet(sheets);
    const dt = parseInt(docTipo, 10);
    const tipoReceptor = dt === 99 ? "Consumidor Final" : (dt === 80 ? "CUIT" : "DNI");
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID, range: "'Facturas'!A:I",
      valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS",
      requestBody: { values: [[
        idPedido, cliente, factura.importe, tipoReceptor,
        `${factura.ptoVta}-${factura.cbteNro}`, factura.cae, factura.caeVto, factura.fecha, factura.env,
      ]] },
    });
  } catch (e) {
    registrado = false;
    console.error("Factura emitida pero no registrada:", e.message);
  }

  res.json({ ok: true, factura: { ...factura, nro: `${factura.ptoVta}-${factura.cbteNro}` }, registrado });
}

// ── Router ───────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const action = (req.query.action || "").toLowerCase();

  try {
    // Accion publica (no requiere token)
    if (action === "validate-code") return await validateCode(req, res);

    // Resto: requiere token de admin
    const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
    if (!verifyToken(token)) return res.status(401).json({ error: "No autorizado" });

    if (req.method === "GET") {
      if (action === "stock")     return await getStock(res, (req.query.colegio || "").trim() || null);
      if (action === "clientes")  return await getClientes(res);
      if (action === "pedidos")   return await getPedidos(res);
      if (action === "ordenes")   return await getOrdenes(res);
      if (action === "dashboard") return await getDashboard(res);
      return res.status(400).json({ error: "Accion GET desconocida" });
    }

    if (req.method === "POST") {
      if (action === "pedido")   return await postPedido(req, res);
      if (action === "pago")     return await postPago(req, res);
      if (action === "entrega")  return await postEntrega(req, res);
      if (action === "facturar") return await postFacturar(req, res);
      return res.status(400).json({ error: "Accion POST desconocida" });
    }

    return res.status(405).json({ error: "Metodo no permitido" });
  } catch (err) {
    console.error("Error ERP:", err);
    res.status(500).json({ error: err.message });
  }
};

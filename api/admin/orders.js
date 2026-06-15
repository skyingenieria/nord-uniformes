// GET  /api/admin/orders          — lista todas las órdenes
// GET  /api/admin/orders?type=clientes — lista clientes
// GET  /api/admin/orders?type=metrics  — métricas de cobros
// PATCH /api/admin/orders?id=XXX  — actualiza estado
// Header requerido: Authorization: Bearer <token>

const { google } = require("googleapis");
const crypto = require("crypto");

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

function parseNum(val) {
  if (!val) return 0;
  return parseFloat(String(val).replace(/[$,\s]/g, "").replace(",", ".")) || 0;
}

async function getClientes(res) {
  const sheets = google.sheets({ version: "v4", auth: makeAuth() });
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "'Clientes'!A:G",
  });
  const rows = result.data.values || [];
  const COLS = ["nro", "nombre", "apellido", "colegio", "codigo", "email", "telefono"];
  const clientes = rows.slice(1)
    .map(r => Object.fromEntries(COLS.map((k, i) => [k, (r[i] || "").trim()])))
    .filter(c => c.nro && !isNaN(Number(c.nro)));
  res.setHeader("Cache-Control", "no-store");
  res.json(clientes);
}

async function getMetrics(res) {
  const sheets = google.sheets({ version: "v4", auth: makeAuth() });
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "'Pedidos'!A:K",
  });
  const rows = result.data.values || [];
  const pedidos = rows.slice(1)
    .filter(r => r[0]?.trim() && /^WS\d/.test(r[1] || ""))
    .map(r => ({
      id:          r[0] || "",
      cliente:     r[1] || "",
      cant:        parseNum(r[2]),
      monto:       parseNum(r[3]),
      formaPago:   r[4] || "",
      fechaPago:   r[5] || "",
      montoPago:   parseNum(r[6]),
      saldo:       parseNum(r[7]),
      estadoPago:  r[8] || "",
      envio:       r[9] || "",
      estadoEnvio: r[10] || "",
    }));
  const pendientes   = pedidos.filter(p => p.saldo > 0);
  const totalSaldo   = pendientes.reduce((s, p) => s + p.saldo, 0);
  const totalCobrado = pedidos.reduce((s, p) => s + p.montoPago, 0);
  res.setHeader("Cache-Control", "no-store");
  res.json({ pedidos, pendientes, totalSaldo, totalCobrado });
}

async function patchOrder(req, res) {
  const { id } = req.query;
  const { estado } = req.body;
  const sheets = google.sheets({ version: "v4", auth: makeAuth() });
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "'7 Ordenes'!A:Q",
  });
  const rows = result.data.values || [];
  const rowIdx = rows.findIndex(r => r[0] === id);
  if (rowIdx < 0) return res.status(404).json({ error: "Orden no encontrada" });
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `'7 Ordenes'!Q${rowIdx + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[estado]] },
  });
  res.json({ ok: true });
}

async function getOrders(res) {
  const sheets = google.sheets({ version: "v4", auth: makeAuth() });
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "'7 Ordenes'!A2:Q2000",
  });
  const rows  = result.data.values || [];
  const COLS  = ["id","fecha","nombre","apellido","email","telefono","items",
                 "subtotal","descuento","codigo","total","pago","envio",
                 "direccion","cp","localidad","estado"];
  const orders = rows
    .map(r => Object.fromEntries(COLS.map((k, i) => [k, r[i] ?? ""])))
    .filter(o => o.id);
  orders.forEach(o => {
    try { o.items = JSON.parse(o.items); } catch { o.items = []; }
    o.total    = Number(o.total)    || 0;
    o.subtotal = Number(o.subtotal) || 0;
  });
  res.setHeader("Cache-Control", "no-store");
  res.json(orders.reverse());
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (!verifyToken(token)) return res.status(401).json({ error: "No autorizado" });

  try {
    if (req.method === "PATCH") return await patchOrder(req, res);
    const type = req.query.type;
    if (type === "clientes") return await getClientes(res);
    if (type === "metrics")  return await getMetrics(res);
    return await getOrders(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

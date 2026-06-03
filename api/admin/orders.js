// GET /api/admin/orders — lista todas las órdenes para el panel admin
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

// PATCH /api/admin/orders?id=XXX — actualiza estado
async function patchOrder(req, res) {
  const { id } = req.query;
  const { estado } = req.body;
  const sheets = google.sheets({ version: "v4", auth: makeAuth() });

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "Órdenes!A:Q",
  });
  const rows = result.data.values || [];
  const rowIdx = rows.findIndex(r => r[0] === id);
  if (rowIdx < 0) return res.status(404).json({ error: "Orden no encontrada" });

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `Órdenes!Q${rowIdx + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[estado]] },
  });

  res.json({ ok: true });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (!verifyToken(token)) return res.status(401).json({ error: "No autorizado" });

  if (req.method === "PATCH") return patchOrder(req, res);

  try {
    const sheets = google.sheets({ version: "v4", auth: makeAuth() });
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "Órdenes!A2:Q2000",
    });

    const rows  = result.data.values || [];
    const COLS  = ["id","fecha","nombre","apellido","email","telefono","items",
                   "subtotal","descuento","codigo","total","pago","envio",
                   "direccion","cp","localidad","estado"];
    const orders = rows.map(r => Object.fromEntries(COLS.map((k,i) => [k, r[i] ?? ""])))
                       .filter(o => o.id);

    // Parsear items JSON
    orders.forEach(o => {
      try { o.items = JSON.parse(o.items); } catch { o.items = []; }
      o.total    = Number(o.total)    || 0;
      o.subtotal = Number(o.subtotal) || 0;
    });

    res.setHeader("Cache-Control", "no-store");
    res.json(orders.reverse()); // más recientes primero
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/admin/clientes — devuelve todos los clientes del sheet
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

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (!verifyToken(token)) return res.status(401).json({ error: "No autorizado" });

  try {
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/admin/metrics — agrega datos de cobros pendientes desde hoja Pedidos
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
      range: "'Pedidos'!A:K",
    });

    const rows = result.data.values || [];
    // A:ID, B:Cliente, C:CantPrendas, D:MontoPedido, E:FormaPago,
    // F:FechaPago, G:MontoPago, H:Saldo, I:EstadoPago, J:Envio, K:EstadoEnvio
    const pedidos = rows.slice(1)
      .filter(r => r[0]?.trim() && /^WS\d/.test(r[1] || ""))
      .map(r => ({
        id:         r[0] || "",
        cliente:    r[1] || "",
        cant:       parseNum(r[2]),
        monto:      parseNum(r[3]),
        formaPago:  r[4] || "",
        fechaPago:  r[5] || "",
        montoPago:  parseNum(r[6]),
        saldo:      parseNum(r[7]),
        estadoPago: r[8] || "",
        envio:      r[9] || "",
        estadoEnvio:r[10] || "",
      }));

    const pendientes = pedidos.filter(p => p.saldo > 0);
    const totalSaldo = pendientes.reduce((s, p) => s + p.saldo, 0);
    const totalCobrado = pedidos.reduce((s, p) => s + p.montoPago, 0);

    res.setHeader("Cache-Control", "no-store");
    res.json({ pedidos, pendientes, totalSaldo, totalCobrado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

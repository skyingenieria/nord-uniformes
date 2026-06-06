// GET /api/pedidos/next-id
// Devuelve el siguiente ID Pedido en formato YY-NN
// Ej: 26-01, 26-02, etc.

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

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Método no permitido" });

  try {
    const sheets = google.sheets({ version: "v4", auth: makeAuth() });

    // Leer la sheet "3 Pedidos" para encontrar el máximo ID
    const pedidosResult = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "'3 Pedidos'!A:A",
    });

    const rows = pedidosResult.data.values || [];
    const today = new Date();
    const currentYear = String(today.getFullYear()).slice(-2); // "26" para 2026

    // Buscar IDs del año actual (ej: 26-01, 26-02, etc.)
    const currentYearIds = rows
      .slice(1) // saltar header
      .map(r => r[0])
      .filter(id => id && id.startsWith(currentYear + "-"))
      .map(id => {
        const num = parseInt(id.split("-")[1]) || 0;
        return num;
      });

    const maxNum = currentYearIds.length > 0 ? Math.max(...currentYearIds) : 0;
    const nextNum = maxNum + 1;
    const nextId = `${currentYear}-${String(nextNum).padStart(2, "0")}`;

    res.json({ nextId, currentYear });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: err.message });
  }
};

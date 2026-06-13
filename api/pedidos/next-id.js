// GET /api/pedidos/next-id
// Devuelve el siguiente ID Pedido en formato YY-NN (ej: 26-05)
// Solo cuenta pedidos reales: col B (Cliente) debe empezar con "WS" + digito.

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
  if (req.method !== "GET") return res.status(405).json({ error: "Metodo no permitido" });

  try {
    const sheets = google.sheets({ version: "v4", auth: makeAuth() });

    // Leer A:B para poder filtrar por cliente real (col B)
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "'Pedidos'!A:B",
    });

    const rows = result.data.values || [];
    const today = new Date();
    const currentYear = String(today.getFullYear()).slice(-2);

    // Solo contar IDs de pedidos reales del año actual
    // (cliente en col B debe empezar con "WS" + digito, excluye "Pedido Inexistente" etc)
    const currentYearNums = rows
      .slice(1)
      .filter(r => {
        const idPedido = (r[0] || "").trim();
        const cliente = (r[1] || "").trim();
        return idPedido.startsWith(currentYear + "-") && /^WS\d/.test(cliente);
      })
      .map(r => parseInt(r[0].split("-")[1]) || 0);

    const maxNum = currentYearNums.length > 0 ? Math.max(...currentYearNums) : 0;
    const nextNum = maxNum + 1;
    const nextId = `${currentYear}-${String(nextNum).padStart(2, "0")}`;

    res.json({ nextId, currentYear });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: err.message });
  }
};

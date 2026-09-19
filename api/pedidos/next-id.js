// GET /api/pedidos/next-id
// Devuelve el siguiente ID Pedido en formato YY-NN (ej: 26-05)
// Solo cuenta pedidos reales: el Cliente debe empezar con "WS" + digito.
//
// Layout actual de las hojas (tras agregar "Cargo Envio" y "Descuento"):
//   Pedidos: A=ID Pedido, B=Fecha pedido, C=Cliente, ...
//   Ordenes: A=Fecha, B=Pedido, C=Colegio, D=Cliente, ...
// Se toma el máximo entre ambas hojas para no repetir números aunque una
// se actualice antes que la otra (la web escribe en Ordenes al vender).

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

    // Leer ambas hojas: en Pedidos el ID esta en A y el Cliente en C;
    // en Ordenes el ID (Pedido) esta en B y el Cliente en D.
    const result = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: process.env.SPREADSHEET_ID,
      ranges: ["'Pedidos'!A:C", "'Ordenes'!B:D"],
    });

    const [pedidosRows = [], ordenesRows = []] = (result.data.valueRanges || [])
      .map(vr => vr.values || []);
    const today = new Date();
    const currentYear = String(today.getFullYear()).slice(-2);

    // Extrae los numeros de pedido reales del año actual de una hoja.
    // idIdx = columna del ID Pedido, cliIdx = columna del Cliente.
    // (cliente debe empezar con "WS" + digito, excluye "Pedido Inexistente" etc)
    const numsFrom = (rows, idIdx, cliIdx) => rows
      .slice(1)
      .filter(r => {
        const idPedido = (r[idIdx] || "").trim();
        const cliente = (r[cliIdx] || "").trim();
        return idPedido.startsWith(currentYear + "-") && /^WS\d/.test(cliente);
      })
      .map(r => parseInt((r[idIdx] || "").split("-")[1]) || 0);

    const currentYearNums = [
      ...numsFrom(pedidosRows, 0, 2),
      ...numsFrom(ordenesRows, 0, 2),
    ];

    const maxNum = currentYearNums.length > 0 ? Math.max(...currentYearNums) : 0;
    const nextNum = maxNum + 1;
    const nextId = `${currentYear}-${String(nextNum).padStart(2, "0")}`;

    res.json({ nextId, currentYear });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: err.message });
  }
};

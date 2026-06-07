// GET /api/setup-sheet
// Escribe la ARRAYFORMULA de SKU en la celda H2 de "7 Ordenes".
// Llamar UNA SOLA VEZ. Después de ejecutarlo esta URL no hace nada dañino
// si se llama de nuevo (solo sobreescribe la misma fórmula).

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

  try {
    const sheets = google.sheets({ version: "v4", auth: makeAuth() });

    // ARRAYFORMULA en H2: SKU = Colegio-Prenda-Talle para cada fila con pedido
    const formula = `=ARRAYFORMULA(IF(B2:B<>"",C2:C&"-"&F2:F&"-"&G2:G,""))`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "'7 Ordenes'!H2",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[formula]] },
    });

    res.status(200).json({
      ok: true,
      mensaje: 'ARRAYFORMULA de SKU escrita en H2 de "7 Ordenes".',
      formula,
    });
  } catch (err) {
    console.error("Error setup-sheet:", err);
    res.status(500).json({ error: err.message });
  }
};

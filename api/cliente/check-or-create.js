// POST /api/cliente/check-or-create
// Body: { nombre, apellido, email, telefono }
//
// Estructura "Clientes":
//   A (0): Nro          (1, 2, 3...)
//   B (1): Nombre
//   C (2): Familia (apellido)
//   D (3): Colegio
//   E (4): ID  (WS1-Apellido-Nombre  o  WS1--Nombre si sin apellido)
//   F (5): Email
//   G (6): WhatsApp
//   H, I: formulas del sheet, no se escriben
//
// Inserta en la primera fila vacia despues del ultimo dato real (col A numerica),
// usando values.update para no pisar filas-template que esten mas abajo.
//
// Devuelve: { codigo, nro, nombre, apellido, email, telefono, esNuevo }

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
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo no permitido" });

  try {
    const { nombre, apellido, email, telefono } = req.body;

    if (!nombre || !email) {
      return res.status(400).json({ error: "Faltan datos requeridos (nombre, email)" });
    }

    const sheets = google.sheets({ version: "v4", auth: makeAuth() });

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "'Clientes'!A:G",
    });

    const rows = result.data.values || [];

    // Buscar cliente existente por email (col F = indice 5)
    const existingRow = rows.slice(1).find(r => (r[5] || "").trim() === email.trim());

    if (existingRow) {
      return res.json({
        codigo: existingRow[4] || "",
        nro: existingRow[0] || "",
        nombre: existingRow[1] || "",
        apellido: existingRow[2] || "",
        colegio: existingRow[3] || "WS",
        email: existingRow[5] || "",
        telefono: existingRow[6] || "",
        esNuevo: false,
      });
    }

    // Encontrar ultima fila con dato real (col A = Nro numerico)
    let lastDataSheetRow = 1;
    for (let i = 1; i < rows.length; i++) {
      const nro = (rows[i][0] || "").toString().trim();
      if (nro && !isNaN(Number(nro))) {
        lastDataSheetRow = i + 1; // 1-based sheet row
      }
    }
    const targetRow = lastDataSheetRow + 1;

    // Calcular siguiente Nro como maximo existente + 1
    const dataRows = rows.slice(1).filter(r => {
      const nro = (r[0] || "").toString().trim();
      return nro && !isNaN(Number(nro));
    });
    const maxNro = dataRows.reduce((max, r) => Math.max(max, Number(r[0]) || 0), 0);
    const nextNro = maxNro + 1;

    const apellidoStr = (apellido || "").trim();
    const idCliente = apellidoStr
      ? `WS${nextNro}-${apellidoStr}-${nombre}`
      : `WS${nextNro}--${nombre}`;

    const newRow = [
      nextNro,
      nombre,
      apellidoStr,
      "WS",
      idCliente,
      email,
      telefono || "",
      // H, I: formulas del sheet, no se escriben
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `'Clientes'!A${targetRow}:G${targetRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [newRow] },
    });

    res.json({
      codigo: idCliente,
      nro: nextNro,
      nombre,
      apellido: apellidoStr,
      colegio: "WS",
      email,
      telefono: telefono || "",
      esNuevo: true,
    });

  } catch (err) {
    console.error("Error check-or-create:", err);
    res.status(500).json({ error: err.message });
  }
};

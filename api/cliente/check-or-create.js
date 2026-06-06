// POST /api/cliente/check-or-create
// Body: { nombre, apellido, email, telefono }
// Verifica si el cliente existe por email, si no existe lo crea con código autoincrementado
// Devuelve: { codigo, nombre, apellido, email, telefono, esNuevo: boolean }

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
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  try {
    const { nombre, apellido, email, telefono } = req.body;

    if (!nombre || !apellido || !email) {
      return res.status(400).json({ error: "Faltan datos requeridos (nombre, apellido, email)" });
    }

    const sheets = google.sheets({ version: "v4", auth: makeAuth() });

    // 1. Leer la sheet "14 Clientes"
    const clientesResult = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "'14 Clientes'!A:E",
    });

    const rows = clientesResult.data.values || [];
    const headerRow = rows[0] || ["Código", "Apellido", "Nombre", "Email", "Teléfono"];

    // 2. Buscar si el cliente ya existe por email (columna D = email)
    const existingRow = rows.findIndex((r, i) => i > 0 && r[3] === email);

    if (existingRow >= 0) {
      // Cliente ya existe
      const existingClient = rows[existingRow];
      return res.json({
        codigo: existingClient[0],
        apellido: existingClient[1],
        nombre: existingClient[2],
        email: existingClient[3],
        telefono: existingClient[4] || "",
        esNuevo: false,
      });
    }

    // 3. Si no existe, generar nuevo código (WS001, WS002, etc.)
    let nextCode = "WS001";
    if (rows.length > 1) {
      const codes = rows.slice(1).map(r => r[0]).filter(c => c && c.startsWith("WS"));
      const numbers = codes.map(c => parseInt(c.slice(2)) || 0);
      const maxNum = Math.max(...numbers, 0);
      nextCode = `WS${String(maxNum + 1).padStart(3, "0")}`;
    }

    // 4. Crear nuevo cliente
    const newClientRow = [nextCode, apellido, nombre, email, telefono || ""];
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "'14 Clientes'!A:E",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [newClientRow] },
    });

    res.json({
      codigo: nextCode,
      apellido,
      nombre,
      email,
      telefono: telefono || "",
      esNuevo: true,
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: err.message });
  }
};

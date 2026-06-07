// POST /api/cliente/check-or-create
// Body: { nombre, apellido, email, telefono }
//
// Estructura "14 Clientes":
//   A (0): Nro          (001, 002…)
//   B (1): Nombre       (nombre de pila)
//   C (2): Familia      (apellido de familia)
//   D (3): Colegio      (siempre "WS")
//   E (4): ID           (WS001-Apellido-Nombre)
//   F (5): Email
//   G (6): WhatsApp
//   H (7): Monto Comprado  → fórmula del sheet, no la escribimos
//   I, J : Monto Comprado / Adeudado → fórmulas del sheet, no las escribimos
//
// Si el email ya existe → devuelve el cliente existente sin crear uno nuevo.
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
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  try {
    const { nombre, apellido, email, telefono } = req.body;

    if (!nombre || !apellido || !email) {
      return res.status(400).json({ error: "Faltan datos requeridos (nombre, apellido, email)" });
    }

    const sheets = google.sheets({ version: "v4", auth: makeAuth() });

    // Leer columnas A:H (I y J son fórmulas del sheet)
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "'14 Clientes'!A:H",
    });

    const rows = result.data.values || [];
    const dataRows = rows.slice(1).filter(r => r && r.length > 0);

    // ── Buscar cliente existente por email (columna F = índice 5) ─────────────
    const existingRow = dataRows.find(r => (r[5] || "").trim() === email.trim());

    if (existingRow) {
      // Cliente ya existe → usar su ID sin crear uno nuevo
      return res.json({
        codigo: existingRow[4] || "",  // E = ID (WS001-Apellido-Nombre)
        nro: existingRow[0] || "",
        nombre: existingRow[1] || "",
        apellido: existingRow[2] || "",
        colegio: existingRow[3] || "WS",
        email: existingRow[5] || "",
        telefono: existingRow[6] || "",
        esNuevo: false,
      });
    }

    // ── Generar nuevo Nro y código ────────────────────────────────────────────
    const nextNro = dataRows.length + 1;
    const nroStr = String(nextNro).padStart(3, "0");

    // Robustez: tomar el máximo número WS ya usado en columna E
    const wsNums = dataRows
      .map(r => r[4] || "")
      .filter(id => id.startsWith("WS"))
      .map(id => parseInt(id.replace(/^WS(\d+).*/, "$1")) || 0);
    const maxWs = wsNums.length ? Math.max(...wsNums) : 0;
    const codeNum = Math.max(nextNro, maxWs + 1);
    const codeStr = String(codeNum).padStart(3, "0");

    // ID → WS001-Apellido-Nombre
    const idCliente = `WS${codeStr}-${apellido}-${nombre}`;

    // ── Escribir nueva fila ───────────────────────────────────────────────────
    const newRow = [
      nroStr,          // A: Nro
      nombre,          // B: Nombre
      apellido,        // C: Familia
      "WS",            // D: Colegio
      idCliente,       // E: ID
      email,           // F: Email
      telefono || "",  // G: WhatsApp
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "'14 Clientes'!A:G",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [newRow] },
    });

    res.json({
      codigo: idCliente,
      nro: nroStr,
      nombre,
      apellido,
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

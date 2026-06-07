// POST /api/cliente/check-or-create
// Body: { nombre, apellido, email, telefono }
//
// Estructura "14 Clientes":
//   A: Nro        (001, 002…)
//   B: Nombre     (nombre de pila)
//   C: Familia    (apellido de familia)
//   D: Colegio    (siempre "WS" para Wellspring)
//   E: Tr         (vacío — para uso futuro)
//   F: ID         (WS001-Apellido-Nombre)
//   G: Email
//   H: WhatsApp   (teléfono)
//   I: Monto Comprado  ← fórmula del sheet, no la escribimos
//   J: Monto Adeudado  ← fórmula del sheet, no la escribimos
//
// Devuelve: { codigo, nombre, apellido, email, telefono, esNuevo }

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

    // Leer columnas A:H (no tocamos I y J que son fórmulas del sheet)
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "'14 Clientes'!A:H",
    });

    const rows = result.data.values || [];
    // Fila 0 = encabezados, datos desde fila 1
    const dataRows = rows.slice(1).filter(r => r && r.length > 0);

    // Buscar cliente existente por email (columna G = índice 6)
    const existingRow = dataRows.find(r => r[6] === email);

    if (existingRow) {
      // Cliente ya existe — devolver sus datos
      return res.json({
        codigo: existingRow[5] || "",  // F = ID (ej: WS001-Gonzalez-Maria)
        nro: existingRow[0] || "",
        nombre: existingRow[1] || "",
        apellido: existingRow[2] || "",
        colegio: existingRow[3] || "WS",
        email: existingRow[6] || "",
        telefono: existingRow[7] || "",
        esNuevo: false,
      });
    }

    // ── Generar nuevo Nro y código ────────────────────────────────────────────
    // Nro = cantidad de clientes existentes + 1, formateado como "001"
    const nextNro = dataRows.length + 1;
    const nroStr = String(nextNro).padStart(3, "0");

    // También inferir el máximo de códigos WS existentes para robustez
    const wsNums = dataRows
      .map(r => r[5] || "")                          // columna F = ID
      .filter(id => id.startsWith("WS"))
      .map(id => parseInt(id.slice(2)) || 0);
    const maxWs = wsNums.length ? Math.max(...wsNums) : 0;
    const codeNum = Math.max(nextNro, maxWs + 1);
    const codeStr = String(codeNum).padStart(3, "0");

    // ID formato: WS001-Apellido-Nombre
    const idCliente = `WS${codeStr}-${apellido}-${nombre}`;

    // ── Escribir nueva fila ───────────────────────────────────────────────────
    const newRow = [
      nroStr,       // A: Nro
      nombre,       // B: Nombre
      apellido,     // C: Familia
      "WS",         // D: Colegio
      "",           // E: Tr (vacío)
      idCliente,    // F: ID
      email,        // G: Email
      telefono || "", // H: WhatsApp
      // I y J: Monto Comprado / Adeudado → fórmulas del sheet, no las escribimos
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "'14 Clientes'!A:H",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [newRow] },
    });

    res.json({
      codigo: idCliente,   // WS001-Apellido-Nombre
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

// GET /api/validate-code?code=XXXX
// Valida un código de descuento en la hoja "Codigos"
// Columnas: Codigo | Descuento% | Usos_max | Usos_actuales | Activo | Valido_hasta

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
  res.setHeader("Cache-Control", "no-store");

  const code = (req.query.code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ valid: false, error: "Código vacío" });

  try {
    const sheets = google.sheets({ version: "v4", auth: makeAuth() });
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "Codigos!A2:F200",
      valueRenderOption: "UNFORMATTED_VALUE",
    });

    const rows = result.data.values || [];
    const row  = rows.find(r => String(r[0] || "").trim().toUpperCase() === code);

    if (!row) return res.json({ valid: false, error: "Código no encontrado" });

    const [, descPct, usosMax, usosActuales, activo, validoHasta] = row;

    if (String(activo).toUpperCase() !== "SI")
      return res.json({ valid: false, error: "Código inactivo" });

    if (usosMax > 0 && usosActuales >= usosMax)
      return res.json({ valid: false, error: "Código agotado" });

    if (validoHasta) {
      const [d, m, y] = String(validoHasta).split("/");
      const expiry = new Date(`${y}-${m}-${d}T23:59:59-03:00`);
      if (expiry < new Date())
        return res.json({ valid: false, error: "Código vencido" });
    }

    res.json({ valid: true, descuento: Number(descPct) || 0, codigo: row[0] });
  } catch (err) {
    console.error("Error validando código:", err);
    res.status(500).json({ valid: false, error: err.message });
  }
};

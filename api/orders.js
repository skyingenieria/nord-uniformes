// POST /api/orders — guarda una orden en la hoja "Órdenes" del ERP
// Body esperado: { nombre, apellido, email, telefono, items, subtotal,
//                  descuento, codigo, total, pago, envio,
//                  direccion, cp, localidad }

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

function generateOrderId() {
  const ts  = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `ORD-${ts}-${rnd}`;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")    return res.status(405).json({ error: "Método no permitido" });

  try {
    const {
      nombre, apellido, email, telefono,
      items, subtotal, descuento = 0, codigo = "",
      total, pago, envio,
      direccion = "", cp = "", localidad = "",
    } = req.body;

    const orderId = generateOrderId();
    const fecha   = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

    const sheets = google.sheets({ version: "v4", auth: makeAuth() });

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "Órdenes!A:Q",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          orderId, fecha, nombre, apellido, email, telefono,
          JSON.stringify(items),
          subtotal, descuento, codigo, total,
          pago, envio, direccion, cp, localidad,
          "pendiente",
        ]],
      },
    });

    res.status(200).json({ orderId, fecha });
  } catch (err) {
    console.error("Error guardando orden:", err);
    res.status(500).json({ error: err.message });
  }
};

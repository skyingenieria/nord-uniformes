// POST /api/nave/webhook — recibe notificaciones de Nave sobre pagos
// Nave envía: { payment_id, payment_check_url, external_payment_id }
// Nosotros verificamos el estado en payment_check_url y actualizamos Sheets

const { google } = require("googleapis");
const getAccessToken = require("./auth");

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

async function getPaymentStatus(payment_check_url, token) {
  const r = await fetch(payment_check_url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Failed to check payment: ${r.status}`);
  return r.json();
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { payment_id, payment_check_url, external_payment_id } = req.body;

    // 1. Verificar estado del pago en Nave
    const token = await getAccessToken();
    const paymentData = await getPaymentStatus(payment_check_url, token);
    const status = paymentData.status?.name; // APPROVED, REJECTED, CANCELLED, REFUNDED

    // 2. Mapear estado Nave -> estado Sheets
    let sheetStatus = "pendiente";
    if (status === "APPROVED") sheetStatus = "confirmada";
    else if (status === "REJECTED" || status === "CANCELLED") sheetStatus = "cancelada";

    // 3. Actualizar estado en Sheets
    const sheets = google.sheets({ version: "v4", auth: makeAuth() });
    const ordersResult = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "Órdenes!A:Q",
    });

    const rows = ordersResult.data.values || [];
    const rowIdx = rows.findIndex(r => r[0] === external_payment_id);

    if (rowIdx >= 0) {
      // Actualizar estado (columna Q, índice 16)
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `Órdenes!Q${rowIdx + 1}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[sheetStatus]] },
      });

      console.log(`Orden ${external_payment_id} actualizada a ${sheetStatus}`);
    }

    // 4. Responder a Nave con 200 OK
    res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    // Responder con 200 igual para que Nave no reintente
    res.status(200).json({ error: err.message });
  }
};

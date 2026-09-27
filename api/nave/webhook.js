// POST /api/nave/webhook — recibe notificaciones de Nave sobre pagos
// Nave envía: { payment_id, payment_check_url, external_payment_id }
// Nosotros verificamos el estado en payment_check_url y actualizamos Sheets

const { google } = require("googleapis");
const getAccessToken = require("./_auth");
const { supabase } = require("../_supabase");

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

// carrito-beta.html (Supabase) manda el id del pedido (uuid) como orderId a
// Nave en vez del "YY-NN" de Sheets — así nunca compiten por el mismo
// espacio de IDs. Si external_payment_id tiene forma de uuid, es un pedido
// de Supabase: se registra el pago en 006_pagos y se actualiza estado_pago
// en 004_pedidos, en vez de tocar la hoja 'Ordenes'.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function actualizarPagoSupabase(pedidoId, sheetStatus) {
  const sb = supabase();
  if (sheetStatus === "confirmada") {
    const { data: pedido, error: eP } = await sb.from("104_pedidos_con_saldo").select("total_venta").eq("id", pedidoId).maybeSingle();
    if (eP) throw eP;
    if (pedido) {
      await sb.from("006_pagos").insert({
        pedido_id: pedidoId, monto: pedido.total_venta, forma_pago: "Tarjeta (Nave)", fecha: new Date().toISOString().slice(0, 10),
      });
    }
    await sb.from("004_pedidos").update({ estado_pago: "Confirmada" }).eq("id", pedidoId);
  } else if (sheetStatus === "cancelada") {
    await sb.from("004_pedidos").update({ estado_pago: "Cancelada" }).eq("id", pedidoId);
  }
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

    // 2b. Pedido de Supabase (carrito-beta.html) en vez de Sheets: se detecta
    // porque el orderId que le pasamos a Nave fue un uuid, no un "YY-NN".
    if (UUID_RE.test(String(external_payment_id || ""))) {
      await actualizarPagoSupabase(external_payment_id, sheetStatus);
      console.log(`Pedido Supabase ${external_payment_id}: estado_pago -> ${sheetStatus}`);
      return res.status(200).json({ received: true });
    }

    // 3. Actualizar estado en Sheets
    const sheets = google.sheets({ version: "v4", auth: makeAuth() });
    const ordersResult = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "'Ordenes'!A:Q",
    });

    const rows = ordersResult.data.values || [];
    // Columna B (índice 1) = idPedido. Puede haber varias filas por pedido (una por item)
    const matchingRows = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => String(r[1] || "").trim() === String(external_payment_id).trim());

    for (const { i } of matchingRows) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `'Ordenes'!Q${i + 1}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[sheetStatus]] },
      });
    }

    console.log(`Orden ${external_payment_id}: ${matchingRows.length} fila(s) actualizadas a ${sheetStatus}`);

    // 4. Responder a Nave con 200 OK
    res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    // Responder con 200 igual para que Nave no reintente
    res.status(200).json({ error: err.message });
  }
};

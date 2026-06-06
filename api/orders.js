// POST /api/orders — guarda orden en "7 Órdenes" (detallado) y "3 Pedidos" (consolidado)
// Body: { idPedido, codigoCliente, nombre, apellido, email, telefono, items,
//         subtotal, descuento, codigo, total, pago, envio, direccion, cp, localidad }

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
    const {
      idPedido, codigoCliente,
      nombre, apellido, email, telefono,
      items, subtotal, descuento = 0, codigo = "",
      total, pago, envio,
      direccion = "", cp = "", localidad = "",
    } = req.body;

    if (!idPedido || !codigoCliente) {
      return res.status(400).json({ error: "Faltan idPedido o codigoCliente" });
    }

    const fecha = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
    const sheets = google.sheets({ version: "v4", auth: makeAuth() });
    const cantPrendas = items.reduce((sum, i) => sum + (i.qty || 0), 0);

    // 1. Guardar en "7 Órdenes" (DETALLES)
    const orden7Ordenes = [
      idPedido,           // A: ID Pedido
      codigoCliente,      // B: Código Cliente
      fecha,              // C: Fecha
      nombre,             // D: Nombre
      apellido,           // E: Apellido
      email,              // F: Email
      telefono,           // G: Teléfono
      JSON.stringify(items), // H: Items (JSON)
      subtotal,           // I: Subtotal
      descuento,          // J: Descuento
      codigo,             // K: Código descuento
      total,              // L: Total
      pago,               // M: Forma de pago
      envio,              // N: Método envío
      direccion,          // O: Dirección
      cp,                 // P: CP
      localidad,          // Q: Localidad
      "pendiente",        // R: Estado (pendiente/confirmada/cancelada)
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "'7 Órdenes'!A:R",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [orden7Ordenes] },
    });

    // 2. Guardar en "3 Pedidos" (RESUMEN CONSOLIDADO)
    const montoPago = pago === "nave" ? total : 0; // Nave: pago confirmado; Transferencia: 0 hasta que se confirme
    const saldo = total - montoPago;
    const estadoPedido = pago === "nave" ? "Confirmado" : "Al Cobro"; // Nave confirmado, Transferencia al cobro

    const clienteLabel = `${codigoCliente}-${apellido}-${nombre}`;
    const orden3Pedidos = [
      idPedido,           // A: ID Pedido
      clienteLabel,       // B: Cliente (Código-Apellido-Nombre)
      cantPrendas,        // C: Cant. Prendas
      subtotal,           // D: Monto Pedido
      pago === "nave" ? "Nave" : "Transferencia", // E: Forma de pago
      montoPago,          // F: Monto Pago
      saldo,              // G: Saldo
      estadoPedido,       // H: Estado
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "'3 Pedidos'!A:H",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [orden3Pedidos] },
    });

    res.status(200).json({
      idPedido,
      codigoCliente,
      fecha,
      success: true,
    });
  } catch (err) {
    console.error("Error guardando orden:", err);
    res.status(500).json({ error: err.message });
  }
};

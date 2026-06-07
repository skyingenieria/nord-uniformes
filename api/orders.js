// POST /api/orders — guarda la orden en "7 Ordenes" y "3 Pedidos"
//
// "7 Ordenes" (Ventas_2) — UNA FILA POR ITEM:
//   A: Fecha       (MM/DD/YYYY)
//   B: Pedido      (YY-XX, ej: 26-01)
//   C: Colegio     (WS)
//   D: Cliente     (ID del cliente, ej: WS001-Gonzalez-Maria)
//   E: Forma pago  (Transf. Banc.)
//   F: Prenda      (nombre de la prenda)
//   G: Talle
//   H: SKU         (fórmula del sheet — NO TOCAR, se deja vacío)
//   I: Cant        (cantidad)
//   J en adelante: fórmulas del sheet (Costo, Precio, etc.) — NO TOCAR
//
// "3 Pedidos" — UNA FILA POR PEDIDO (resumen consolidado):
//   A: ID Pedido  B: Cliente  C: Cant. Prendas  D: Total
//   E: Forma pago  F: Estado
//
// Body: { idPedido, codigoCliente, nombre, apellido, email, telefono,
//         items:[{nombre,talle,qty,precio}], subtotal, total, pago, envio }

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
      nombre, apellido,
      items = [],
      subtotal = 0, total = 0,
      pago = "transferencia",
    } = req.body;

    if (!idPedido || !codigoCliente) {
      return res.status(400).json({ error: "Faltan idPedido o codigoCliente" });
    }
    if (!items.length) {
      return res.status(400).json({ error: "El pedido no tiene items" });
    }

    const sheets = google.sheets({ version: "v4", auth: makeAuth() });

    // Fecha en formato MM/DD/YYYY (como muestra el sheet)
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const fecha = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;

    const formaPago = "Transf. Banc.";
    const colegio   = "WS";

    // ── 1. "7 Ordenes": una fila por item ────────────────────────────────────
    const filas7Ordenes = items.map(item => [
      fecha,           // A: Fecha
      idPedido,        // B: Pedido
      colegio,         // C: Colegio
      codigoCliente,   // D: Cliente (ID completo)
      formaPago,       // E: Forma de pago
      item.nombre,     // F: Prenda
      item.talle,      // G: Talle
      "",              // H: SKU — fórmula del sheet, se deja vacío
      item.qty || 1,   // I: Cant
      // J en adelante = fórmulas del sheet (Costo, Precio...), NO se escriben
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "'7 Ordenes'!A:I",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: filas7Ordenes },
    });

    // ── 2. "3 Pedidos": una fila resumen por pedido ───────────────────────────
    const cantPrendas = items.reduce((s, i) => s + (i.qty || 1), 0);
    const fila3Pedidos = [
      idPedido,          // A: ID Pedido
      codigoCliente,     // B: Cliente
      cantPrendas,       // C: Cant. Prendas
      total,             // D: Total
      formaPago,         // E: Forma de pago
      "Al Cobro",        // F: Estado (transferencia = pendiente de confirmación)
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "'3 Pedidos'!A:F",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [fila3Pedidos] },
    });

    res.status(200).json({ idPedido, codigoCliente, fecha, itemsGuardados: items.length, success: true });

  } catch (err) {
    console.error("Error guardando orden:", err);
    res.status(500).json({ error: err.message });
  }
};

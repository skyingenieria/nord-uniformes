// POST /api/orders — guarda la orden en "Ordenes"
//
// "Ordenes" — UNA FILA POR ITEM (solo se escriben A:H):
//   A: Fecha       (M/D/YYYY)
//   B: Pedido      (YY-XX, ej: 26-01)
//   C: Colegio     (WS)
//   D: Cliente     (ID del cliente, ej: WS2-Luzuriaga-Maria Victoria)
//   E: Forma pago  (Transf. Banc.)
//   F: Prenda      (nombre de la prenda)
//   G: Talle
//   H: Cant        (cantidad)
//   I en adelante: formulas del sheet — no se escriben
//
// "Pedidos" y "Clientes": no se escriben, son formula-driven desde Ordenes.
//
// Body: { idPedido, codigoCliente, items:[{nombre,talle,qty}], pago }

const { google } = require("googleapis");

function makeAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY
        ?.replace(/\n/g, "\n").replace(/^"/, "").replace(/"$/, ""),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

// Devuelve el numero de fila del sheet (1-based) donde insertar el proximo dato.
async function findNextRow(sheets, sheetName, colLetter, isRealRow) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `'${sheetName}'!${colLetter}:${colLetter}`,
  });
  const rows = res.data.values || [];
  let lastDataSheetRow = 1; // row 1 = header
  for (let i = 1; i < rows.length; i++) {
    const val = (rows[i][0] || "").toString().trim();
    if (isRealRow(val)) {
      lastDataSheetRow = i + 1; // 1-based
    }
  }
  return lastDataSheetRow + 1;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo no permitido" });

  try {
    const {
      idPedido, codigoCliente,
      items = [],
      pago = "transferencia",
    } = req.body;

    if (!idPedido || !codigoCliente) {
      return res.status(400).json({ error: "Faltan idPedido o codigoCliente" });
    }
    if (!items.length) {
      return res.status(400).json({ error: "El pedido no tiene items" });
    }

    const sheets = google.sheets({ version: "v4", auth: makeAuth() });

    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const fecha = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
    const formaPago = "Transf. Banc.";
    const colegio = "WS";

    // Primera fila disponible en Ordenes (col A = Fecha)
    const nextOrdenRow = await findNextRow(sheets, "Ordenes", "A", val => val.length > 0);

    // ── "Ordenes": una fila por item, solo A:H ───────────────────────────────
    const filasOrdenes = items.map(item => [
      fecha,           // A: Fecha
      idPedido,        // B: Pedido
      colegio,         // C: Colegio
      codigoCliente,   // D: Cliente
      formaPago,       // E: Forma de pago
      item.nombre,     // F: Prenda
      item.talle,      // G: Talle
      item.qty || 1,   // H: Cant
      // I en adelante: formulas del sheet, no se escriben
    ]);

    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `'Ordenes'!A${nextOrdenRow}:H${nextOrdenRow + filasOrdenes.length - 1}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: filasOrdenes },
    });

    res.status(200).json({ idPedido, codigoCliente, fecha, itemsGuardados: items.length, success: true });

  } catch (err) {
    console.error("Error guardando orden:", err);
    res.status(500).json({ error: err.message });
  }
};

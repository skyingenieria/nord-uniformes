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
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo no permitido" });

  try {
    const {
      idPedido, codigoCliente,
      items = [],
      envio = 0,
    } = req.body;

    if (!idPedido || !codigoCliente) {
      return res.status(400).json({ error: "Faltan idPedido o codigoCliente" });
    }
    if (!items.length) {
      return res.status(400).json({ error: "El pedido no tiene items" });
    }

    const sheets = google.sheets({ version: "v4", auth: makeAuth() });
    const spreadsheetId = process.env.SPREADSHEET_ID;

    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const fecha = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;

    const filasOrdenes = items.map(item => [
      fecha,
      idPedido,
      "WS",
      codigoCliente,
      "Transf. Banc.",
      item.nombre,
      item.talle,
      item.qty || 1,
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "'Ordenes'!A:H",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "OVERWRITE",
      requestBody: { values: filasOrdenes },
    });

    // Cargo de envío: se registra en la col F "Cargo Envio" de la fila del pedido
    // en la hoja 'Pedidos' (que se genera sola por fórmula tras el append). Escritura
    // segura: no pisa la celda si tiene fórmula, y nunca bloquea la venta si falla.
    const envioNum = Number(envio) || 0;
    let envioRegistrado = false;
    if (envioNum > 0) {
      try {
        const idsRes = await sheets.spreadsheets.values.get({
          spreadsheetId, range: "'Pedidos'!A:A",
        });
        const ids = idsRes.data.values || [];
        let rowNumber = -1;
        for (let i = 1; i < ids.length; i++) {
          if (String(ids[i][0] || "").trim() === idPedido) { rowNumber = i + 1; break; }
        }
        if (rowNumber > 0) {
          const cellRes = await sheets.spreadsheets.values.get({
            spreadsheetId, range: `'Pedidos'!F${rowNumber}`, valueRenderOption: "FORMULA",
          });
          const cur = (cellRes.data.values?.[0]?.[0]) ?? "";
          if (!(typeof cur === "string" && cur.trim().startsWith("="))) {
            await sheets.spreadsheets.values.update({
              spreadsheetId, range: `'Pedidos'!F${rowNumber}`,
              valueInputOption: "USER_ENTERED", requestBody: { values: [[envioNum]] },
            });
            envioRegistrado = true;
          }
        }
      } catch (e) {
        console.error("No se pudo registrar el cargo de envío:", e.message);
      }
    }

    res.status(200).json({ idPedido, codigoCliente, fecha, itemsGuardados: items.length, envio: envioNum, envioRegistrado, success: true });

  } catch (err) {
    console.error("Error guardando orden:", err);
    res.status(500).json({ error: err.message });
  }
};

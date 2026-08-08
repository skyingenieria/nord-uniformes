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

    // Envío: se registra como una fila más "Envío". Su precio NO puede salir del
    // INDEX por nombre de la col J (precio variable por venta), así que se escribe
    // directo en la col R en un segundo paso, sin tocar la col J.
    const envioNum = Number(envio) || 0;
    if (envioNum > 0) {
      filasOrdenes.push([
        fecha,
        idPedido,
        "WS",
        codigoCliente,
        "Transf. Banc.",
        "Envío",
        "-",
        1,
      ]);
    }

    const appendResp = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "'Ordenes'!A:H",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "OVERWRITE",
      requestBody: { values: filasOrdenes },
    });

    // Escribir el precio del envío en la col R de la fila recién agregada (la última).
    if (envioNum > 0) {
      const updatedRange = appendResp.data.updates?.updatedRange || "";
      const lastCell = updatedRange.split(":").pop() || "";
      const lastRow = parseInt((lastCell.match(/(\d+)/) || [])[1]);
      if (lastRow) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `'Ordenes'!R${lastRow}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[envioNum]] },
        });
      }
    }

    res.status(200).json({ idPedido, codigoCliente, fecha, itemsGuardados: items.length, envio: envioNum, success: true });

  } catch (err) {
    console.error("Error guardando orden:", err);
    res.status(500).json({ error: err.message });
  }
};

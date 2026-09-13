// POST /api/arca/facturar — emite una Factura C (Monotributo) por WSFE.
// Header: Authorization: Bearer <token admin>
// Body: { docTipo, docNro, importe, concepto?, nombre?, idPedido? }
//   docTipo: 80=CUIT, 96=DNI, 99=Consumidor Final (docNro=0)
// Devuelve: { ok, factura: { cae, caeVto, cbteNro, ptoVta, ... } }

const { faltanCredenciales, emitirFacturaC, verifyToken } = require("./_client");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")    return res.status(405).json({ ok: false, error: "Method not allowed" });

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!verifyToken(token)) return res.status(401).json({ ok: false, error: "No autorizado" });

  const faltan = faltanCredenciales();
  if (faltan.length) {
    return res.status(400).json({ ok: false, error: "Faltan credenciales de ARCA en Vercel: " + faltan.join(", ") });
  }

  const body = req.body || {};
  const importe = Number(body.importe);
  const docTipo = parseInt(body.docTipo || 99, 10);

  if (!importe || importe <= 0) {
    return res.status(400).json({ ok: false, error: "Importe inválido" });
  }
  if (docTipo !== 99 && !String(body.docNro || "").replace(/\D/g, "")) {
    return res.status(400).json({ ok: false, error: "Falta el número de documento del receptor" });
  }

  try {
    const factura = await emitirFacturaC({
      docTipo,
      docNro: body.docNro,
      importe,
      concepto: body.concepto || 1,
    });
    return res.json({ ok: true, factura });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e.message });
  }
};

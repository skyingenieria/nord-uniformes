// /api/arca — integración con ARCA (ex-AFIP) para Factura C (Monotributo).
//   GET  /api/arca  → estado (credenciales, conectividad, login WSAA)
//   POST /api/arca  → emite Factura C. Body: { docTipo, docNro, importe, concepto? }
// Header: Authorization: Bearer <token admin>
// (Un solo endpoint para respetar el límite de funciones serverless del plan.)

const { cfg, faltanCredenciales, dummy, getTA, emitirFacturaC, verifyToken } = require("./_client");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!verifyToken(token)) return res.status(401).json({ ok: false, error: "No autorizado" });

  if (req.method === "GET")  return estado(res);
  if (req.method === "POST") return facturar(req, res);
  return res.status(405).json({ ok: false, error: "Method not allowed" });
};

async function estado(res) {
  const c = cfg();
  const faltan = faltanCredenciales();
  const out = {
    ok: true, entorno: c.env, ptoVta: c.ptoVta,
    cuit: c.cuit ? c.cuit.slice(0, 2) + "…" + c.cuit.slice(-2) : null,
    credenciales: faltan.length === 0, faltan,
    conectividad: null, certificadoOk: null, detalle: null,
  };
  if (faltan.length) {
    out.detalle = "Faltan variables de entorno en Vercel: " + faltan.join(", ");
    return res.json(out);
  }
  try { out.conectividad = await dummy(); }
  catch (e) { out.detalle = "Sin conectividad con WSFE: " + e.message; return res.json(out); }
  try {
    await getTA();
    out.certificadoOk = true;
    out.detalle = "Todo OK: credenciales y certificado válidos en " + c.env + ".";
  } catch (e) {
    out.certificadoOk = false;
    out.detalle = "Certificado / login WSAA falló: " + e.message;
  }
  return res.json(out);
}

async function facturar(req, res) {
  const faltan = faltanCredenciales();
  if (faltan.length) return res.status(400).json({ ok: false, error: "Faltan credenciales de ARCA en Vercel: " + faltan.join(", ") });

  const body = req.body || {};
  const importe = Number(body.importe);
  const docTipo = parseInt(body.docTipo || 99, 10);
  if (!importe || importe <= 0) return res.status(400).json({ ok: false, error: "Importe inválido" });
  if (docTipo !== 99 && !String(body.docNro || "").replace(/\D/g, "")) {
    return res.status(400).json({ ok: false, error: "Falta el número de documento del receptor" });
  }
  try {
    const factura = await emitirFacturaC({ docTipo, docNro: body.docNro, importe, concepto: body.concepto || 1 });
    return res.json({ ok: true, factura });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e.message });
  }
}

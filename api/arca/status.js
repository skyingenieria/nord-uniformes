// GET /api/arca/status — estado de la integración con ARCA.
// Header: Authorization: Bearer <token admin>
// Devuelve: credenciales presentes, entorno, ping FEDummy y validación del certificado (login WSAA).

const { cfg, faltanCredenciales, dummy, getTA, verifyToken } = require("./_client");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")     return res.status(405).json({ ok: false, error: "Method not allowed" });

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!verifyToken(token)) return res.status(401).json({ ok: false, error: "No autorizado" });

  const c = cfg();
  const faltan = faltanCredenciales();
  const out = {
    ok: true,
    entorno: c.env,
    ptoVta: c.ptoVta,
    cuit: c.cuit ? c.cuit.slice(0, 2) + "…" + c.cuit.slice(-2) : null,
    credenciales: faltan.length === 0,
    faltan,
    conectividad: null,
    certificadoOk: null,
    detalle: null,
  };

  if (faltan.length) {
    out.detalle = "Faltan cargar variables de entorno en Vercel: " + faltan.join(", ");
    return res.json(out);
  }

  try {
    out.conectividad = await dummy(); // ping FEDummy (servers up)
  } catch (e) {
    out.detalle = "Sin conectividad con WSFE: " + e.message;
    return res.json(out);
  }

  try {
    await getTA(); // valida cert + key + autorización a wsfe
    out.certificadoOk = true;
    out.detalle = "Todo OK: credenciales y certificado válidos en " + c.env + ".";
  } catch (e) {
    out.certificadoOk = false;
    out.detalle = "Certificado/login WSAA falló: " + e.message;
  }

  return res.json(out);
};

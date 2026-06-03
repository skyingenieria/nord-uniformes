// POST /api/admin/auth — valida la contraseña y devuelve un token simple
// Body: { password }

const crypto = require("crypto");

module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).end();

  const { password } = req.body || {};
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected) return res.status(500).json({ ok: false, error: "ADMIN_PASSWORD no configurado" });
  if (password !== expected) return res.status(401).json({ ok: false, error: "Contraseña incorrecta" });

  // Token = HMAC(timestamp, ADMIN_PASSWORD) — válido 8hs
  const ts    = Math.floor(Date.now() / (1000 * 60 * 60 * 8)); // cambia cada 8hs
  const token = crypto.createHmac("sha256", expected).update(String(ts)).digest("hex");

  res.json({ ok: true, token });
};

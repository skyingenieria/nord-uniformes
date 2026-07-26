// GET /api/nave/warmup — pre-calienta el token de auth para reducir latencia
const getAccessToken = require("./auth");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    await getAccessToken();
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
};

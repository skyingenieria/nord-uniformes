// GET access token de Nave (con cache de 24hs)
// Sandbox: https://homoservices.apinaranja.com/security-ms/api/security/auth0/b2b/m2msPrivate

const CACHE_KEY = "nave_access_token";
const CACHE_TTL = 86400 * 1000; // 24 horas

let cachedToken = { token: null, expiresAt: 0 };

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken.token && now < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const url = process.env.NAVE_ENV === "prod"
    ? "https://services.apinaranja.com/security-ms/api/security/auth0/b2b/m2msPrivate"
    : "https://homoservices.apinaranja.com/security-ms/api/security/auth0/b2b/m2msPrivate";

  const body = {
    client_id: process.env.NAVE_CLIENT_ID,
    client_secret: process.env.NAVE_CLIENT_SECRET,
    audience: "https://naranja.com/ranty/merchants/api",
  };

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    throw new Error(`Nave auth failed: ${r.status} ${await r.text()}`);
  }

  const data = await r.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: now + (Number(data.expires_in) * 1000 * 0.9), // refresh 10% antes
  };

  return cachedToken.token;
}

module.exports = getAccessToken;

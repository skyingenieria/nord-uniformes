// Cliente ARCA (ex-AFIP) — WSAA (login) + WSFEv1 (factura electrónica).
// Self-hosted: usa el certificado propio desde env vars. Sin terceros.
//
// Env vars requeridas:
//   ARCA_CUIT     → CUIT del emisor (sin guiones)
//   ARCA_CERT     → certificado .crt (PEM). \n literales se normalizan.
//   ARCA_KEY      → clave privada (PEM). \n literales se normalizan.
//   ARCA_PTO_VTA  → punto de venta (ej. 1)
//   ARCA_ENV      → "homologacion" (default) | "produccion"
//
// Nota: Factura C (Monotributo) → CbteTipo 11, sin IVA (ImpIVA=0, sin array Iva).

const crypto = require("crypto");
const forge  = require("node-forge");
const https  = require("https");

// Los servidores de ARCA (AFIP) negocian con una clave Diffie-Hellman de 1024 bits
// que OpenSSL 3 rechaza por defecto ("dh key too small"). Bajamos el nivel de
// seguridad TLS SOLO para estas llamadas (se sigue verificando el certificado del
// servidor). Sin esto, fetch() falla con "fetch failed" al conectar al WSFE.
const AFIP_AGENT = new https.Agent({ ciphers: "DEFAULT@SECLEVEL=1", minVersion: "TLSv1.2" });

// POST SOAP a un endpoint de ARCA usando el agente con SECLEVEL bajo.
function afipPost(urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: "POST",
      headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
      agent: AFIP_AGENT,
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.setTimeout(25000, () => req.destroy(new Error("Timeout conectando con ARCA")));
    req.write(body);
    req.end();
  });
}

const URLS = {
  homologacion: {
    wsaa: "https://wsaahomo.afip.gob.ar/ws/services/LoginCms",
    wsfe: "https://wswhomo.afip.gob.ar/wsfev1/service.asmx",
  },
  produccion: {
    wsaa: "https://wsaa.afip.gob.ar/ws/services/LoginCms",
    wsfe: "https://servicios1.afip.gob.ar/wsfev1/service.asmx",
  },
};

function cfg() {
  const env = (process.env.ARCA_ENV || "homologacion").toLowerCase() === "produccion"
    ? "produccion" : "homologacion";
  const pem = (v) => (v || "").replace(/\\n/g, "\n").replace(/^"/, "").replace(/"$/, "").trim();
  return {
    env,
    urls: URLS[env],
    cuit: (process.env.ARCA_CUIT || "").replace(/\D/g, ""),
    cert: pem(process.env.ARCA_CERT),
    key:  pem(process.env.ARCA_KEY),
    ptoVta: parseInt(process.env.ARCA_PTO_VTA || "1", 10),
  };
}

function faltanCredenciales() {
  const c = cfg();
  const faltan = [];
  if (!c.cuit) faltan.push("ARCA_CUIT");
  if (!c.cert) faltan.push("ARCA_CERT");
  if (!c.key)  faltan.push("ARCA_KEY");
  return faltan;
}

// ── WSAA: obtener Token + Sign (TA), cacheado hasta su expiración ────────────
let _taCache = null; // { token, sign, exp: Date }

function buildTRA() {
  const now = new Date();
  const from = new Date(now.getTime() - 10 * 60 * 1000);
  const to   = new Date(now.getTime() + 10 * 60 * 1000);
  const uniqueId = Math.floor(now.getTime() / 1000);
  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
<header>
<uniqueId>${uniqueId}</uniqueId>
<generationTime>${from.toISOString()}</generationTime>
<expirationTime>${to.toISOString()}</expirationTime>
</header>
<service>wsfe</service>
</loginTicketRequest>`;
}

function signTRA(tra, certPem, keyPem) {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, "utf8");
  const cert = forge.pki.certificateFromPem(certPem);
  const key  = forge.pki.privateKeyFromPem(keyPem);
  p7.addCertificate(cert);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign({ detached: false });
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.encode64(der);
}

function unescapeXml(s) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

async function getTA() {
  if (_taCache && _taCache.exp > new Date(Date.now() + 2 * 60 * 1000)) {
    return _taCache; // TA todavía válido (margen de 2 min)
  }
  const c = cfg();
  const cms = signTRA(buildTRA(), c.cert, c.key);
  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
<soapenv:Header/>
<soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body>
</soapenv:Envelope>`;

  const xml = await afipPost(c.urls.wsaa,
    { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": "" }, soap);
  const ret = xml.match(/<loginCmsReturn>([\s\S]*?)<\/loginCmsReturn>/);
  if (!ret) {
    const fault = (xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/) || [])[1] || xml.slice(0, 500);
    throw new Error("WSAA: " + fault);
  }
  const tr = unescapeXml(ret[1]);
  const token = (tr.match(/<token>([\s\S]*?)<\/token>/) || [])[1];
  const sign  = (tr.match(/<sign>([\s\S]*?)<\/sign>/) || [])[1];
  const exp   = (tr.match(/<expirationTime>([\s\S]*?)<\/expirationTime>/) || [])[1];
  if (!token || !sign) throw new Error("WSAA: respuesta sin token/sign");

  _taCache = { token, sign, exp: exp ? new Date(exp) : new Date(Date.now() + 10 * 60 * 1000) };
  return _taCache;
}

// ── WSFE: llamadas SOAP ──────────────────────────────────────────────────────
async function wsfeCall(action, innerXml) {
  const c = cfg();
  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
<soap:Body>${innerXml}</soap:Body>
</soap:Envelope>`;
  const xml = await afipPost(c.urls.wsfe, {
    "Content-Type": "text/xml; charset=utf-8",
    "SOAPAction": `http://ar.gov.afip.dif.FEV1/${action}`,
  }, soap);
  const fault = (xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/) || [])[1];
  if (fault) throw new Error("WSFE: " + fault);
  return xml;
}

function authXml(ta, cuit) {
  return `<ar:Auth><ar:Token>${ta.token}</ar:Token><ar:Sign>${ta.sign}</ar:Sign><ar:Cuit>${cuit}</ar:Cuit></ar:Auth>`;
}

function pickErrors(xml) {
  const errs = [...xml.matchAll(/<Err>[\s\S]*?<Code>(\d+)<\/Code>[\s\S]*?<Msg>([\s\S]*?)<\/Msg>[\s\S]*?<\/Err>/g)]
    .map(m => `[${m[1]}] ${m[2]}`);
  const obs = [...xml.matchAll(/<Obs>[\s\S]*?<Code>(\d+)<\/Code>[\s\S]*?<Msg>([\s\S]*?)<\/Msg>[\s\S]*?<\/Obs>/g)]
    .map(m => `[${m[1]}] ${m[2]}`);
  return { errs, obs };
}

// Ping de conectividad (no requiere TA)
async function dummy() {
  const xml = await wsfeCall("FEDummy", `<ar:FEDummy></ar:FEDummy>`);
  return {
    appserver: (xml.match(/<AppServer>([\s\S]*?)<\/AppServer>/) || [])[1],
    dbserver:  (xml.match(/<DbServer>([\s\S]*?)<\/DbServer>/) || [])[1],
    authserver:(xml.match(/<AuthServer>([\s\S]*?)<\/AuthServer>/) || [])[1],
  };
}

async function ultimoComprobante(ta, cuit, ptoVta, cbteTipo) {
  const xml = await wsfeCall("FECompUltimoAutorizado",
    `<ar:FECompUltimoAutorizado>${authXml(ta, cuit)}<ar:PtoVta>${ptoVta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo></ar:FECompUltimoAutorizado>`);
  const nro = (xml.match(/<CbteNro>(\d+)<\/CbteNro>/) || [])[1];
  if (nro == null) {
    const { errs } = pickErrors(xml);
    throw new Error("No se pudo obtener el último comprobante. " + (errs.join("; ") || ""));
  }
  return parseInt(nro, 10);
}

// ── Emitir Factura C (Monotributo) ───────────────────────────────────────────
// data: { docTipo, docNro, importe, concepto=1 }
//   docTipo: 80=CUIT, 96=DNI, 99=Consumidor Final (docNro=0)
async function emitirFacturaC(data) {
  const c = cfg();
  const cbteTipo = 11; // Factura C
  const ta = await getTA();

  const ultimo = await ultimoComprobante(ta, c.cuit, c.ptoVta, cbteTipo);
  const nro = ultimo + 1;

  const importe = Math.round(Number(data.importe) * 100) / 100;
  const docTipo = parseInt(data.docTipo || 99, 10);
  const docNro  = docTipo === 99 ? 0 : String(data.docNro || "").replace(/\D/g, "");
  const concepto = parseInt(data.concepto || 1, 10);
  const hoy = new Date();
  const fch = `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, "0")}${String(hoy.getDate()).padStart(2, "0")}`;

  const det = `<ar:FECAEDetRequest>
<ar:Concepto>${concepto}</ar:Concepto>
<ar:DocTipo>${docTipo}</ar:DocTipo>
<ar:DocNro>${docNro}</ar:DocNro>
<ar:CbteDesde>${nro}</ar:CbteDesde>
<ar:CbteHasta>${nro}</ar:CbteHasta>
<ar:CbteFch>${fch}</ar:CbteFch>
<ar:ImpTotal>${importe.toFixed(2)}</ar:ImpTotal>
<ar:ImpTotConc>0.00</ar:ImpTotConc>
<ar:ImpNeto>${importe.toFixed(2)}</ar:ImpNeto>
<ar:ImpOpEx>0.00</ar:ImpOpEx>
<ar:ImpIVA>0.00</ar:ImpIVA>
<ar:ImpTrib>0.00</ar:ImpTrib>
<ar:MonId>PES</ar:MonId>
<ar:MonCotiz>1</ar:MonCotiz>
</ar:FECAEDetRequest>`;

  const inner = `<ar:FECAESolicitar>${authXml(ta, c.cuit)}<ar:FeCAEReq>
<ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${c.ptoVta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo></ar:FeCabReq>
<ar:FeDetReq>${det}</ar:FeDetReq>
</ar:FeCAEReq></ar:FECAESolicitar>`;

  const xml = await wsfeCall("FECAESolicitar", inner);
  const resultado = (xml.match(/<Resultado>([AR])<\/Resultado>/) || [])[1];
  const cae = (xml.match(/<CAE>([\s\S]*?)<\/CAE>/) || [])[1];
  const caeVto = (xml.match(/<CAEFchVto>([\s\S]*?)<\/CAEFchVto>/) || [])[1];
  const { errs, obs } = pickErrors(xml);

  if (resultado !== "A" || !cae) {
    throw new Error("ARCA rechazó el comprobante. " + [...errs, ...obs].join(" · "));
  }

  return {
    resultado,
    cae,
    caeVto,           // YYYYMMDD
    cbteTipo,
    cbteNro: nro,
    ptoVta: c.ptoVta,
    cuit: c.cuit,
    importe,
    fecha: fch,
    env: c.env,
    observaciones: obs,
  };
}

function verifyToken(token) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !token) return false;
  const ts    = Math.floor(Date.now() / (1000 * 60 * 60 * 8));
  const valid = crypto.createHmac("sha256", expected).update(String(ts)).digest("hex");
  return token === valid;
}

module.exports = { cfg, faltanCredenciales, getTA, dummy, ultimoComprobante, emitirFacturaC, verifyToken };

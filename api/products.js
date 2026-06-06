// Lee "6 Stock" (stock y precios) y "10 Listado de Prendas" (categorías) del ERP Nord.
// Filtra por colegio (por defecto "WS" = Wellspring), une ambas hojas por nombre de prenda.
//
// Columnas confirmadas "6 Stock" (UNFORMATTED_VALUE, 0-indexed desde A2):
//   0=Colegio  1=Prenda  2=Talle  3=Codigo  4=Stock inicial
//   5=Compras  6=Ventas  7=Stock actual  8=Costo Unit  9=Precio Unit
//
// Columnas "10 Listado de Prendas":
//   0=Colegio  1=Prenda  2=Talle  3=SKU  4=Categorias  5=Descripcion  6=Foto1  7=Foto2

const { google } = require("googleapis");

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

function makeAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY
        ?.replace(/\\n/g, "\n")
        .replace(/^"/, "").replace(/"$/, ""),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

async function fetchFromSheets(colegio = "WS") {
  const auth  = makeAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const sid   = process.env.SPREADSHEET_ID;

  // Leer ambas hojas en paralelo
  const [stockRes, catRes] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: sid,
      range: "'6 Stock'!A2:J2000",
      valueRenderOption: "UNFORMATTED_VALUE",
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId: sid,
      range: "'10 Listado de Prendas'!A2:H2000", // H = Foto2
      valueRenderOption: "FORMATTED_VALUE",
    }),
  ]);

  // ── Construir mapa de categorías: nombre → Set de categorias ──────────────
  const catMap = {}; // { "Blusa": { cats, descripcion, fotos }, ... }
  for (const row of (catRes.data.values || [])) {
    const colColegio = String(row[0] || "").trim();
    const nombre     = String(row[1] || "").trim();
    const catRaw     = String(row[4] || "").trim(); // "Primaria, Secundaria"

    if (colColegio !== colegio || !nombre) continue;

    const cats = catRaw.split(",").map(c => c.trim().toLowerCase()).filter(Boolean);
    if (!catMap[nombre]) catMap[nombre] = { cats: new Set(), descripcion: "", fotos: [] };
    cats.forEach(c => catMap[nombre].cats.add(c));

    // Descripcion: columna F (índice 5)
    const desc = String(row[5] || "").trim();
    if (desc && !catMap[nombre].descripcion) catMap[nombre].descripcion = desc;

    // Fotos: columnas G y H (índices 6 y 7)
    const foto1 = String(row[6] || "").trim();
    const foto2 = String(row[7] || "").trim();
    if (foto1 && !catMap[nombre].fotos.includes(foto1)) catMap[nombre].fotos.push(foto1);
    if (foto2 && !catMap[nombre].fotos.includes(foto2)) catMap[nombre].fotos.push(foto2);
  }

  // ── Construir productos desde stock ──────────────────────────────────────
  const productsMap = {};

  for (const row of (stockRes.data.values || [])) {
    const colegioCell = String(row[0] || "").trim();
    const nombre      = String(row[1] || "").trim();
    const talle       = String(row[2] ?? "").trim();
    const stockActual = Math.round(Number(row[7]) || 0); // columna H = Stock actual
    const precioUnit  = Math.round(Number(row[9]) || 0); // columna J = Precio Unit

    if (colegioCell !== colegio || !nombre || !talle) continue;

    if (!productsMap[nombre]) {
      const categorias  = catMap[nombre] ? [...catMap[nombre].cats] : [];
      const descripcion = catMap[nombre]?.descripcion || "";
      const fotos       = catMap[nombre]?.fotos || [];
      productsMap[nombre] = {
        id: nombre.toLowerCase().replace(/\s+/g, "-").replace(/[áàä]/g,"a").replace(/[éèë]/g,"e").replace(/[íìï]/g,"i").replace(/[óòö]/g,"o").replace(/[úùü]/g,"u").replace(/[^a-z0-9-]/g,""),
        nombre,
        precio: precioUnit,
        imagen_url: fotos[0] || "",   // primera foto para la tarjeta
        fotos,                         // todas las fotos para el carousel
        categorias,
        descripcion,
        talles: [],
      };
    }

    // El precio del producto = mínimo precio no-cero entre todos los talles
    if (precioUnit > 0) {
      if (productsMap[nombre].precio === 0 || precioUnit < productsMap[nombre].precio) {
        productsMap[nombre].precio = precioUnit;
      }
    }

    // Cada talle lleva su propio precio
    productsMap[nombre].talles.push({ talle, stock: stockActual, precio: precioUnit });
  }

  return Object.values(productsMap);
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");

  // ?debug=1 → raw de primeras filas para diagnóstico
  if (req.query.debug === "1") {
    const sheets = google.sheets({ version: "v4", auth: makeAuth() });
    const raw = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "'6 Stock'!A1:J6",
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    return res.status(200).json(raw.data.values);
  }

  try {
    const now = Date.now();
    if (!cache || now - cacheTime > CACHE_TTL) {
      cache = await fetchFromSheets();
      cacheTime = now;
    }
    res.status(200).json(cache);
  } catch (err) {
    console.error("Error leyendo Sheet:", err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
};

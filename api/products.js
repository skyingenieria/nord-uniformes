// Lee la hoja "6 Stock" del ERP Nord y devuelve productos agrupados por prenda.
// Filtra por colegio (por defecto "WS" = Wellspring).
// Cache de 5 minutos en memoria para no agotar la cuota de la Sheets API.
//
// Columnas del sheet:
//   A=Colegio  B=Prenda  C=Talle  D=Codigo  E=Stock inicial
//   F=Compras  G=Ventas  H=#  I=Stock actual  J=Costo Unit  K=Precio Unit

const { google } = require("googleapis");

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

async function fetchFromSheets(colegio = "WS") {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      // Vercel guarda la clave con \n literales — los convertimos a saltos de línea reales
      private_key: process.env.GOOGLE_PRIVATE_KEY
        ?.replace(/\\n/g, "\n")
        .replace(/^"/, "").replace(/"$/, ""), // quitar comillas extra si las hubiera
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "'6 Stock'!A2:K2000",
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const rows = res.data.values || [];
  const productsMap = {};

  for (const row of rows) {
    const colegioCell = String(row[0] || "").trim();
    const nombre      = String(row[1] || "").trim();
    const talle       = String(row[2] ?? "").trim();
    const stockActual = Number(row[8]) || 0;  // columna I
    const precioUnit  = Number(row[10]) || 0; // columna K

    if (colegioCell !== colegio || !nombre || !talle) continue;

    if (!productsMap[nombre]) {
      productsMap[nombre] = {
        id: nombre.toLowerCase().replace(/\s+/g, "-"),
        nombre,
        precio: precioUnit,
        imagen_url: "",
        talles: [],
      };
    }
    // Si hay varias filas con mismo nombre pero distinto precio, usar el último no-cero
    if (precioUnit > 0) productsMap[nombre].precio = precioUnit;

    productsMap[nombre].talles.push({ talle, stock: stockActual });
  }

  return Object.values(productsMap);
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

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

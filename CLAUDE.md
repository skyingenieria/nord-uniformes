# CLAUDE.md — Nord Uniformes Web

## Qué es este proyecto

Sitio web de **Nord Uniformes** (uniformes escolares Wellspring Pilar, Argentina).  
Dominio: `norduniformes.com.ar`  
Repo: `github.com/skyingenieria/nord-uniformes` (público)  
Deploy: **Vercel** — auto-deploy al pushear a `main`.

Desarrolladores: Fede (alonsofede93@gmail.com) y su novia (Flor).

---

## Arquitectura

### Frontend
- `wellspring.html` — catálogo de productos Wellspring (página principal)
- `carrito.html` — carrito de compras con checkout
- `admin.html` — panel de administración (órdenes, clientes, métricas GA4, facturación ARCA)
- `tools/qr-folletos.html` — generador de QRs con UTM tracking para folletos

### Backend (Vercel Serverless — `api/`)
- `api/products.js` — lee productos desde Google Sheets ERP
- `api/nave/` — integración con pasarela de pago Nave (tarjeta débito/crédito)
  - `_auth.js` (helper, no ruta) — token cacheado
  - `create-payment.js` — crea la sesión de pago
  - `warmup.js` — pre-calienta el token al seleccionar tarjeta
  - `webhook.js` — recibe confirmación de pago
- `api/mail/send-order-notification.js` — notificación por email al confirmar pedido
- `api/admin/orders.js` — órdenes, clientes, métricas GA4, métricas de cobros
- `api/arca.js` + `api/arca/_client.js` — facturación AFIP/ARCA (Factura C, Monotributo)
- `api/pedidos/` — gestión de pedidos desde el carrito

⚠️ **Vercel Hobby = máximo 12 serverless functions.** El proyecto está al límite. Agregar un endpoint nuevo puede romper el deploy. Si necesitás agregar lógica, consolidar en endpoints existentes o usar helpers con `_` al inicio del nombre (no cuentan como ruta).

### Datos — hoy 100% Google Sheets. Migración a Supabase en construcción, en paralelo, todavía SIN conectar

⚠️ **Regla vigente (pedida por Flor el 2026-09-26): no tocar wellspring.html,
carrito.html, erp.html ni ningún archivo de `api/` hasta que se indique lo
contrario.** Primero se termina de armar la base de datos en Supabase y la
web app nueva; recién como último paso se conecta el sitio actual a Supabase
(o se lo reemplaza directamente por la app nueva — a decidir más adelante).
`api/products.js`, `api/erp.js` y `api/orders.js` en este momento son
idénticos a como estaban antes de empezar esta migración: leen y escriben
Google Sheets, cero dependencia de Supabase. Si alguna sesión anterior dejó
estos archivos leyendo de Supabase, es un error — hay que revertirlos.

**Lo que SÍ existe y no depende de la web (se puede seguir trabajando libre):**
- `supabase/schema.sql` — tablas `products` + `product_variants` (catálogo:
  prendas, talles, stock, precios) + función `decrement_stock`. **Ya corrido**
  en el proyecto Supabase.
- `supabase/schema_pedidos.sql` — tablas `clientes`, `codigos_descuento`,
  `pedidos`, `pedido_items`, `pagos`, `facturas`, `profiles` (roles de
  usuario), vista `pedidos_con_saldo`. **Ya corrido** en el proyecto Supabase.
  (Ojo al copiar este archivo a mano: evitar caracteres Unicode raros tipo
  `──`/`→` en comentarios — se corrompen al copiar/pegar en el SQL Editor de
  Supabase y tiran "syntax error at end of input". Usar ASCII plano, o el
  botón "Copy raw contents" de GitHub en vez de seleccionar texto a mano.)
- `api/_supabase.js` — cliente Supabase compartido (service_role key), listo
  para cuando se empiece a cablear la API real. Todavía sin usar en ningún
  endpoint activo.
- `scripts/migrate-catalogo-to-supabase.js` — importa el catálogo desde el
  Sheet (`Stock`, `Lista de precios`, `Listado de Prendas`) hacia Supabase.
  Re-corrible (upsert). `npm run migrate:catalogo`. **Todavía no se corrió**
  contra datos reales (bloqueado por acceso de red, ver abajo).

**Proyecto Supabase:** `https://piaagjddrrcbijienvll.supabase.co` (ver
Project Settings → API en supabase.com por la `anon key` / `service_role key`
— la service_role key es secreta, no va al repo, vive solo en `.env.local`
local de cada uno y eventualmente en Vercel cuando se decida conectar).

**Pendiente para retomar:**
1. Acceso de red desde las sesiones de Claude Code en la nube a
   `*.supabase.co` viene fallando con "Host not in allowlist" incluso
   después de poner "full access" en la config de red del entorno y
   reabrir sesión — quedó sin resolver. Puede que haga falta una sesión
   nueva (no reabrir la misma) para que tome el cambio, o revisar que el
   full access se haya guardado en el entorno correcto.
2. Con la red andando: correr `npm run migrate:catalogo` para traer los
   datos reales del catálogo a Supabase, y armar el script/proceso
   equivalente para clientes/pedidos/pagos/facturas (todavía no escrito).
3. Diseñar y construir la **web app nueva** (ver decisiones abajo) contra
   este schema — recién ahí se evalúa conectar o reemplazar el sitio actual.

**Decisiones ya tomadas sobre la web app nueva** (para cuando se retome):
- Una sola app responsive (no dos apps separadas): mismo código, mismo
  login, pero en pantallas chicas se muestra un subconjunto de funciones
  (pensado para vendedores usando el celular: venta rápida, pedidos,
  cobros, facturas). El escritorio muestra todo (+ inventario, clientes,
  dashboard, gestión de catálogo).
- Login individual por persona vía **Supabase Auth** (no la clave única
  ADMIN_PASSWORD actual), con rol `admin` o `vendedor` por usuario (tabla
  `profiles` en `schema_pedidos.sql`). Permite saber quién hizo cada venta/
  cobro y, a futuro, limitar acciones por rol.
- El objetivo de fondo: que la web app nueva hable directo con Supabase
  (Supabase Auth + RLS) para la mayoría de las operaciones, reduciendo la
  dependencia de funciones serverless en Vercel — ayuda además con el límite
  de 12 funciones del plan Hobby mencionado arriba.

**Qué reemplaza cada tabla nueva:**
- `products` / `product_variants` → hojas `Stock`, `Lista de precios`, `Listado de Prendas`
- `clientes` → hoja `Clientes`
- `pedidos` / `pedido_items` / `pagos` → hojas `Pedidos` y `Ordenes`
- `facturas` → hoja `Facturas`
- `codigos_descuento` → hoja `Codigos`
- `profiles` → no existía antes (hoy es una clave única `ADMIN_PASSWORD`)

---

## Modelo de precios

- El ERP guarda el **precio de transferencia** (precio real de venta con descuento).
- En la web se muestra: **precio de lista = transferencia × 1.15** (aproximado).
- Framing: se muestra el precio de lista y la transferencia aparece como **descuento**, NO como recargo.
- **Pago con tarjeta (Nave):** sin descuento — el cliente paga el precio de lista completo. 3 cuotas sin interés.
- **Pago por transferencia:** precio con descuento (precio de transferencia del ERP).
- El total enviado a Nave = subtotal a precio de lista (sin descuento).

---

## Pagos — Nave

Integración con pasarela Nave para tarjeta débito/crédito.  
- Auth contra `services.apinaranja.com`
- Creación de pago contra `api.ranty.io`
- El popup de checkout abre en `window.open("about:blank")` inmediatamente al hacer clic (antes de la llamada async), para no ser bloqueado en mobile.
- Variables de entorno requeridas en Vercel: `NAVE_ENV`, `NAVE_CLIENT_ID`, `NAVE_CLIENT_SECRET`

---

## Variables de entorno (todas en Vercel)

| Variable | Uso |
|---|---|
| `SPREADSHEET_ID` | Google Sheet del ERP |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account para leer el Sheet |
| `GOOGLE_PRIVATE_KEY` | Clave privada del service account |
| `NAVE_ENV` | `prod` o `sandbox` |
| `NAVE_CLIENT_ID` | Credencial Nave |
| `NAVE_CLIENT_SECRET` | Credencial Nave |
| `SMTP_USER` | Gmail para notificaciones de pedidos |
| `SMTP_PASS` | App password de Gmail |
| `ADMIN_PASSWORD` | Contraseña del panel /admin |
| `ARCA_CUIT` | CUIT para facturación ARCA |
| `ARCA_CERT` | Certificado ARCA |
| `ARCA_KEY` | Clave ARCA |
| `ARCA_PTO_VTA` | Punto de venta ARCA |
| `ARCA_ENV` | `homologacion` o `produccion` |

Para desarrollo local: pedirle a Fede el archivo `.env.local` (no está en el repo).

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` **todavía no están en Vercel** a
propósito (ver sección "Datos" arriba): el sitio no usa Supabase todavía. Solo
hace falta tenerlas en un `.env.local` local para correr los scripts de
`scripts/` contra el proyecto Supabase mientras se arma la migración.

---

## Imágenes de productos

- Viven en `/images/` dentro del repo.
- Las rutas en el Sheet son del tipo `/images/NombreArchivo.png`.
- Al agregar una imagen nueva: comprimirla primero (usar `sharp`) y commitearla al repo.
- Las fotos de referencia originales están en Google Drive: `G:\.shortcut-targets-by-id\1Z3qJKl0VSrF144Z_IEh6PLtTPkRYPRsi\NORD UNIFORMES\Wellspring Pilar\Marketing\Página Web Wellspring\images\`

---

## Flujo de trabajo recomendado

```bash
# Antes de empezar algo nuevo
git checkout main
git pull origin main
git checkout -b nombre-del-cambio

# Trabajar, commitear...
git add archivo-modificado.html
git commit -m "descripción del cambio"
git push origin nombre-del-cambio

# En GitHub: crear Pull Request → mergear a main → Vercel despliega automáticamente
```

No trabajar directo en `main` para evitar conflictos entre los dos.

---

## Google Analytics 4

Property ID: `541705478`  
Se usa en `api/admin/orders.js` para el panel de métricas.  
UTM tracking activo para QRs de folletos: `utm_medium=qr`, fuentes `via_publica`, `folleto`, `cartelera_colegio`.

---

## Facturación ARCA (ex-AFIP)

- Tab "Facturación" en `/admin`
- Monotributo → Factura C (CbteTipo 11, sin IVA)
- Estado: scaffold completo, pendiente cargar certificado y env vars de producción.

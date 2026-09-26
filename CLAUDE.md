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
contrario.** `api/products.js`, `api/erp.js` y `api/orders.js` en este
momento son idénticos a como estaban antes de empezar esta migración: leen
y escriben Google Sheets, cero dependencia de Supabase. Si alguna sesión
anterior dejó estos archivos leyendo de Supabase, es un error — revertirlos.

**Plan en 4 etapas (definido por Flor el 2026-09-26):**
1. **Migración de base de datos** Sheets → Supabase (en curso, ver abajo).
2. Web app **desktop** (gestión completa: catálogo, clientes, pedidos, pagos,
   facturas, dashboard) — Supabase Auth con roles `admin`/`vendedor`.
3. Web app **mobile** — misma app, responsive, con un subconjunto de
   funciones (venta rápida, pedidos, cobros, facturas) para vendedores.
4. Recién ahí conectar/reemplazar el sitio actual (`wellspring.html` /
   `carrito.html` / `erp.html`) con Supabase.

**Etapa 1 (migración de datos) — estado:**
- `supabase/schema.sql` y `supabase/schema_pedidos.sql` — **ya corridos** en
  el proyecto Supabase (`https://piaagjddrrcbijienvll.supabase.co`).
  (Ojo al copiar SQL a mano: evitar caracteres Unicode raros tipo `──`/`→`
  en comentarios — se corrompen al pegar en el SQL Editor de Supabase y
  tiran "syntax error at end of input"/"syntax error at or near ';'". Usar
  ASCII plano, y el botón "Copy raw contents" de GitHub en vez de
  seleccionar texto a mano.)
- Flor pasó el Excel real del ERP (`ERP_Nord.xlsx`, export del Sheet). Se
  generaron 4 archivos con los INSERTs de los datos reales en
  `supabase/data/` (01_catalogo, 02_clientes, 03_pedidos, 04_facturas),
  pensados para correr en el SQL Editor de Supabase — pero el SQL Editor
  resultó poco confiable (algunos paste no persistían sin marcar error
  visible: `products`/`pedidos` quedaron en 0 filas más de una vez pese a
  no siempre reportar error). Cuando se destrabó el acceso de red desde la
  sesión (ver más abajo), **se terminó cargando por API directamente**
  (parseando esos mismos .sql e insertando vía `supabase-js`), sin
  depender más del SQL Editor para esto.
  - **Estado: ETAPA 1 COMPLETA Y VERIFICADA** (2026-09-26). Conteos reales
    confirmados contra la base: 24 prendas, 215 talles, 34 clientes, 34
    pedidos, 78 items, 34 pagos, 10 facturas. La vista `pedidos_con_saldo`
    fue chequeada contra 3 pedidos y matchea exacto con la columna "Total
    Venta" del Sheet original.
  - `02_clientes.sql` incluye el `ALTER TABLE` que relaja `clientes.email`
    a nullable/sin unique (ya aplicado): los datos reales tienen clientes
    sin email y algunos placeholders repetidos ("noaplica", etc.).
  - Se excluyeron a propósito 5 pedidos "Pedido Inexistente" (basura de
    prueba en el Sheet original, sin cliente ni órdenes asociadas).
  - Nota de calidad de datos (no bloqueante): varios emails de clientes en
    el Sheet son placeholders/basura ("noaplica", "nose", nombres sin
    "@dominio"). Se cargaron tal cual salvo los casos obviamente vacíos
    (esos quedan NULL). Vale la pena limpiarlos a mano más adelante desde
    la web app nueva.
- `api/_supabase.js` — cliente Supabase compartido (service_role key), listo
  para cuando se empiece a cablear la API real (Etapa 2). Todavía sin usar
  en ningún endpoint activo.
- `scripts/migrate-catalogo-to-supabase.js` — alternativa por API (en vez de
  SQL a mano) para re-sincronizar el catálogo más adelante si hace falta.
  Re-corrible (upsert). `npm run migrate:catalogo`.

**Proyecto Supabase:** `https://piaagjddrrcbijienvll.supabase.co` (ver
Project Settings → API en supabase.com por la `anon key` / `service_role key`
— la service_role key es secreta, no va al repo, vive solo en `.env.local`
local de cada uno y eventualmente en Vercel cuando se decida conectar).

**Sobre el acceso de red desde las sesiones de Claude Code en la nube:**
venía fallando con "Host not in allowlist" hacia `*.supabase.co` incluso
con "full access" configurado en el entorno. En algún momento entre
reintentos se destrabó solo (probablemente tardó en propagarse el cambio
de config, o hizo falta una sesión nueva) — si vuelve a aparecer en Etapa
2/3, probar: (1) confirmar "full access" en Network access del entorno,
(2) abrir una sesión nueva en vez de reusar una vieja, (3) tener paciencia,
puede tardar en propagar.

**Pendiente para retomar:** arrancar **Etapa 2**, la web app desktop (ver
decisiones abajo). Etapa 1 (datos) está lista para consumir.

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

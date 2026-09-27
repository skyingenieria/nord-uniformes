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
- `wellspring.html` — catálogo de productos Wellspring (página principal). Habla
  directo con Supabase desde el browser (anon key pública, seguridad vía RLS).
- `carrito.html` — carrito de compras con checkout. Ídem: pedido/cliente se
  crean en Supabase vía `api/orders.js`/`api/cliente/check-or-create.js`
  (`backend:"supabase"`), no en Sheets.
- `gestion.html` — la web app de gestión (Flor/Fede), en `/gestion`. Ver
  sección propia más abajo.
- `tools/qr-folletos.html` — generador de QRs con UTM tracking para folletos

**`_archive/`** — páginas y funciones viejas, retiradas del cutover a
Supabase del 2026-09-27 (ver "Datos" abajo). Excluidas del deploy vía
`.vercelignore` (no responden en la web), pero se dejan en el repo completas
por si algún día hay que volver atrás:
- `_archive/wellspring-sheets.html`, `_archive/carrito-sheets.html` — las
  versiones Sheets de `wellspring.html`/`carrito.html`, previas al cutover.
- `_archive/erp.html` + `_archive/sw-erp.js` — la app de gestión vieja
  (mobile-first, Sheets, token `ADMIN_PASSWORD`), reemplazada por
  `gestion.html`.
- `_archive/api-admin/` — `orders.js`/`auth.js`, el backend del panel
  `/admin` (ya había sido retirado del frontend antes; esto archiva lo que
  quedaba). Su reporte de tráfico GA4 se portó a `gestion.html` (acción
  `ga4-metrics` de `api/erp.js`) antes de archivar.

### Backend (Vercel Serverless — `api/`)
- `api/products.js` — lee productos desde Google Sheets ERP (sin uso desde
  el cutover — lo sigue teniendo `_archive/wellspring-sheets.html` como red
  de seguridad, nada en producción lo llama)
- `api/nave/` — integración con pasarela de pago Nave (tarjeta débito/crédito)
  - `_auth.js` (helper, no ruta) — token cacheado
  - `create-payment.js` — crea la sesión de pago
  - `warmup.js` — pre-calienta el token al seleccionar tarjeta
  - `webhook.js` — recibe confirmación de pago (rama Supabase y rama Sheets,
    según si `orderId` es un uuid o un "YY-NN")
- `api/mail/send-order-notification.js` — notificación por email al confirmar pedido
- `api/erp.js` — router único para `gestion.html` (Supabase Auth): facturar
  por ARCA, subir PDF a Drive, tráfico GA4. También conserva, sin uso, las
  acciones viejas de Sheets/token legacy que usaba `/erp` (ver comentario al
  principio del archivo) — quedan de red de seguridad, no de borrar.
- `api/arca.js` + `api/arca/_client.js` — facturación AFIP/ARCA (Factura C, Monotributo)
- `api/pedidos/` — gestión de pedidos desde el carrito (Sheets, sin uso desde el cutover)
- `api/_supabase.js` — cliente Supabase compartido (service_role key) para
  las funciones serverless de arriba.

⚠️ **Vercel Hobby = máximo 12 serverless functions.** El proyecto está al límite. Agregar un endpoint nuevo puede romper el deploy. Si necesitás agregar lógica, consolidar en endpoints existentes o usar helpers con `_` al inicio del nombre (no cuentan como ruta).

### Datos — 100% Supabase en la web desde el cutover del 2026-09-27. Sheets queda de respaldo/histórico, no se lee más en producción

**Plan en 4 etapas (definido por Flor el 2026-09-26) — estado actual:**
1. **Migración de base de datos** Sheets → Supabase — **completa**.
2. Web app **desktop** de gestión (`gestion.html`, Supabase Auth con roles
   `admin`/`vendedor`) — **completa y es la única app de gestión** (`/erp` y
   `/admin` quedaron archivados, ver `_archive/` arriba).
3. Web app **mobile** — mismo código que `gestion.html` (responsive, ya
   muestra un subconjunto de tabs en pantallas chicas). Se sigue afinando
   sobre la marcha, no es una app aparte.
4. **Cutover del sitio público** (`wellspring.html`/`carrito.html`) a
   Supabase — **completo el 2026-09-27**. `wellspring.html`/`carrito.html`
   pasaron a ser lo que antes era `wellspringbeta.html`/`carrito-beta.html`
   (fases A y B de esta etapa); las versiones Sheets quedaron en `_archive/`.

Todo el sitio (catálogo, carrito, checkout, `/gestion`) lee y escribe en
Supabase. Las rutas/funciones que dependían de Sheets (`api/products.js`,
`api/pedidos/`, y la rama Sheets de `api/orders.js`/`api/cliente/check-or-create.js`/
`api/nave/webhook.js`) se dejaron intactas sin borrar, como red de seguridad
para poder volver atrás — pero nada en producción las llama ya.

**Proyecto Supabase:** `https://piaagjddrrcbijienvll.supabase.co`, región
`sa-east-1`. `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` **ya están cargadas
en Vercel** (necesarias para que `api/orders.js`, `api/cliente/check-or-create.js`,
`api/nave/webhook.js` y `api/_supabase.js` funcionen). La password de
Postgres sigue sólo en `.env.local` local de cada uno (no en el repo, no
hace falta en Vercel — nada usa conexión directa a Postgres, ver abajo).

⚠️ **La conexión directa a Postgres (puerto 5432/6543, `DATABASE_URL`) NO
funciona desde una sesión de Claude Code en la nube**: el entorno solo
permite salida por HTTPS (443), cualquier TCP directo a Postgres da timeout
aunque el host resuelva bien y la password sea correcta. Confirmado
probando tanto la conexión directa (`db.<ref>.supabase.co`, que además solo
tiene IPv6, otro problema aparte) como el connection pooler
(`aws-0-sa-east-1.pooler.supabase.com:6543`, IPv4, igual da timeout). No
perder tiempo reintentando esto — para DDL/SQL hay que seguir usando el SQL
Editor de Supabase (ver más abajo cómo hacerlo confiable); para datos, la
API REST (`supabase-js` o `SUPABASE_URL/rest/v1/...` con `requests`) anda
perfecto y es lo que se usó para toda la carga real.

#### Esquema final (después del rediseño del 2026-09-26)

Numeración pedida por Flor: **001-0xx = tablas madre** (fuente de verdad,
de más a menos importante), **101+ = vistas calculadas** (nunca se editan a
mano, se recalculan solas). Nombres con prefijo numérico requieren comillas
dobles en SQL crudo (`"002_talles"`) — pero **no** en `supabase-js`
(`.from("002_talles")` funciona directo, sin comillas raras).

| # | Tabla/vista | Reemplaza | Notas |
|---|---|---|---|
| 001 | `001_prendas` | Listado de Prendas | nombre, descripción, género, categorías, fotos |
| 002 | `002_talles` | Stock (columnas de identidad) | **solo identidad**: `product_id`, `talle`, `sku`. Sin stock/costo/precio — eso es histórico ahora |
| 003 | `003_clientes` | Clientes | |
| 004 | `004_pedidos` | Pedidos (cabecera) | |
| 005 | `005_ordenes` | Ordenes (detalle vendido) | ex `pedido_items`. Columna `talle_id` (ex `product_variant_id`). `precio_unitario`/`costo_unitario` son **snapshot congelado al momento de vender**, no cambian aunque después cambie el precio vigente |
| 006 | `006_pagos` | Pedidos (cobros) | soporta pagos parciales (varias filas por pedido) |
| 007 | `007_facturas` | Facturas | Factura C / ARCA |
| 008 | `008_proveedores` | *(texto libre en Compras)* | 5 proveedores reales cargados |
| 009 | `009_compras` | Compras | `talle_id` nullable + `sku_original` para compras viejas de talles ya discontinuados (5 casos reales) |
| 010 | `010_precios` | Lista de precios (columnas por fecha) | **histórico append-only**: una fila por cambio de precio, `vigente_desde`. Nunca se hace UPDATE |
| 011 | `011_costos_reposicion` | Costo Reposición (columnas por fecha) | mismo criterio: histórico append-only |
| 012 | `012_profiles` | *(no existía)* | rol `admin`/`vendedor` por usuario de Supabase Auth |
| — | `codigos_descuento` | Codigos | **eliminada** (no se usa) — pendiente confirmar que el `DROP TABLE` corrió, ver abajo |
| 101 | `101_stock_actual` | Stock (columna "Stock actual") | `= Σ 009_compras.cantidad − Σ 005_ordenes.cantidad`, por talle. Se recalcula solo, nunca se escribe a mano |
| 102 | `102_precio_vigente` | — | última fila de `010_precios` con `vigente_desde <= hoy`, por talle |
| 103 | `103_costo_vigente` | — | ídem para `011_costos_reposicion` |
| 104 | `104_pedidos_con_saldo` | Pedidos (saldo) | total/saldo por pedido, join de ordenes+pagos |

**Cómo funciona el modelo (explicado a Flor el 2026-09-26, para referencia
al construir la Etapa 2):**
- **Precio de venta nuevo:** la app consulta `102_precio_vigente` para el
  talle. Cuando cambia un precio, se **inserta una fila nueva** en
  `010_precios` con la fecha desde la que aplica — nunca se pisa la
  anterior. Mismo criterio para costo en `011_costos_reposicion`.
- **Al vender:** se copia (snapshot) el precio/costo vigente en ese momento
  a `005_ordenes.precio_unitario`/`costo_unitario`. Por eso una venta vieja
  nunca cambia de precio aunque después suba la lista — y la ganancia de
  cualquier pedido, viejo o nuevo, siempre es
  `precio_unitario - costo_unitario` sin depender de nada externo.
- **Stock:** no existe un contador que se descuente. `101_stock_actual` es
  pura resta (compras − ventas). Vender = insertar en `ordenes` → el stock
  baja solo en la vista. Comprarle a un proveedor = insertar en `compras` →
  sube solo. No hay forma de que se desincronice.

**Cómo se hizo el SQL Editor de Supabase confiable** (venía fallando
mucho con pastes grandes, a veces sin marcar error — ver commits del
2026-09-26 para el detalle completo si hace falta):
1. Nada de caracteres Unicode raros en comentarios (`──`, `→`) — se
   corrompen al pegar. Solo ASCII plano.
2. Scripts chicos (menos de ~150-200 líneas) corren bien casi siempre;
   los de carga masiva de datos (400+ líneas) no persistían de forma
   confiable sin avisar error — para eso mejor cargar por API (ver abajo).
3. Si una sola sentencia de un script por lo demás exitoso no corre
   (pasó con el `DROP TABLE codigos_descuento` del rediseño), simplemente
   pedirle que la corra sola.

**Estado: ETAPA 1 COMPLETA** (2026-09-26), datos reales cargados y
verificados contra el Excel (`ERP_Nord.xlsx` que pasó Flor) en varios
puntos (conteos, `104_pedidos_con_saldo` vs "Total Venta" del Sheet,
`101_stock_actual` vs "Stock actual" del Sheet — todo matchea exacto).
Conteos finales: 24 prendas, 215 talles, 34 clientes, 34 pedidos, 78
órdenes, 34 pagos, 10 facturas, 5 proveedores, 250 compras (245 linkeadas
a un talle, 5 de talles discontinuados), 430 filas de precio histórico
(2 fechas × 215 talles), 456 de costo histórico.

**Pendiente confirmar al retomar:** correr `drop table if exists
codigos_descuento;` en el SQL Editor — quedó pendiente al cierre de esta
sesión (todo lo demás del rediseño sí corrió y se verificó bien).

**Notas de calidad de datos heredadas del Excel** (no bloqueantes, prolijar
desde la web app nueva cuando haya tiempo):
- Varios emails de clientes son placeholders/basura ("noaplica", "nose",
  nombres sin "@dominio"). Se cargaron tal cual salvo los vacíos obvios
  (quedan NULL). `003_clientes.email` es nullable y sin `unique` a propósito
  por esto.
- 5 pedidos "Pedido Inexistente" del Sheet original (basura de prueba, sin
  cliente ni órdenes reales) se excluyeron a propósito de la migración.
- 5 SKUs de `009_compras` no tienen `talle_id` (talles ya discontinuados
  del catálogo actual) — quedan con `sku_original` como referencia.

**Archivos relevantes:**
- `supabase/schema.sql`, `supabase/schema_pedidos.sql` — schema original
  (etapa 1, superado por el rediseño de `05_rediseno_ddl.sql`, se mantienen
  como historia).
- `supabase/data/05_rediseno_ddl.sql` — el rediseño completo (numeración,
  históricos, proveedores/compras). Ya corrido salvo el DROP pendiente.
- `supabase/data/01_catalogo.sql` .. `04_facturas.sql` — carga inicial de
  datos reales (ya aplicada, vía API).
- `scripts/migrate-catalogo-to-supabase.js` — quedó desactualizado tras el
  rediseño (apunta a `products`/`product_variants` con columnas de stock
  que ya no existen ahí). Revisar/reescribir antes de volver a usarlo.

**Decisiones ya tomadas sobre `gestion.html`:**
- Una sola app responsive (no dos apps separadas): mismo código, mismo
  login, pero en pantallas chicas se muestra un subconjunto de funciones
  (pensado para vendedores usando el celular: venta rápida, pedidos,
  cobros, facturas). El escritorio muestra todo (+ inventario, clientes,
  proveedores/compras, dashboard, gestión de catálogo).
- Login individual por persona vía **Supabase Auth** (ya no existe
  ADMIN_PASSWORD — quedó sólo en el código archivado de `_archive/`), con
  rol `admin` o `vendedor` por usuario (tabla `012_profiles`). Permite saber
  quién hizo cada venta/cobro y, a futuro, limitar acciones por rol.
- Habla directo con Supabase (Supabase Auth + RLS, anon key pública) para
  casi todo — reduce la dependencia de funciones serverless en Vercel, que
  ayuda con el límite de 12 funciones del plan Hobby mencionado arriba.
  `api/erp.js` sólo entra para lo que necesita credenciales que no pueden
  viajar al browser: ARCA, Drive, Google Analytics.

**Estado de `gestion.html`:** vive en `https://www.norduniformes.com.ar/gestion`
(rewrite en `vercel.json`, **sin subdominio propio** — decisión de Flor,
2026-09-27). Tabs: Dashboard (ventas/ganancia/margen%, año calendario, y
tráfico del sitio vía GA4 con carga bajo demanda), Stock (solo lectura),
Vender, Pedidos, Órdenes (detalle línea por línea de lo vendido), Clientes,
Proveedores, Compras (editable tipo Excel), Precios y costos (editable tipo
Excel), Contabilidad, Catálogo (alta de prendas/talles).

- **Modelo de precios de `gestion.html`** (distinto del "Modelo de precios"
  de abajo, que es de wellspring/carrito): el precio base de cada ítem, en
  Vender y al editar un pedido ya creado, es **siempre el precio de lista**,
  sin importar la forma de pago. El % de descuento por ítem es lo que lo
  baja desde ahí — típicamente hasta el precio de transferencia (hay un
  botón "→Transf." por línea que carga ese % exacto automáticamente), pero
  puede ser cualquier valor manual. El checkout muestra el desglose:
  subtotal a precio de lista, descuento por prenda (suma de los descuentos
  ítem por ítem) y descuento del pedido (aparte, un monto fijo en $). Ese %
  se guarda tal cual en `005_ordenes.descuento_pct` (no se recalcula contra
  el precio de hoy) — filas de antes de que existiera esa columna quedan en
  NULL y la UI les sigue estimando el % en vivo, como hacía antes.
- **Edición de pedidos ya creados:** de sólo lectura por default (una línea
  por ítem: talle/cantidad/precio/%desc/subtotal) — hay que tocar "✏️ Editar
  prendas" para habilitar los controles editables, para evitar cambios
  accidentales una vez armado el pedido. También hay un campo de nota
  interna libre por pedido (`004_pedidos.notas`).
- **Facturación ARCA + Drive:** desde Pedidos se emite Factura C real (acción
  `facturar-supabase` de `api/erp.js`). Al emitir se genera el PDF (reusando
  `/factura.js` + `/factura-pdf.js`, los mismos scripts estáticos que usaba
  `/erp`, ahora archivado) y se sube a Google Drive en segundo plano vía la
  acción `drive-factura`; el link queda en `007_facturas.drive_link` y se ve
  como botón/link "Ver factura en Drive" en el pedido y en la tabla de
  Contabilidad.
- **Tráfico del sitio (GA4):** en el Dashboard, botón "Ver tráfico" que
  carga bajo demanda (acción `ga4-metrics` de `api/erp.js`, Supabase Auth) —
  portado desde el panel `/admin` viejo antes de archivarlo.

**Migraciones de Supabase corridas manualmente en el SQL Editor** (no hay
forma de correr DDL desde una sesión de Claude Code en la nube, ver abajo —
quedan documentadas acá para no perder el rastro):
`supabase/data/05_rediseno_ddl.sql`, `06_rls_app.sql`, `07_drive_link.sql`,
`08_rls_wellspringbeta.sql`, `09_ordenes_notas_drivelink.sql` (agrega
`007_facturas.drive_link` si no estaba, `005_ordenes.descuento_pct`,
`004_pedidos.notas`, y recrea la vista `104_pedidos_con_saldo` con `notas`
al final del `select` — Postgres no deja insertar columnas en el medio de
una vista con `create or replace view`, sólo al final).

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
| `SUPABASE_URL` | Proyecto Supabase (no es secreta, pero vive acá igual) |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend (`api/_supabase.js`, `api/orders.js`, etc.) — nunca se expone al browser |
| `ARCA_CUIT` | CUIT para facturación ARCA |
| `ARCA_CERT` | Certificado ARCA |
| `ARCA_KEY` | Clave ARCA |
| `ARCA_PTO_VTA` | Punto de venta ARCA |
| `ARCA_ENV` | `homologacion` o `produccion` |

Para desarrollo local: pedirle a Fede el archivo `.env.local` (no está en el repo).

`ADMIN_PASSWORD` queda en Vercel sin uso real (el código legacy que la
validaba está archivado o inalcanzable — ver "Datos" arriba) — se puede
borrar de Vercel el día que se confirme que nada la necesita, no es urgente.

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
Se usa en `api/erp.js` (acción `ga4-metrics`, Supabase Auth) para el tab
Dashboard de `gestion.html`.  
UTM tracking activo para QRs de folletos: `utm_medium=qr`, fuentes `via_publica`, `folleto`, `cartelera_colegio`.

---

## Facturación ARCA (ex-AFIP)

- Desde `gestion.html`, tab Pedidos → "Emitir Factura C" (acción
  `facturar-supabase` de `api/erp.js`).
- Monotributo → Factura C (CbteTipo 11, sin IVA). El PDF se guarda en Google
  Drive (acción `drive-factura`), link en `007_facturas.drive_link`.
- Estado: en producción, funcionando con certificado y env vars reales.

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

### Datos — migración a Supabase (en curso)

**Estado (etapa 1 de 3, completada):** catálogo (prendas, talles, stock, precios)
migrado a Supabase. Clientes, Pedidos/Ordenes, Facturación ARCA y Códigos de
descuento **siguen en el Google Sheet ERP** (próximas etapas).

- `supabase/schema.sql` — tablas `products` + `product_variants` y la función
  `decrement_stock` (RPC). Correr una sola vez en el SQL Editor de Supabase.
- `api/_supabase.js` — cliente compartido (service_role key, solo backend).
- `api/products.js` — catálogo público (`wellspring.html`), lee de Supabase.
- `api/erp.js` (`action=stock`) — inventario multi-colegio (`erp.html`), lee de Supabase.
- Al confirmar una venta (`api/orders.js` y `api/erp.js` `action=pedido`) se
  descuenta el stock en Supabase (best-effort, no bloquea la venta si falla).
- `scripts/migrate-catalogo-to-supabase.js` — importa/resincroniza desde el
  Sheet (`Stock`, `Lista de precios`, `Listado de Prendas`) hacia Supabase.
  Re-corrible (upsert). Correr con `npm run migrate:catalogo`.

⚠️ Mientras dure la transición, el stock de Wellspring en la pestaña 'Stock'
del Sheet queda **desactualizado** para lo que se vende por la web (las
fórmulas del Sheet no se enteran de las ventas). Para corregir stock a mano,
hacerlo directo en Supabase (Table Editor) o en el Sheet + recorrer
`npm run migrate:catalogo` para traer el cambio.

Filtro de la web: solo filas con colegio = `"WS"` (Wellspring). Cache de 5 min
en `api/products.js` (igual que antes).

**Todavía en Google Sheets ERP** (Sheet ID `1-sEnBHMyt2a5ZKtVmdWl5_mMqhQMC8B1sAudlzBzBHg`):
- **Clientes** — alta/consulta de clientes (`api/cliente/check-or-create.js`, `api/erp.js action=clientes`)
- **Pedidos** / **Ordenes** — ledger de ventas, pagos y envíos (`api/orders.js`, `api/pedidos/next-id.js`, `api/erp.js` acciones `pedidos`/`ordenes`/`pago`/`entrega`/`dashboard`)
- **Facturas** — registro de Factura C (`api/arca.js`, `api/erp.js action=facturar`)
- **Codigos** — códigos de descuento (`api/erp.js action=validate-code`)

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
| `SUPABASE_URL` | URL del proyecto Supabase (catálogo) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key de Supabase — secreta, solo backend |
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

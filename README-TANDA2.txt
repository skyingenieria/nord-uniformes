════════════════════════════════════════════════════════════════════════════════
                    TANDA 2 — COMPLETADO ✓
════════════════════════════════════════════════════════════════════════════════

📦 ARCHIVOS CREADOS / MODIFICADOS:

APIs (Vercel serverless functions):
  ✓ api/orders.js              — Guardar órdenes en Sheets
  ✓ api/validate-code.js       — Validar códigos descuento
  ✓ api/admin/auth.js          — Login con token HMAC (8hs)
  ✓ api/admin/orders.js        — Listar + actualizar estado órdenes

Páginas:
  ✓ confirmacion.html          — Post-compra con resumen y WhatsApp
  ✓ admin.html                 — Panel admin dark mode con analytics
  ✓ carrito.html (ACTUALIZADO) — Ahora integra códigos + guardado backend

Configuración:
  ✓ vercel.json (ACTUALIZADO)  — Nuevas rewrites para /confirmacion y /admin
  ✓ .env.example               — Documentación de variables necesarias
  ✓ TANDA2.md                  — Documentación completa

════════════════════════════════════════════════════════════════════════════════

📋 PRÓXIMOS PASOS (MANUALES):

1. CREAR HOJAS EN GOOGLE SHEETS:
   - Abrir ERP en Sheets
   - Insert → Sheet → "Órdenes"
   - Insert → Sheet → "Codigos"
   
2. AGREGAR ENCABEZADOS:
   
   Hoja "Órdenes" (fila 1):
   ID | Fecha | Nombre | Apellido | Email | Telefono | Items | Subtotal | 
   Descuento | Codigo | Total | Pago | Envio | Direccion | CP | Localidad | Estado

   Hoja "Codigos" (fila 1):
   Codigo | Descuento% | Usos_max | Usos_actuales | Activo | Valido_hasta

3. AGREGAR EJEMPLO DE CÓDIGO (fila 2 de "Codigos"):
   PRUEBA | 10 | 50 | 0 | SI | 31/12/2026

4. VERIFICAR VARIABLES EN VERCEL:
   - GOOGLE_SERVICE_ACCOUNT_EMAIL ✓ (debe estar)
   - GOOGLE_PRIVATE_KEY ✓ (debe estar)
   - SPREADSHEET_ID ✓ (debe estar)
   - ADMIN_PASSWORD ← NUEVO: Agregar una contraseña segura

5. ACTUALIZAR DATOS BANCARIOS EN carrito.html:
   - Línea 157-159: CBU, ALIAS, TITULAR
   - Cambia "TU_CBU_ACÁ" por tu CBU real

════════════════════════════════════════════════════════════════════════════════

🎯 FLUJO DE PRUEBA:

1. Ir a https://tu-dominio.com/wellspring
2. Agregar un producto al carrito
3. Ir a /carrito
4. Llenar datos (nombre, apellido, tel, email)
5. Seleccionar envío y pago
6. Ingresar código "PRUEBA" → debe mostrar "Descuento aplicado: 10%"
7. Click "Confirmar pedido por WhatsApp"
   → Debe guardar en Sheets "Órdenes"
   → Debe redirigir a /confirmacion
   → Debe mostrar resumen con OrderID
8. Click botón WhatsApp → abre WhatsApp con mensaje pre-armado

9. Ir a https://tu-dominio.com/admin
   → Login con tu ADMIN_PASSWORD
   → Ver la orden creada en la tabla
   → Click en orden → ver detalles
   → Cambiar estado a "confirmada" → actualizar
   → Verificar en Sheets que cambió

════════════════════════════════════════════════════════════════════════════════

🔐 SEGURIDAD:

- Tokens admin: HMAC válido 8 horas (no expiran durante uso normal)
- Códigos descuento: Validación contra limite de usos + fecha vencimiento
- API CORS abierto: Permite acceso desde cualquier origen (OK para MVP)
- Contraseña admin: Guardada en Vercel secret, no en código

════════════════════════════════════════════════════════════════════════════════

📊 SHEET "ÓRDENES" — COLUMNAS:

A = ID (generado: ORD-XXXXX-YYY)
B = Fecha (formato: "2/6/2026, 14:30:45")
C = Nombre
D = Apellido
E = Email
F = Telefono
G = Items (JSON: [{"nombre":"...", "talle":"...", "qty":1, "precio":8500}])
H = Subtotal
I = Descuento (en pesos)
J = Codigo (ej: PRUEBA)
K = Total (Subtotal - Descuento)
L = Pago (transferencia | nave)
M = Envio (retiro | correo)
N = Direccion (si envio=correo)
O = CP
P = Localidad
Q = Estado (pendiente | confirmada | enviada | cancelada)

════════════════════════════════════════════════════════════════════════════════

📊 SHEET "CODIGOS" — COLUMNAS:

A = Codigo (ej: BIENVENIDA)
B = Descuento% (ej: 10)
C = Usos_max (ej: 50, 0 = ilimitado)
D = Usos_actuales (ej: 12)
E = Activo (SI | NO)
F = Valido_hasta (DD/MM/YYYY, ej: 31/12/2026)

════════════════════════════════════════════════════════════════════════════════

✅ CHECKLIST FINAL:

[ ] Hojas "Órdenes" y "Codigos" creadas
[ ] Encabezados agregados
[ ] ADMIN_PASSWORD en Vercel
[ ] CBU/ALIAS actualizados en carrito.html
[ ] Código de prueba "PRUEBA" creado en Sheets
[ ] Prueba completa del flujo (agregar → carrito → checkout)
[ ] Panel admin funciona (/admin)
[ ] Orden apareció en Sheets
[ ] Estado se puede actualizar desde admin

════════════════════════════════════════════════════════════════════════════════

❓ PREGUNTAS FRECUENTES:

P: ¿Por qué el código descuento se valida en tiempo real?
R: Para dar feedback inmediato al cliente. La validación es contra Sheets.

P: ¿Qué pasa si alguien intenta usar un código agotado?
R: El API devuelve error, se muestra en rojo en el campo, no se aplica.

P: ¿Los datos se guardan en Sheets ANTES de ir a /confirmacion?
R: Sí. Si /api/orders falla, no redirige a confirmacion. El error se muestra.

P: ¿Cómo incremento "Usos_actuales" cuando se usa un código?
R: Por ahora es manual. Se puede automatizar con un trigger de Apps Script.

P: ¿El token admin expira?
R: Sí, cada 8 horas. Si refrescás la página después de 8hs, necesitás login otra vez.

P: ¿Puedo ver las órdenes sin admin?
R: No. /api/admin/orders requiere token. /admin page requiere login.

════════════════════════════════════════════════════════════════════════════════

Escrito: 2 de Junio de 2026
Versión: Tanda 2 — MVP completo

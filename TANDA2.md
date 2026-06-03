# TANDA 2 — Sistema de Órdenes + Admin Panel

## 🎯 Qué está implementado

### APIs (Vercel serverless functions)
- **`/api/orders` (POST)** — Guarda una orden en la hoja "Órdenes"
- **`/api/validate-code` (GET)** — Valida códigos descuento desde la hoja "Codigos"
- **`/api/admin/auth` (POST)** — Login con ADMIN_PASSWORD, devuelve token HMAC válido 8hs
- **`/api/admin/orders` (GET/PATCH)** — Lista órdenes + actualizar estado (requiere token)

### Páginas
- **`/confirmacion`** — Página post-compra que lee `sessionStorage.nord_last_order` y muestra resumen con botón WhatsApp
- **`/admin`** — Panel admin con login, tabla de órdenes, filtros, analytics (prendas más vendidas, métodos pago)

### Carrito actualizado
- **Campo de código descuento** en nueva sección "Código descuento"
- **Validación en tiempo real** contra `/api/validate-code`
- **Descuento aplicado en resumen** si el código es válido
- **Guardado de orden** en Sheets via `/api/orders` antes de redirigir a `/confirmacion`

---

## 🔧 Variables de entorno necesarias (en Vercel)

Todas ya deberían estar cargadas, pero validar que existan:

```
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_PRIVATE_KEY=...
SPREADSHEET_ID=...
ADMIN_PASSWORD=...
```

---

## 📊 Estructura de hojas Google Sheets

### Órdenes (nueva hoja: "Órdenes")
```
Columnas: A=ID | B=Fecha | C=Nombre | D=Apellido | E=Email | F=Telefono | 
          G=Items (JSON) | H=Subtotal | I=Descuento | J=Codigo | K=Total | 
          L=Pago | M=Envio | N=Direccion | O=CP | P=Localidad | Q=Estado
```

Valores de **Estado**: `pendiente` | `confirmada` | `enviada` | `cancelada`
Valores de **Pago**: `transferencia` | `nave`
Valores de **Envio**: `retiro` | `correo`

### Codigos (nueva hoja: "Codigos")
```
Columnas: A=Codigo | B=Descuento% | C=Usos_max | D=Usos_actuales | 
          E=Activo (SI/NO) | F=Valido_hasta (DD/MM/YYYY)
```

Ejemplo de fila:
```
BIENVENIDA | 10 | 50 | 12 | SI | 30/12/2026
```

---

## 🔐 Panel Admin (`/admin`)

1. **Login**: Ingresá ADMIN_PASSWORD
2. **Stats**: Total órdenes, pendientes, confirmadas, facturación, ticket promedio
3. **Filtros**: Por estado (todas, pendiente, confirmada, enviada, cancelada) + búsqueda por nombre/email/ID
4. **Tabla**: ID, Fecha, Cliente (nombre + email), Prendas, Total, Pago, Envío, Estado
5. **Click en orden**: Abre panel lateral con detalles completos + selector de estado + botón actualizar
6. **Analytics**:
   - Prendas más vendidas (gráfico de barras)
   - Métodos de pago (gráfico de barras)

---

## 🛒 Flujo de compra completo (Tanda 2)

1. Cliente en `/wellspring` → agrega productos al carrito
2. Va a `/carrito` → llena datos (nombre, apellido, teléfono, email)
3. Selecciona **envío** (retiro gratis o correo a calcular)
4. Selecciona **método de pago** (transferencia o Nave)
5. *(Opcional)* Ingresa un **código descuento** → validación en tiempo real
6. Click **"Confirmar pedido por WhatsApp"**
7. Frontend llama `POST /api/orders` con todos los datos
8. Backend guarda en hoja "Órdenes" y devuelve `orderId`
9. Frontend guarda datos en `sessionStorage.nord_last_order`
10. Redirige a `/confirmacion`
11. En `/confirmacion`: muestra resumen, botón WhatsApp pre-armado, link "Seguir comprando"
12. Cliente abre WhatsApp, avisa que hizo el pedido
13. Vos en el panel admin (`/admin`) → ves la orden en estado "pendiente"
14. Después de confirmar pago: actualizás estado a "confirmada"
15. Cuando despachás: actualizás a "enviada"

---

## ⚙️ Cómo crear las hojas (si no están)

### Opción 1: Manual en Google Sheets
1. Abre la hoja ERP
2. Insert → Sheet → Órdenes
3. Agrega encabezados en fila 1
4. Repite para "Codigos"

### Opción 2: Por API (programaticamente)
```javascript
// Crear hoja "Órdenes"
sheets.spreadsheets.batchUpdate({
  spreadsheetId: SPREADSHEET_ID,
  requests: [{
    addSheet: {
      properties: { title: "Órdenes" }
    }
  }]
});
```

---

## 🎨 Notas de diseño

- **Confirmación**: Usa mismo color scheme (dorado/azul) que el resto de la tienda
- **Admin**: Dark mode (fondo oscuro #0d1117) para contrastar con mucha info
- **Validación**: En tiempo real para códigos; campos obligatorios en carrito con mensajes de error rojos
- **Analytics**: Gráficos simples de barras (sin librerías externas, CSS puro)

---

## 🚀 Lo que falta (extras opcionales)

- Notificación por email al cliente cuando se confirma la orden
- Descuento automático en stock después de confirmar
- Exportar órdenes a Excel
- Historial de compras por cliente (guardando email)
- Integración real Nave (actualmente es stub)
- Incrementar `Usos_actuales` en la hoja "Codigos" cuando se usa un código

---

## 📝 Testing checklist

- [ ] Crear código descuento en hoja "Codigos"
- [ ] Agregar producto a carrito
- [ ] Ir a `/carrito`
- [ ] Ingresar código descuento → debe validar y mostrar descuento
- [ ] Completar datos (nombre, apellido, tel, email)
- [ ] Seleccionar envío y pago
- [ ] Click "Confirmar pedido" → debe guardar en Sheets
- [ ] Redirigir a `/confirmacion` → mostrar resumen con OrderID
- [ ] Botón WhatsApp → debe abrir con mensaje pre-armado
- [ ] Entrar a `/admin` → login con password
- [ ] Ver orden creada en tabla de órdenes
- [ ] Actualizar estado → debe reflejarse en Sheets

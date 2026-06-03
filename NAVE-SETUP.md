# Integración Nave — Setup

## Variables de entorno para Vercel

Ingresá a **Vercel → Settings → Environment Variables** y agrega:

```
NAVE_CLIENT_ID = Q8C0E2tRTNTlBRnehPy40RnwdBQlPVhh
NAVE_CLIENT_SECRET = zV15flR9xCcPcNL2umo0OVCxTbKUhQJPZtQTjbZ8pcRpb4na3qsZ4tpmMJy9hrV0
NAVE_POS_ID = f71ba756-1d80-4ab3-9f43-5dc247fd6c4a
NAVE_ENV = sandbox
NAVE_CALLBACK_URL = https://norduniformes.com.ar/confirmacion
```

⚠️ **IMPORTANTE:** 
- Marcar todas como **Production** (si usás Vercel Hobby/Pro)
- `NAVE_ENV = sandbox` para pruebas
- Cambiar a `NAVE_ENV = prod` cuando paséis a producción

---

## Configurar webhook en Nave

1. Ingresá a **Nave > Integraciones > Tienda Online Propia**
2. En **Notification URL (Sandbox):** ingresá:
   ```
   https://norduniformes.com.ar/api/nave/webhook
   ```
3. Guardá

---

## Flujo de pago con Nave

1. **Cliente selecciona "Nave" en carrito**
2. **Click "Confirmar pedido"**
   - Orden se guarda en Sheets "Órdenes" (estado: `pendiente`)
   - Se crea intención de pago en Nave
   - Se redirige a checkout de Nave

3. **Cliente completa pago en Nave**
   - QR o formulario de tarjeta
   - Aprobado ✓ o Rechazado ✗

4. **Nave envía webhook** con resultado
   - Nuestro endpoint `/api/nave/webhook` recibe notificación
   - Verifica el estado en Nave
   - Actualiza Sheets:
     - `APPROVED` → estado `confirmada`
     - `REJECTED/CANCELLED` → estado `cancelada`

5. **Cliente redirigido a `/confirmacion`**
   - Ve resumen del pedido
   - Estado = pendiente confirmación

6. **En admin panel (`/admin`)**
   - Ves la orden con estado actualizado
   - Puedes cambiar a `confirmada`, `enviada`, etc.

---

## Estados de un pago en Nave

| Estado | Significado |
|--------|-------------|
| PENDING | Transacción iniciada, sin resultado final |
| APPROVED | Pago aprobado ✓ |
| REJECTED | Pago rechazado ✗ |
| CANCELLED | Cancelación manual |
| REFUNDED | Devolución |

---

## Testing

### Tarjetas de prueba (Sandbox)

**Aprobada:**
- Número: `4025 2200 0000 0139`
- Vencimiento: cualquiera
- CVV: cualquiera
- Resultado: `APPROVED`

**Rechazada:**
- Número: `4025 2200 0000 0127`
- Vencimiento: cualquiera
- CVV: cualquiera
- Resultado: `REJECTED`

---

## Checklist

- [ ] Variables de entorno agregadas en Vercel
- [ ] Deploy completado
- [ ] Webhook URL configurada en Nave
- [ ] Testear flujo con tarjeta aprobada
- [ ] Verificar que orden aparece en Sheets con estado `confirmada`
- [ ] Verificar en admin panel
- [ ] Testear con tarjeta rechazada
- [ ] Cambiar `NAVE_ENV` a `prod` cuando estés listo (y actualizaciones las credenciales de producción)

---

## Endpoints

- `POST /api/nave/create-payment` — Crear intención de pago
- `POST /api/nave/webhook` — Recibir notificaciones de Nave (llamado por Nave, no por usuario)

## Archivos

- `api/nave/auth.js` — Obtener access_token con cache
- `api/nave/create-payment.js` — Crear intención de pago
- `api/nave/webhook.js` — Procesar notificaciones

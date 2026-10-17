# 📱 Integración WhatsApp — Gestión GADU

Resumen técnico de la integración **WhatsApp Cloud API (Meta) ↔ Supabase Edge Functions** para el proyecto GADU Construye.

---

## 🧩 Edge Functions

### 1. `whatsapp-webhook` (principal)
Ruta: `/functions/v1/whatsapp-webhook`

- Recibe los webhooks de Meta.
- **GET** → handshake `hub.challenge` (verificación con `WHATSAPP_VERIFY_TOKEN`).
- **POST** → responde `200 OK` inmediato y encola el mensaje en la cola FIFO para procesarlo en segundo plano (`EdgeRuntime.waitUntil`).
- Procesa: texto, código de vinculación, gastos/ingresos/empleados/obras/adelantos, saludos, **Quick Capture** (gasto sin obra) y **mensajes interactivos** (`button_reply`).

### 2. `whatsapp-daily-cron` (recordatorios)
Ruta: `/functions/v1/whatsapp-daily-cron`

- Corre **todos los días a las 19:00 (Argentina)** vía `pg_cron` + `pg_net`.
- Busca gastos `workId = null` (sin asignar) de las últimas 24h.
- Envía un mensaje interactivo con botones para asignar el gasto a una obra (o "Gasto General").

---

## 📂 Archivos del módulo `whatsapp-webhook`

| Archivo | Propósito |
|---|---|
| `index.ts` | Handler GET/POST, `sendWhatsApp`, `processMessage`, `drainPhone`, `detectInteractive`, `handleButtonReply` |
| `core.ts` | `parseIncoming`, `normalizePhone`, `matchVerificationCode`, `localIntent`, `executeAction`, `normCategory`, `buildContext` |
| `queue.ts` | Cola FIFO: `enqueueMessage`, `claimNext`, `markDone`, `markFailed` |

> ⚠️ **Nota**: la transcripción de audio (`transcribe.ts`) quedó **diseñada pero NO implementada** todavía. Los mensajes de audio no se transcriben; solo se procesa texto.

---

## 🔄 Flujo completo

```
Meta (WhatsApp)
   │  webhook POST / GET
   ▼
whatsapp-webhook
   │  200 OK inmediato
   ▼
whatsapp_queue (cola FIFO por teléfono)
   ▼
processMessage
   ├─ Texto → parseIncoming → localIntent / ai-assistant → executeAction
   │      ├─ Con obra → guarda en expenses (workId = obra)
   │      └─ Sin obra → Quick Capture (workId = null, "bandeja")
   ├─ Código → vincula cuenta (linked:true + whatsapp_number)
   └─ Interactive → button_reply → asigna gasto pendiente
   ▼
app_data (JSONB) + profiles.whatsapp_number
   ▲
whatsapp-daily-cron (19:00) → busca workId null → envía botones
```

---

## 🔑 Variables de entorno (secrets de Supabase)

| Variable | Uso |
|---|---|
| `SUPABASE_URL` | URL del proyecto (autoinyectada) |
| `SUPABASE_ANON_KEY` | Clave anon (autoinyectada) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave service_role (bypassea RLS) |
| `WHATSAPP_TOKEN` | Token permanente de Meta (System User) |
| `WHATSAPP_PHONE_ID` | Phone Number ID del número de producción |
| `WHATSAPP_WABA_ID` | WhatsApp Business Account ID |
| `WHATSAPP_VERIFY_TOKEN` | Token del handshake GET |
| `CRON_SECRET` | Secreto compartido para `whatsapp-daily-cron` |
| `GEMINI_API_KEY` | Clave de Gemini (solo si se implementa transcripción de audio) |
| `GEMINI_MODEL` | Modelo de Gemini (idem) |

---

## 🗄️ Tablas de base de datos

| Tabla | Propósito |
|---|---|
| `app_data` | Documento JSONB por usuario (obras, gastos, ingresos, perfil, whatsapp) |
| `profiles` | Perfil canónico del usuario (incluye `whatsapp_number`) |
| `whatsapp_queue` | Cola FIFO de mensajes entrantes |
| `cron.job` | Job programado del cron (`whatsapp-daily-cron-1900`) |

---

## 🚀 Despliegue

```bash
npx supabase functions deploy whatsapp-webhook --project-ref kalqvykomlfwxmsdaipf --no-verify-jwt
npx supabase functions deploy whatsapp-daily-cron --project-ref kalqvykomlfwxmsdaipf --no-verify-jwt
```

## 🧪 Prueba manual rápida

1. Mandar *"Gasté 5000 en nafta"* → se guarda en bandeja (`workId = null`).
2. Disparar el cron manualmente:
   ```bash
   curl -X POST "https://kalqvykomlfwxmsdaipf.supabase.co/functions/v1/whatsapp-daily-cron" \
     -H "Authorization: Bearer <CRON_SECRET>" -H "Content-Type: application/json" -d '{}'
   ```
3. Tocar el botón en WhatsApp → asigna el gasto a la obra o como "Gasto General".

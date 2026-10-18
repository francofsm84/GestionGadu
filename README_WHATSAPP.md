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
| `core.ts` | `parseIncoming`, `extractFrom`, `normalizePhone`, `matchVerificationCode`, `localIntent`, `executeAction`, `normCategory`, `buildContext` |
| `queue.ts` | Cola FIFO: `enqueueMessage`, `claimNext`, `markDone`, `markFailed` |
| `transcribe.ts` | Transcripción de notas de voz con Gemini: `getMediaUrl` → `downloadMedia` → `geminiTranscribe` → `resolveIncomingText` |

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
| `SERVICE_SECRET` | Secreto compartido `webhook → ai-assistant` (modo servidor) |
| `GEMINI_API_KEY` | Clave de Gemini (transcripción de audio + IA) |
| `GEMINI_MODEL` | Modelo de Gemini. **⚠️ DEBE ser un modelo válido que soporte audio** (ver nota abajo) |

> ### ⚠️ CRÍTICO: `GEMINI_MODEL`
> El valor **debe ser un modelo real y multimodal**. Un typo aquí rompe **toda** la transcripción de voz y la IA.
> - ✅ Válidos: `gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-1.5-pro`.
> - ❌ Inválido: `gemini-3.5-flash` (no existe — fue la causa de que el audio fallara).
>
> Verificar/actualizar:
> ```bash
> npx supabase secrets list --project-ref kalqvykomlfwxmsdaipf | Select-String GEMINI
> npx supabase secrets set GEMINI_MODEL="gemini-2.0-flash" --project-ref kalqvykomlfwxmsdaipf
> ```

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
npx supabase functions deploy ai-assistant --project-ref kalqvykomlfwxmsdaipf --no-verify-jwt
```

## 🧪 Prueba manual rápida

1. Mandar *"Gasté 5000 en nafta"* → se guarda en bandeja (`workId = null`).
2. Disparar el cron manualmente:
   ```bash
   curl -X POST "https://kalqvykomlfwxmsdaipf.supabase.co/functions/v1/whatsapp-daily-cron" \
     -H "Authorization: Bearer <CRON_SECRET>" -H "Content-Type: application/json" -d '{}'
   ```
3. Tocar el botón en WhatsApp → asigna el gasto a la obra o como "Gasto General".

---

## 🖼️ Actualizar la foto de perfil de WhatsApp

Script local (Node) que sube una imagen vía **Resumable Upload API** de Meta y la aplica al perfil con `profile_picture_handle`.

### Parámetros (variables de entorno)

| Variable | Valor | Nota |
|---|---|---|
| `WHATSAPP_TOKEN` | `EAA…` | Token permanente (System User) |
| `META_APP_ID` | `2128399724733078` | App ID de Meta |
| `WHATSAPP_PHONE_ID` | `1473438079178247` | Phone Number ID del número **real** (+5493547665984) |
| `IMAGE_URL` | `logo wpp gadu.png` | Ruta local de la imagen (fondo azul, 1000×1000) |

### Comando (PowerShell)

```powershell
$env:WHATSAPP_TOKEN = "EAA..."
$env:WHATSAPP_PHONE_ID = "1473438079178247"
$env:META_APP_ID = "2128399724733078"
$env:IMAGE_URL = "logo wpp gadu.png"   # ruta local por defecto
node scripts/run-profile-update.mjs
```

> `IMAGE_URL` acepta una **URL pública** (`https://…`) o una **ruta local**. Por defecto apunta al activo `logo wpp gadu.png` (fondo azul). Para otro número, cambiá `WHATSAPP_PHONE_ID` (el Phone Number ID de 15 dígitos, no el número de teléfono).

### Verificar

```powershell
Invoke-RestMethod -Uri "https://graph.facebook.com/v21.0/1473438079178247/whatsapp_business_profile?fields=profile_picture_url" -Headers @{ Authorization = "Bearer $env:WHATSAPP_TOKEN" }
```

Debería devolver un `profile_picture_url` apuntando a `pps.whatsapp.net`.

---

## 🧰 Troubleshooting (Solución de problemas)

### 1. "El bot no responde por WhatsApp"
- Revisá en **Meta for Developers → WhatsApp → Configuración → Webhook**:
  - **Callback URL** exacta: `https://kalqvykomlfwxmsdaipf.supabase.co/functions/v1/whatsapp-webhook`
  - **Verify token** = el valor de `WHATSAPP_VERIFY_TOKEN`.
  - Field **`messages`** = **Subscribed**.
- Verificá el handshake: `GET .../whatsapp-webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=123` debe devolver `123`.
- Asegurate de que la App esté **suscrita a la WABA**:
  ```bash
  curl -X POST "https://graph.facebook.com/v21.0/4685722798416623/subscribed_apps" -H "Authorization: Bearer $WHATSAPP_TOKEN"
  ```

### 2. "El bot responde pero no guarda los gastos"
- Revisá si hay **más de una obra activa** en `app_data.data.works`. Con varias activas, el gasto sin obra cae en Quick Capture (se guarda con `workId = null`, correcto) o pide la obra.
- Revisá que el gasto NO quedó en la cola trabado:
  ```sql
  select id, phone, status, attempts from whatsapp_queue order by id desc limit 10;
  ```
  - `pending` = no se drenó; `processing` por mucho tiempo = quedó trabado (limpiar manualmente).
- Confirmá que `SUPABASE_SERVICE_ROLE_KEY` está disponible (la Edge Function la usa para escribir en `app_data`).

### 3. "El bot manda el mensaje genérico de fallback"
- **Causa más común: `GEMINI_MODEL` inválido** (ej. `gemini-3.5-flash`). Verificá que sea `gemini-2.0-flash` (ver nota arriba).
- Revisá que `ai-assistant` no devuelva **401**: la llamada `webhook → ai-assistant` usa `SERVICE_SECRET` (`x-service-secret`) y `Authorization: Bearer <service_role>`.
- Mirá los logs del webhook buscando `[GADU-WA-AI] ai-assistant http …` para ver el status/body real de la IA.

---

## ✅ Checklist de mantenimiento (antes/después de cada cambio)

- [ ] Desplegar **siempre** con `--no-verify-jwt`:
  ```bash
  npx supabase functions deploy <funcion> --project-ref kalqvykomlfwxmsdaipf --no-verify-jwt
  ```
- [ ] Verificar que `GEMINI_MODEL` siga siendo un modelo válido (`gemini-2.0-flash`).
- [ ] Revisar que la cola no tenga mensajes en `processing` trabados:
  ```sql
  select count(*) from whatsapp_queue where status = 'processing';
  ```
- [ ] Confirmar que el cron sigue programado:
  ```sql
  select jobid, jobname, schedule, active from cron.job;
  ```
- [ ] Probar los 4 canales: **texto**, **audio (nota de voz)**, **botón interactivo** y **cola en ráfaga** (3 mensajes seguidos).
- [ ] Verificar que los secretos críticos estén cargados (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `CRON_SECRET`, `SERVICE_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL`).
- [ ] Recordar que los cambios de **secret** toman efecto al instante (no requieren redeploy), pero los cambios de **código** sí.

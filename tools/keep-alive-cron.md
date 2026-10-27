# GADU · Keep-Alive (evitar suspensión por inactividad de Supabase)

Supabase **pausa el proyecto** del plan gratuito tras **7 días de inactividad**.
Para evitarlo, hay que generar **tráfico de API periódico** hacia PostgREST
(la base de datos), no hacia las Edge Functions (esas no "despiertan" la DB).

## 1. Endpoint de salud (seguro y de solo lectura)

Usá una consulta **GET de solo lectura** sobre una tabla pública. Recomendada:
`planes` (tiene política RLS de lectura pública `using (true)`).

```
GET https://kalqvykomlfwxmsdaipf.supabase.co/rest/v1/planes?select=id&limit=1
Headers:
  apikey: sb_publishable_QFhRFnw-ndqcct6XkYb-GA_SCNVAal2
  Authorization: Bearer sb_publishable_QFhRFnw-ndqcct6XkYb-GA_SCNVAal2
```

> ⚠️ Usá **SOLO la anon/publishable key** (es pública y está embebida en el frontend).
> **NUNCA** pongas la `SUPABASE_SERVICE_ROLE_KEY` en un cron externo: da acceso total.

Respuesta esperada: `200 OK` con un array JSON (puede traer 0 o 1 fila, da igual).
Esa sola llamada ya cuenta como actividad y resetea el contador de 7 días.

---

## 2. Configurar Cron-job.org (recomendado, gratis)

1. Entrá a https://cron-job.org y creá una cuenta (o iniciá sesión).
2. **Create Cronjob**:
   - **Title**: `GADU keep-alive`
   - **URL**: `https://kalqvykomlfwxmsdaipf.supabase.co/rest/v1/planes?select=id&limit=1`
   - **Request method**: `GET`
   - **Schedule**: `Every 3 days` (o `0 */72 * * *`). Menos de 7 días siempre.
3. **Headers** (en la pestaña "Advanced" / "HTTP headers"), agregá dos:
   - `apikey` → `sb_publishable_QFhRFnw-ndqcct6XkYb-GA_SCNVAal2`
   - `Authorization` → `Bearer sb_publishable_QFhRFnw-ndqcct6XkYb-GA_SCNVAal2`
4. Guardá. Verificá con "Test run" que devuelva `200`.

---

## 3. Configurar UptimeRobot (alternativa)

1. https://uptimerobot.com → **Add New Monitor**.
2. **Monitor Type**: `HTTP(s)`.
3. **Friendly Name**: `GADU keep-alive`.
4. **URL**: `https://kalqvykomlfwxmsdaipf.supabase.co/rest/v1/planes?select=id&limit=1`.
5. **Monitoring Interval**: `1440 minutes` (24 h) — sirve también como uptime.
6. En **Advanced → Custom HTTP Headers**, agregá:
   - `apikey`: `sb_publishable_QFhRFnw-ndqcct6XkYb-GA_SCNVAal2`
   - `Authorization`: `Bearer sb_publishable_QFhRFnw-ndqcct6XkYb-GA_SCNVAal2`
7. Crear monitor.

> Nota: UptimeRobot repite cada intervalo elegido; con 24h ya es suficiente para
> no superar los 7 días. Cron-job.org permite exactamente "cada 3 días".

---

## 4. Automatización alternativa: GitHub Actions

Ya dejé un workflow en `.github/workflows/keep-alive.yml`. Para usarlo:

1. En el repo, configurá un **secret** (no es sensible, es la clave pública):
   `Settings → Secrets and variables → Actions → New repository secret`
   - Nombre: `SUPABASE_ANON_KEY`
   - Valor: `sb_publishable_QFhRFnw-ndqcct6XkYb-GA_SCNVAal2`
2. El workflow corre cada 3 días (`0 0 */3 * *`) y hace el `curl` al endpoint.
3. (Opcional) Si el repo está privado, GitHub Actions corre igual; si es público,
   verificá que Actions esté habilitado en la pestaña "Actions".

---

## Verificación manual

```bash
curl -i "https://kalqvykomlfwxmsdaipf.supabase.co/rest/v1/planes?select=id&limit=1" \
  -H "apikey: sb_publishable_QFhRFnw-ndqcct6XkYb-GA_SCNVAal2" \
  -H "Authorization: Bearer sb_publishable_QFhRFnw-ndqcct6XkYb-GA_SCNVAal2"
```

Si ves `HTTP/1.1 200 OK` + un JSON, está todo correcto.

---

## Seguridad

- ✅ Solo se usa la **anon key** (pública).
- ✅ Es una **lectura** (`select id limit 1`) que no muta ninguna tabla.
- ❌ No uses `service_role`, ni endpoints de escritura, ni credenciales de Meta.

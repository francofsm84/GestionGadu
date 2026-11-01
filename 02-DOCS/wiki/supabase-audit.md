---
type: audit
title: Supabase — Auditoría de seguridad (RLS + webhooks)
description: Reporte consolidado del cierre del hardening de RLS y validación de webhooks.
tags: [security, supabase, rls, audit]
timestamp: 2026-10-31T23:29:00-03:00
topic: security
---

# Auditoría de seguridad — Supabase

> Fecha: 2026-10-31 · Estado: **cerrado** · HEAD: `b4b71ff`

## Resumen

Integración de Supabase verificada. **5 de 6 tablas principales** quedaron con RLS estricto; la sexta (`negocio`) se blindó y su hardening se confirmó aplicado en el Dashboard. Los webhooks externos validan autenticidad. No se alteró lógica de negocio ni UI.

## 1. Estado RLS — tablas principales

| Tabla | RLS | Lectura (SELECT) | Escritura | Veredicto |
|---|---|---|---|---|
| `profiles` | ✅ | `user_id = auth.uid()` OR `es_admin()` | update: propio/admin · insert: propio · delete: admin | ✅ |
| `app_data` | ✅ | `user_id = auth.uid()` OR `es_admin()` | insert/update/delete: `user_id = auth.uid()` | ✅ |
| `planes` | ✅ | `true` (público — **por diseño**, pricing público) | update/insert: `es_admin()` | ✅ excepción intencional |
| `pagos` | ✅ | `user_id = auth.uid()` OR `es_admin()` | igual | ✅ |
| `negocio` | ✅ | `auth.uid() IS NOT NULL` (aplicado) | update: `es_admin()` | ✅ cerrado |
| `credenciales_pago` | ✅ | `es_admin()` | `es_admin()` | ✅ |

## 2. Hallazgo `negocio` — cerrado

- **Problema:** `negocio_select` usaba `for select using (true)`, exponiendo `datos_fiscales` a cualquier llamador (incluso sin sesión).
- **Fix:** `migrations/hardening-negocio-rls.sql` → reemplaza la política por `negocio_select_auth` con `(auth.uid() IS NOT NULL)`.
- **Confirmado:** la política activa en el Dashboard es `negocio_select_auth`; `negocio_select` fue removida.

## 3. Excepción `planes` (preservada)

`planes` mantiene `select using (true)` **a propósito**: la página de pricing pública (landing `#/planes`) necesita leer los precios sin sesión. La escritura sigue restringida a `es_admin()`.

## 4. Webhooks — validación de autenticidad

| Webhook | Origen | Verificación | Veredicto |
|---|---|---|---|
| `whatsapp-webhook` | Meta | HMAC-SHA256 (`x-hub-signature-256`) → `403` si falta/falla (solo `DEBUG_MODE=true` relaja) | ✅ estricto |
| `mercadopago-webhook` | MercadoPago | Consulta el pago a la API de MP + idempotencia (patrón estándar de MP, sin HMAC) | ✅ aceptable |
| `send-*`, `notificar-*` | Interno (app/cron) | JWT / service role; no son endpoints externos | ✅ |

## 5. Verificación en el repo

```powershell
git status -sb   # → ## main...origin/main
git log --oneline -1
```

## 6. Sin deuda de seguridad pendiente

- Cero secretos hardcodeados en `js/` (anon key `sb_publishable_*` es la permitida).
- XSS `renderText` y `bubble()` escapados.
- Sync (`js/sync.js`) filtra `user_id=eq.<uid>` + RLS + Realtime filtrado.
- Triggers anti-downgrade (`blindar_super_admin`, `blindar_admin`, `blindar_licencia`).

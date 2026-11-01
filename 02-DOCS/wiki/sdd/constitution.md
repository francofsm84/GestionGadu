---
type: constitution
title: GADU (dashboard contable) — Constitution
description: Reglas no negociables que toda fase SDD obedece.
tags: [sdd, constitution]
timestamp: 2026-10-31T23:07:00-03:00
topic: sdd
version: v1.0.0
---

# GADU — Constitution

> v1.0.0 · Ratificada: 2026-10-31 · Última enmienda: 2026-10-31
> La mecánica de stack vive en `02-DOCS/wiki/stack/*`; acá se ratifica el principio y se enlaza el detalle.

## 1. Stack canon

1. Frontend: Vanilla JS (ES6+), sin framework. Namespace global `window.GADU` (`G`). Bundle único vía `tools/build-bundle.js`.
2. Datos/backend: Supabase (PostgREST + Auth + Edge Functions en Deno). Sin backend propio.
3. Estado: IndexedDB offline-first, un doc JSONB por usuario en `public.app_data`, sincronizado con Supabase.
4. PWA: Service Worker (`sw.js`) + manifest; la app funciona sin señal.

## 2. Quality bar

5. Antes de commitear, los tests pasan en verde: `node test/run-all.js` y `node test/css-check.js`.
6. Las Edge Functions (Deno/TypeScript) compilan (`node --check`) y se despliegan con `supabase functions deploy`.
7. No hay lint/types (Vanilla JS); el gate es tests + css-check + sintaxis.

## 3. Conventions

8. Vistas en `js/views/*.js`; cada una registra su ruta con `G.router.add(...)`.
9. Clases CSS prefijadas por feature (`.lp-*`, `.ob-*`) y verificadas por `css-check.js`.
10. Commits en español, mensaje corto `tipo: resumen` (`fix:`, `feat:`, `chore:`).

## 4. Branching & shipping

11. Los cambios van directo a `main` (workflow elegido). Push vía PAT.
12. **La autoría de git es de la persona.** Sin `Co-Authored-By` de IA. Se aplica en `ship`.

## 5. Security & privacy floor

13. Ningún secreto se commitea (`service_role`, `MP_ACCESS_TOKEN`, `WHATSAPP_*`, PAT). Vive en secrets de Supabase / env vars.
14. RLS en tablas: cada usuario ve lo suyo (`user_id = auth.uid()`) salvo rol admin (`es_admin()`).
15. Los webhooks validan autenticidad antes de procesar (HMAC estricto en WhatsApp; consulta a la API en MercadoPago).
16. El `super_admin` es inmune a downgrades (`blindar_super_admin`).

## 6. UX / accessibility floor

17. UI 100% en español (voseo), mobile-first, táctil (botones ≥44px).
18. Sin emojis en la UI de cara al usuario; íconos SVG inline.

## 7. Performance budgets

19. Offline-first: el flujo principal no depende de red (sincroniza después).

## 8. Knowledge & decisions

20. Toda decisión significativa se apunta en `02-DOCS/wiki/sdd/decisions.md` (fecha, opciones, por qué).

## Definition of Done (lo que `verify` corre)

Un cambio se mergea solo si TODO se cumple:

- [ ] Tests en verde: `run-all.js` + `css-check.js` (5).
- [ ] Edge Functions compilan (6).
- [ ] Convenciones respetadas (8-10).
- [ ] Autoría humana en el commit (12).
- [ ] Ningún secreto commiteado; RLS/webhooks intactos (13-16).
- [ ] UI en español, sin emojis (17-18).
- [ ] Decisiones significativas apuntadas (20).

## Amendment log (append-only)

| Date | Version | Change | Why |
|------|---------|--------|-----|
| 2026-10-31 | v1.0.0 | Constitución inicial ratificada. | Arranque del arnés SDD. |

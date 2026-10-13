# GADU Construye · Tu obra. Tu plata. Sin cuaderno.

**GADU** es la plataforma de gestión pensada para **contratistas, albañiles y gente de obra**: llevá el control de **cobros, gastos, balances, obras, empleados y herramientas** desde el celular, sin planillas ni cuadernos.

- 📱 **App web progresiva (PWA)**: instalable en la pantalla de inicio del celular, funciona offline y se sincroniza con la nube.
- ☁️ **Multi-usuario (SaaS)**: cada cuenta tiene sus propios datos protegidos en Supabase (Google o email).
- 🤖 **Asistente virtual con IA**: cargás todo hablando o escribiendo, con respuestas por voz y streaming en tiempo real.

---

## Descripción General

GADU Construye centraliza toda la operación de una empresa constructora o de remodelaciones en un solo lugar:

- **Cobros y gastos** por obra, con balance neto en tiempo real.
- **Obras** con estado, avance físico y porcentaje cobrado.
- **Socios y reparto** de ganancias con liquidaciones automáticas.
- **Empleados, jornadas, adelantos y liquidación**.
- **Herramientas e inversión** con control de ubicación y mantenimiento.
- **Agenda** de contactos con llamada y WhatsApp directos.

Todo diseñado para **usarse en la obra**: pantallas simples, botones grandes y un asistente que entiende cómo hablás.

---

## Módulos y Funcionalidades Principales

### 📊 Dashboard / Panel General
- **Balance neto**, ingresos y gastos del período, y **porcentaje cobrado** por obra.
- **Flujo de caja** interactivo (ingresos vs. egresos).
- **Inversión en herramientas**, distribución de gastos y alertas de vencimientos (seguros y liquidaciones).
- Selector de **período de análisis** (este mes, últimos 3/6/12 meses o rango personalizado).
- **Últimos movimientos** y obras en curso de un vistazo.

### 🏗️ Obras
- Tablero por estado: **activas / pausadas / finalizadas**, con avance físico y de cobro.
- Detalle por obra: presupuesto, cobros, costos, **margen en tiempo real**, personal asignado (días, horas y costo), adelantos del cliente y adelantos a empleados.
- Búsqueda, filtros y altas al vuelo.

### 📄 Presupuestos
- Cotizaciones ordenadas con editor de ítems, descuentos y subtotales automáticos.
- Estados: **borrador / enviado / aprobado / rechazado / vencido**.
- Duplicado, detalle y **registro directo del cobro** desde un presupuesto aprobado.
- Cliente y obra asociados (creación al vuelo desde el mismo formulario).

### 💰 Ingresos y Gastos
- **Ingresos**: cobros por obra con concepto, método de pago y tipo **Cobro/certificación** o **Adelanto del cliente**.
- **Gastos directos de obra** (materiales, mano de obra, fletes, subcontratos, alquiler de equipos) y **gastos generales** (combustible, servicios, impuestos, sueldos, seguros…).
- Pagos al personal marcados como **Sueldo o Adelanto**.
- Filtros, totales y exportación CSV.

### 🤝 Socios y Reparto
- Porcentajes de participación y **distribución de ganancias** automática.
- Reserva de capital configurable, saldo disponible a distribuir y resultado por obra.
- Cronograma de **liquidaciones** con alertas de vencimientos.

### 👷 Empleados y Registro de Jornadas
- Legajo por empleado: contacto, datos de pago, **días trabajados**, horas por obra, **adelantos** y **liquidación**.
- Registro diario de asistencia con horas por obra.
- Pagos separados en sueldos y adelantos, y "cobrado hasta la fecha" por período.
- Fotos/avatar por empleado.

### 🛠️ Herramientas
- **Control de inventario e inversión**: registro de compras, costo y estado (operativo / en reparación / dado de baja).
- **Ubicación actual** (en qué obra está o si está guardada) con historial de movimientos.
- Mantenimiento con costos y rendimiento por obra (días de uso).

### 📅 Agenda
- Directorio de contactos (clientes, proveedores, subcontratistas y socios) con **llamada directa, WhatsApp y e-mail**.
- **Visitas y entregas** organizadas desde el directorio.
- Importación desde la agenda del celular (Android) o por archivo **.vcf / .csv** en escritorio.

### 💾 Respaldos y Datos
- **Copia de seguridad** completa: exportar/importar respaldo JSON.
- Sincronización automática o manual con la nube (Subir / Descargar / Probar conexión).
- Restaurar datos de ejemplo, dejar 1 ejemplo por módulo o vaciar por completo.
- Cerrar sesión y gestionar la cuenta.

> También incluye: **Clientes** (directorio con teléfono unificado Teléfono/WhatsApp), **Seguros** con semáforo de vencimientos, **Planes y límites** por suscripción y **Panel de Administración** para administradores del sistema.

---

## Asistente Virtual GADU (Capataz Digital 🤖)

El chat flotante de GADU es un **asistente conversacional con IA** que funciona con voz y texto:

- **Carga guiada por chat**: creá obras, clientes, empleados, gastos, ingresos, presupuestos, herramientas y jornadas **paso a paso con botones inline**, sin formularios externos. Validación estricta: no guarda hasta tener todos los datos, y confirma con **tilde verde ✔** solo cuando la escritura llegó a la nube.
- **Consultas con números reales**: preguntá *"¿cuánto queda por cobrar en la obra X?"* o *"¿dónde está la amoladora?"* y responde con datos de tu cuenta.
- **Búsqueda inteligente**: *"buscame a Jorge"* busca en obras, empleados, herramientas, clientes, ingresos, gastos, presupuestos y seguros, con botones de acceso directo.
- **Voz**: dictado continuo (Android/Chrome) y respuestas habladas con **voces latinoamericanas** (femeninas y masculinas). En iPhone se usa escritura (degradación elegante).
- **Importación de contactos**: agenda nativa del celular o archivo **.vcf / .csv** como respaldo.
- **COO Virtual** (solo Super Admin): gestioná usuarios, planes, pruebas y métricas del SaaS desde el chat.
- Respuestas en **streaming** palabra por palabra (DeepSeek/Gemini con cadena de respaldo).

---

## Modo de Uso e Instalación / Guía Rápida

### Uso diario (usuario final)

1. Entrá a **`https://gestiongadu.vercel.app`** desde el celular (Chrome recomendado).
2. **Creá tu cuenta** con Google o email (45 días de prueba gratis).
3. Tocá **"Agregar a pantalla de inicio"** para instalarla como una app.
4. Empezá cargando: el **asistente** te guía, o usá los botones **"+"** de la barra superior.
5. Activá la **sincronización automática** en *Respaldos y datos* para que todo quede en la nube.

### Desarrollo / instalación local

Requisitos: un navegador moderno (Chrome/Edge) y Node.js.

```bash
# 1) Clonar el repositorio
git clone https://github.com/francofsm84/GestionGadu.git
cd GestionGadu

# 2) (Opcional) servidor local
node server.js            # → http://localhost:8000
```

No necesita build: es HTML + CSS + JavaScript puro (sin frameworks ni dependencias).

### Configuración de Supabase (una sola vez)

1. Creá un proyecto en [supabase.com](https://supabase.com) con la base `public`.
2. En *SQL Editor*, ejecutá **en orden** todos los archivos de migración:
   `supabase-setup.sql`, luego `supabase-setup-v2.sql` … hasta **`supabase-setup-v21.sql`** (tablas, RLS por usuario, planes, invitaciones, auditoría y códigos de licencia).
3. Configurá las variables de la app (URL y clave anónima de Supabase) en `js/auth.js` / `js/config`.
4. *(Opcional, para el asistente)* Desplegá la Edge Function `ai-assistant`:
   ```bash
   npx supabase functions deploy ai-assistant --no-verify-jwt --project-ref <ref>
   npx supabase secrets set GEMINI_API_KEY=... DEEPSEEK_API_KEY=...
   ```
   La función usa **DeepSeek como proveedor principal** con Gemini de respaldo (streaming SSE).

### Publicación (Vercel)

- Repositorio: **https://github.com/francofsm84/GestionGadu** (rama `main`).
- El sitio está publicado en **Vercel**; cada `git push` a `main` actualiza automáticamente `https://gestiongadu.vercel.app` (sitio estático, sin build).

### Pruebas

```bash
node test/run-all.js        # suite completa de regresión
```

Incluye pruebas de finanzas, sincronización, planes, licencias, CSS y todas las suites del asistente (`ai-smoke`, `ai-audit`, `ai-conversacional`, `ai-search`, `ai-wizard`, `ai-pills`, `ai-voices`, `ai-user-isolation`, `ai-coo`, `ai-mapeo`, `ai-persistencia`, `ui-contactos`) y el **E2E con usuario simulado** (`ai-e2e`), que verifica la escritura real en Supabase contra un mock local.

---

## Estructura del proyecto

```
index.html                  · shell de la aplicación (PWA)
manifest.json               · manifiesto PWA (iconos y splash)
css/styles.css              · sistema de diseño (dark/light, responsive)
js/store.js                 · datos, seed y cálculos financieros
js/ui.js                    · iconos, modales, toasts, importación de contactos
js/charts.js                · gráficos en canvas (flujo de caja y donut)
js/app.js                   · router y arranque
js/auth.js                  · autenticación (Supabase GoTrue)
js/sync.js                  · sincronización de datos por usuario
js/plan.js                  · planes, límites y códigos de licencia
js/ai.js                    · asistente virtual (chat, voz, wizard, intenciones)
js/views/                   · vistas: dashboard, obras, presupuestos, ingresos,
                              gastos, socios, empleados, herramientas, agenda, admin
supabase/functions/ai-assistant/ · Edge Function del asistente (streaming IA)
supabase-setup*.sql         · migraciones de base de datos (v1 … v21)
test/                       · suites de pruebas (run-all.js + mock-supabase)
```

**Tecnología:** HTML + CSS + JavaScript puro (ES6) · Supabase (Auth + PostgREST + RLS) · Edge Function en Deno · IA (DeepSeek/Gemini) · Web Speech API · Contact Picker API · PWA offline-first.

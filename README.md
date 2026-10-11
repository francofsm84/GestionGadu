# GADU Construye · Dashboard contable y de gestión operativa

Aplicación web **100% local y offline** para centralizar las finanzas, el avance de proyectos y la toma de decisiones de GADU Construye (Alta Gracia, Córdoba).

## Cómo abrirla

**Opción recomendada (1 clic):** hacé doble clic en **`ABRIR DASHBOARD.bat`**. Arranca un servidor local con Node y abre el navegador solo en `http://localhost:8000`.

**Opciones alternativas:**

1. **Doble clic en `index.html`** — se abre directo en el navegador predeterminado. Si Windows pregunta con qué programa abrirla, elegí **Chrome o Edge**. Si se abre en blanco, hacé clic derecho sobre el archivo → *Abrir con* → Google Chrome o Microsoft Edge.
2. **Servidor local manual** (necesario si tu navegador bloquea archivos locales): abrí una terminal en esta carpeta y ejecutá:
   ```
   node server.js
   ```
   y entrá a `http://localhost:8000`. Funciona sin internet y sin instalar nada (usa el Node que ya tenés).

## Publicación en internet (GitHub + Vercel)

- Repositorio: **https://github.com/francofsm84/GestionGadu** (rama `main`).
- Para publicar en Vercel: entrá a **vercel.com** → *Add New… → Project* → *Import* el repositorio `GestionGadu` → *Deploy* (no necesita build: es un sitio estático, `vercel.json` ya está incluido). Después cada `git push` actualiza el sitio automáticamente.
- Para actualizar la app desde la PC: `git add -A`, `git commit -m "cambios"` y `git push`.

## Módulos

| Módulo | Qué incluye |
|---|---|
| **Dashboard** | KPIs (ingresos, gastos, balance neto, inversión en herramientas, estado de obras), flujo de caja interactivo (ingresos vs egresos, 8 meses), distribución de gastos por obra + gastos generales, obras en curso, liquidaciones con alertas y últimos movimientos. |
| **Obras** | Tablero kanban (activas / pausadas / finalizadas) y vista de lista, con búsqueda, filtros por estado, avance físico y de cobro, margen por obra. **Al tocar una obra** se abre su detalle con todos los movimientos: presupuesto, cobros, costos, margen en tiempo real, slider de avance físico, **personal asignado** (quién trabajó en esa obra, días, horas y costo estimado), **adelantos del cliente hacia vos** y **adelantos tuyos hacia empleados**, y pestañas de ingresos / gastos / personal / presupuesto. |
| **Presupuestos** | Creación y edición con editor de ítems (cálculo automático de subtotales y descuentos), estados (borrador / enviado / aprobado / rechazado / vencido), duplicado, detalle y registro directo del cobro desde un presupuesto aprobado. **Cliente y Obra son obligatorios**, y podés crearlos al vuelo desde el mismo formulario (botones +): si creás una obra nueva ahí, queda asociada automáticamente al cliente seleccionado. |
| **Ingresos** | Registro de cobros por obra (fecha, monto, concepto, método de pago, cliente), con tipo **Cobro / certificación** o **Adelanto del cliente**, filtros, totales y exportación CSV. |
| **Gastos** | Pestañas "Por obra" (materiales, mano de obra, fletes, subcontratos…) y "Generales / estructura" (combustible, servicios, impuestos…), con proveedor o **empleado** (los pagos al personal se marcan como **Sueldo o Adelanto**), número de factura y método de pago. |
| **Socios y reparto** | Porcentajes de participación, cálculo automático de la utilidad neta, reserva de capital configurable, saldo disponible a distribuir, resultado por obra y cronograma de liquidaciones con alertas de vencimientos. |
| **Empleados** | **Panel global** con tabla ordenada (o tarjetas): por empleado ves teléfono, alias/CBV/CVU de pago, presentes/ausentes del mes, horas del mes, sueldos y adelantos acumulados y última jornada. Legajos individuales con **"cobrado hasta la fecha"** que elijas, asistencia día por día con **horas por obra**, y pagos separados en **sueldos** y **adelantos de dinero**. Si no hay empleados cargados, el modal de jornada ofrece crearlos ahí mismo (botón +) y los agrega al selector al instante. |
| **Herramientas** | Registro de activos y compras, estados (operativo / en reparación / dado de baja), historial de mantenimiento con costos, **ubicación** (en qué obra está o si está guardada) con **historial de movimientos** y **rendimiento por obra** (días de uso en cada una), y totales de inversión. |
| **Clientes** | Directorio propio de clientes: listar, crear, editar y eliminar con nombre/razón social, teléfono, e-mail y dirección, obras vinculadas y total cobrado. Acceso rápido **"Nuevo cliente"** en la barra superior y botón + dentro de los formularios de Obras y Presupuestos. |
| **Agenda** | Directorio de contactos (clientes, proveedores, subcontratistas y socios) con accesos directos de llamada, WhatsApp (mensaje prearmado) y e-mail. |

## Acciones rápidas

Desde la barra superior (o el menú "+" en pantallas chicas): **Nuevo ingreso**, **Cargar gasto**, **Nuevo presupuesto**, **Nueva obra**, **Registrar jornada** (asistencia de empleados) y **Nuevo cliente**.

## Análisis por período

En el Dashboard hay un selector **"Período de análisis"** (este mes, últimos 3/6/12 meses, todo el historial o un rango personalizado con fechas desde/hasta) que recalcula los KPIs: cuánto **ganaste** (ingresos), **gastaste** (directos + generales), el **balance neto** y cuánto **invertiste** en herramientas en ese lapso.

## Diseño

- Modo oscuro y claro (botón de sol/luna en la barra superior).
- Barra lateral colapsable y menú deslizable en móvil.
- Tablas con búsqueda rápida y filtros; estados con colores claros.
- Gráficos dibujados en canvas sin librerías externas (funcionan sin internet).
- **Logo propio** en la barra lateral, en la pestaña del navegador (favicon) y como ícono al **agregar la app a la pantalla de inicio del celular** (`manifest.json` + `logo-192.png`).
- **Fotos en los registros**: Clientes, Empleados y Socios (agenda) admiten **foto/avatar** desde la **galería** o la **cámara** (`capture="environment"`). La imagen se reduce automáticamente (≤320 px) y se guarda dentro del registro, por lo que persiste en el dispositivo y se sincroniza a la nube con el resto de los datos. Los avatares se ven en Clientes, Agenda, Socios, Empleados, Obras y Dashboard.
- **Importar desde los contactos del celular**: botón **📇 Importar desde contactos** en los formularios de Clientes, Empleados y Agenda (socios/proveedores). Usa la API nativa del navegador (Contact Picker) y autocompleta nombre, teléfono y e-mail. Disponible en Android/Chrome; en otros navegadores avisa que no está soportado.

## Datos

- Viene con **datos de demostración realistas** (obras, presupuestos, movimientos, contactos de Alta Gracia) para que puedas explorar todo de inmediato.
- Todo se guarda automáticamente en el navegador (**localStorage**).
- Desde **"Respaldos y datos"** (parte inferior del menú) podés **exportar un respaldo JSON**, **importarlo** en otra máquina o **restaurar los datos de ejemplo**.
- Para **empezar con datos reales**: "Respaldos y datos" → **"Dejar 1 ejemplo por módulo"** borra toda la demo y deja un solo ejemplo en cada lugar (obra, cliente, proveedor, subcontratista, socio, presupuesto, ingreso, gasto, empleado, jornada, herramienta y liquidación) con montos en $0, listos para editar o reemplazar. También existe **"Vaciar por completo"** si preferís arrancar sin ningún registro.

## SaaS: usuarios, planes y datos en la nube (Supabase)

- Cada persona **crea su cuenta** (email + contraseña) desde la pantalla de inicio. Sus datos viven en **una fila propia** de la nube y **no puede ver los de otros usuarios** (seguridad RLS de Supabase por `user_id`).
- Al registrarse arranca un **período de prueba de 14 días**; vencido, la app muestra la pantalla de activación con botón de WhatsApp. Los datos quedan guardados mientras tanto.
- **Cobro manual (panel de administrador):** en Supabase → *Table Editor* → tabla **`profiles`** → fila del cliente → `plan = 'pro'` y `paid_until` = fecha de vencimiento. Para suspender: `plan = 'suspendido'`. La vista **`v_clientes`** lista todos los clientes con su plan y última sincronización.
- **Configuración inicial (una sola vez):**
  1. Supabase → *SQL Editor* → pegá todo el contenido de **`supabase-setup-v2.sql`** → *Run* (crea `profiles`, `app_data` por usuario, seguridad RLS y alta automática de perfil).
  2. *Authentication → Providers → Email* → desactivá **"Confirm email"** para que el registro sea inmediato.
- **Uso diario:** cada guardado puede subirse solo a la nube (activá "Sincronizar automáticamente" en *Respaldos y datos* → Mi cuenta). En otro dispositivo, al iniciar sesión la app ofrece descargar los datos de la nube. También hay botones manuales **Subir / Descargar / Probar conexión** y **Cerrar sesión**.
- Sin conexión la app sigue funcionando con los datos locales del dispositivo.

## Estructura del proyecto

```
index.html                 · shell de la aplicación
ABRIR DASHBOARD.bat        · acceso directo: arranca el server y abre el navegador
server.js                  · servidor local opcional (solo Node, sin dependencias)
css/styles.css             · sistema de diseño (dark/light, responsive)
js/store.js                · datos, seed y cálculos financieros
js/ui.js                   · iconos, modales, toasts y helpers
js/charts.js               · gráficos en canvas (flujo de caja y donut)
js/app.js                  · router y arranque
js/views/dashboard.js      · panel principal
js/views/obras.js          · tablero kanban y lista
js/views/obra-detalle.js   · detalle por obra
js/views/presupuestos.js   · presupuestos
js/views/ingresos.js       · ingresos
js/views/gastos.js         · gastos (obra y generales)
js/views/socios.js         · socios, reparto y liquidaciones
js/views/empleados.js      · empleados, asistencia, horas y pagos
js/views/herramientas.js   · activos y mantenimiento
js/views/agenda.js         · directorio de contactos
```

Tecnología: HTML + CSS + JavaScript puro (ES6), sin frameworks ni dependencias.

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

## Datos

- Viene con **datos de demostración realistas** (obras, presupuestos, movimientos, contactos de Alta Gracia) para que puedas explorar todo de inmediato.
- Todo se guarda automáticamente en el navegador (**localStorage**).
- Desde **"Respaldos y datos"** (parte inferior del menú) podés **exportar un respaldo JSON**, **importarlo** en otra máquina o **restaurar los datos de ejemplo**.
- Para **empezar con datos reales**: "Respaldos y datos" → **"Dejar 1 ejemplo por módulo"** borra toda la demo y deja un solo ejemplo en cada lugar (obra, cliente, proveedor, subcontratista, socio, presupuesto, ingreso, gasto, empleado, jornada, herramienta y liquidación) con montos en $0, listos para editar o reemplazar. También existe **"Vaciar por completo"** si preferís arrancar sin ningún registro.

## Sincronización en la nube (Supabase)

- La app puede **compartir los datos entre la PC y el celular** usando tu proyecto de Supabase como base de datos.
- **Paso 1 (una sola vez):** en el panel de Supabase → *SQL Editor* → pegá el contenido de `supabase-setup.sql` → *Run*. Se crea la tabla `app_data`.
- **Paso 2:** en la app, *Respaldos y datos* → sección **☁️ Sincronización en la nube**: cargá la **URL del proyecto**, la **anon public key** (Supabase → *Project Settings* → *API*) y un **código de sincronización** (lo inventás vos, ej. `gadu2026`). Usá **la misma configuración** en los dos dispositivos.
- **Paso 3:** tocá **Probar conexión**, después **Subir mis datos** en un dispositivo y **Descargar mis datos** en el otro. Si activás **"automática"**, cada cambio se sube solo y los demás dispositivos lo bajan con un toque.
- La fila en la nube queda protegida por el código de sincronización (actúa como contraseña compartida entre tus dispositivos).

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

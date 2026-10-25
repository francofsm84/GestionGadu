/* ============================================================
   GADU Construye · Capa de datos (localStorage)
   Colecciones, datos de demostración y cálculos financieros
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU = root.GADU || {};
  const KEY = 'gadu_data_v1';

  const CATS_OBRA = ['Materiales', 'Mano de obra', 'Fletes', 'Subcontratos', 'Alquiler de equipos', 'Otros'];
  const CATS_GENERAL = ['Combustible', 'Servicios', 'Impuestos', 'Alquiler', 'Mantenimiento de herramientas', 'Sueldos', 'Seguros', 'Otros'];
  const METODOS = ['Efectivo', 'Transferencia', 'Cheque', 'Mercado Pago', 'Otro'];
  const WORK_STATUS = ['activa', 'pausada', 'finalizada'];
  const ASSET_STATUS = ['operativo', 'en reparación', 'dado de baja'];
  const ASSET_CATS = ['Herramienta manual', 'Herramienta eléctrica', 'Equipo mayor', 'Vehículo', 'Otros'];
  const SEGURO_TIPOS = ['ART', 'Vehículo', 'VTV', 'Caución', 'Otro'];
  const CONTACT_TYPES = ['cliente', 'proveedor', 'subcontratista', 'socio'];
  const BUDGET_STATUS = ['borrador', 'enviado', 'aprobado', 'rechazado', 'vencido'];

  const pad = n => String(n).padStart(2, '0');
  const toISO = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const todayISO = () => toISO(new Date());
  const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return toISO(d); };
  const daysAhead = n => { const d = new Date(); d.setDate(d.getDate() + n); return toISO(d); };
  const uid = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const publicToken = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < 20; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  };
  const parseISO = s => { const p = String(s || '').split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); };
  const monthLabel = iso => {
    const d = parseISO(iso);
    const m = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    return m.charAt(0).toUpperCase() + m.slice(1);
  };
  /* Redondeo monetario seguro a 2 decimales: evita los residuos de coma
     flotante (0.1 + 0.2 === 0.30000000000000004) en totales y balances. */
  const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
  /* Sumatoria acumulada con redondeo final a 2 decimales. */
  const sum = arr => round2(arr.reduce((a, b) => a + (Number(b) || 0), 0));

  /* ------------------------------------------------------------
     Datos de demostración (fechas relativas a hoy)
     ------------------------------------------------------------ */
  function seed() {
    const contacts = [
      { id: 'c1', type: 'cliente', name: 'Familia Rossi', company: 'Casa particular', phone: '+54 9 3547 55-1234', whatsapp: '+54 9 3547 55-1234', email: 'familiarossi@gmail.com', address: 'Barrio Parque Virrey 1120, Alta Gracia', notes: 'Cliente desde 2023. Obra en vivienda de dos plantas.' },
      { id: 'c2', type: 'cliente', name: 'Estudio Piemonte', company: 'Inmobiliaria y desarrollos', phone: '+54 9 3547 44-7788', whatsapp: '+54 9 3547 44-7788', email: 'piemonte@estudio.com.ar', address: 'Av. San Martín 850, Alta Gracia', notes: '' },
      { id: 'c3', type: 'cliente', name: 'Carlos Ferreyra', company: 'Particular', phone: '+54 9 3547 61-2233', whatsapp: '+54 9 3547 61-2233', email: 'cferreyra@hotmail.com', address: 'Anisacate, Córdoba', notes: '' },
      { id: 'c4', type: 'cliente', name: 'Complejo Altos del Valle', company: 'Administración consorcio', phone: '+54 9 3547 42-8899', whatsapp: '+54 9 3547 42-8899', email: 'admin@altosdelvalle.com.ar', address: 'Bv. Pellegrini 120, Alta Gracia', notes: '' },
      { id: 'c5', type: 'cliente', name: 'Familia Ledesma', company: 'Particular', phone: '+54 9 3547 58-1010', whatsapp: '+54 9 3547 58-1010', email: '', address: 'La Paisanita, Córdoba', notes: '' },
      { id: 'c6', type: 'cliente', name: 'Consorcio Altos Verdes', company: 'Consorcio de viviendas', phone: '+54 9 3547 40-5566', whatsapp: '+54 9 3547 40-5566', email: 'consorcioaltosverdes@gmail.com', address: 'Barrio Córdoba, Alta Gracia', notes: '' },
      { id: 'p1', type: 'proveedor', name: 'Corralón El Hornero', company: 'Materiales de construcción', phone: '+54 9 3547 43-2020', whatsapp: '+54 9 3547 43-2020', email: 'ventas@elhornero.com.ar', address: 'Av. del Libertador 540, Alta Gracia', notes: 'Cuenta corriente habilitada. 10% de descuento por volumen.' },
      { id: 'p2', type: 'proveedor', name: 'Ferretería El Candado', company: 'Ferretería industrial', phone: '+54 9 3547 45-3030', whatsapp: '+54 9 3547 45-3030', email: '', address: 'San Martín 321, Alta Gracia', notes: '' },
      { id: 'p3', type: 'proveedor', name: 'Hormigón Serrano', company: 'Hormigón elaborado', phone: '+54 9 351 555-6600', whatsapp: '+54 9 351 555-6600', email: 'pedidos@hormigonserrano.com.ar', address: 'Ruta 5 km 33, Alta Gracia', notes: 'Pedir con 48 hs de anticipación.' },
      { id: 'p4', type: 'proveedor', name: 'Fletes Gutiérrez', company: 'Transporte y fletes', phone: '+54 9 3547 66-7788', whatsapp: '+54 9 3547 66-7788', email: '', address: 'Camino a Valle Alegre, Alta Gracia', notes: '' },
      { id: 'p5', type: 'proveedor', name: 'Pinturería Del Centro', company: 'Pinturas y revestimientos', phone: '+54 9 3547 47-8899', whatsapp: '+54 9 3547 47-8899', email: 'pintureria@delcentro.com.ar', address: 'Belgrano 150, Alta Gracia', notes: '' },
      { id: 's1', type: 'subcontratista', name: 'Jorge Mansilla', company: 'Instalaciones eléctricas', phone: '+54 9 3547 55-9900', whatsapp: '+54 9 3547 55-9900', email: 'mansillaelectricidad@gmail.com', address: 'Alta Gracia', notes: 'Matriculado. Certifica instalaciones.' },
      { id: 's2', type: 'subcontratista', name: 'Rubén Ávila', company: 'Plomería y gas', phone: '+54 9 3547 62-3344', whatsapp: '+54 9 3547 62-3344', email: '', address: 'Barrio Córdoba, Alta Gracia', notes: '' },
      { id: 's3', type: 'subcontratista', name: 'Arq. Lucía Pereyra', company: 'Dirección técnica', phone: '+54 9 351 444-7788', whatsapp: '+54 9 351 444-7788', email: 'arq.pereyra@gmail.com', address: 'Córdoba Capital', notes: 'Habilitaciones municipales y planos.' },
      { id: 'so1', type: 'socio', name: 'Gastón Duarte', company: 'Socio fundador', phone: '+54 9 3547 51-0001', whatsapp: '+54 9 3547 51-0001', email: 'gaston@gaduconstruye.com.ar', address: 'Alta Gracia', notes: '', percent: 40, active: true },
      { id: 'so2', type: 'socio', name: 'Aldo Duarte', company: 'Socio · Obra y logística', phone: '+54 9 3547 51-0002', whatsapp: '+54 9 3547 51-0002', email: 'aldo@gaduconstruye.com.ar', address: 'Alta Gracia', notes: '', percent: 30, active: true },
      { id: 'so3', type: 'socio', name: 'Ulises Duarte', company: 'Socio · Administración', phone: '+54 9 3547 51-0003', whatsapp: '+54 9 3547 51-0003', email: 'ulises@gaduconstruye.com.ar', address: 'Villa Carlos Paz', notes: '', percent: 30, active: true },
    ];

    const employees = [
      { id: 'e1', firstName: 'Ramón', lastName: 'Quiroga', phone: '+54 9 3547 66-1122', paymentData: 'ramon.quiroga.mp', hourlyRate: 4500, active: true, notes: 'Oficial albañil · cuadrilla propia.' },
      { id: 'e2', firstName: 'Diego', lastName: 'Sosa', phone: '+54 9 3547 63-4455', paymentData: '0000003100088745123456', hourlyRate: 4000, active: true, notes: 'Medio oficial.' },
      { id: 'e3', firstName: 'Facundo', lastName: 'Pereyra', phone: '+54 9 351 233-8899', paymentData: 'facu.pereyra.galicia', hourlyRate: 3800, active: true, notes: 'Ayudante · jornada completa.' },
      { id: 'e4', firstName: 'Matías', lastName: 'Bustos', phone: '+54 9 3547 61-7788', paymentData: 'matias.bustos.mp', hourlyRate: 3500, active: false, notes: 'Baja temporal.' },
    ];

    const attendance = [];
    const absents = { e1: [3, 10, 17], e2: [6, 13], e3: [2, 9, 16], e4: [] };
    ['e1', 'e2', 'e3', 'e4'].forEach(eid => {
      for (let d = 20; d >= 1; d--) {
        const dt = new Date();
        dt.setDate(dt.getDate() - d);
        if (dt.getDay() === 0) continue; // domingos sin jornal
        if (eid === 'e4' && d < 10) continue; // e4 está de baja
        if ((absents[eid] || []).includes(d)) {
          attendance.push({ id: uid(), employeeId: eid, date: daysAgo(d), status: 'ausente', hours: [], notes: '' });
          continue;
        }
        let hours;
        if (d % 4 === 0) hours = [{ workId: 'w2', hours: 4 }, { workId: 'w1', hours: 4 }];
        else if (eid === 'e3' && d % 3 === 0) hours = [{ workId: 'w3', hours: 8 }];
        else hours = [{ workId: eid === 'e3' ? 'w2' : 'w1', hours: 8 }];
        attendance.push({ id: uid(), employeeId: eid, date: daysAgo(d), status: 'presente', hours, notes: '' });
      }
    });
    [['e1', 'w1'], ['e2', 'w1'], ['e3', 'w2']].forEach(pair => {
      attendance.push({ id: uid(), employeeId: pair[0], date: todayISO(), status: 'presente', hours: [{ workId: pair[1], hours: 8 }], notes: '' });
    });

    const works = [
      { id: 'w1', code: 'OB-001', name: 'Remodelación integral casa familiar', clientId: 'c1', location: 'Barrio Parque Virrey, Alta Gracia', status: 'activa', startDate: daysAgo(110), endDate: daysAhead(60), budgetTotal: 7200000, advanceFisico: 65, description: 'Remodelación integral de vivienda de dos plantas: nueva cocina, baño principal, recambio de instalaciones y pintura completa.' },
      { id: 'w2', code: 'OB-002', name: 'Ampliación galpón logístico', clientId: 'c2', location: 'Parque Industrial, Alta Gracia', status: 'activa', startDate: daysAgo(60), endDate: daysAhead(90), budgetTotal: 3840000, advanceFisico: 30, description: 'Ampliación de 240 m² con estructura metálica, platea de hormigón y cerramientos.' },
      { id: 'w3', code: 'OB-003', name: 'Quincho + pileta', clientId: 'c3', location: 'Anisacate, Córdoba', status: 'activa', startDate: daysAgo(40), endDate: daysAhead(150), budgetTotal: 6720000, advanceFisico: 15, description: 'Construcción de quincho con parrilla y piscina de 8x4 con deck de madera.' },
      { id: 'w4', code: 'OB-004', name: 'Reforma local comercial', clientId: 'c4', location: 'Centro, Alta Gracia', status: 'pausada', startDate: daysAgo(160), endDate: daysAhead(20), budgetTotal: 2280000, advanceFisico: 80, description: 'Reforma integral de local gastronómico. Pausada a la espera de habilitación municipal.' },
      { id: 'w5', code: 'OB-005', name: 'Techado cochera + lavadero', clientId: 'c5', location: 'La Paisanita', status: 'finalizada', startDate: daysAgo(200), endDate: daysAgo(30), budgetTotal: 1500000, advanceFisico: 100, description: 'Estructura de madera con chapa y cerramiento lateral. Entregada.' },
      { id: 'w6', code: 'OB-006', name: 'Pintura y revoques exteriores', clientId: 'c6', location: 'Barrio Córdoba, Alta Gracia', status: 'finalizada', startDate: daysAgo(150), endDate: daysAgo(60), budgetTotal: 1180000, advanceFisico: 100, description: 'Revoque grueso y fino, pintura látex exterior en consorcio de 6 viviendas.' },
    ];

    const YR = String(new Date().getFullYear());
    const mkBudget = (code, clientId, workId, name, date, validUntil, status, items, discount, notes) => {
      const subtotal = sum(items.map(i => (Number(i.price) || 0) * (Number(i.qty) || 0)));
      return {
        id: 'b' + code.replace(/\W/g, ''), code, clientId, workId: workId || null, name, date,
        validUntil: validUntil || '', status, items, discount: discount || 0, subtotal,
        total: Math.max(0, subtotal - (discount || 0)), notes: notes || '',
      };
    };
    const budgets = [
      mkBudget('PR-' + YR + '-001', 'c1', 'w1', 'Remodelación integral casa familiar', daysAgo(115), daysAhead(45), 'aprobado', [
        { desc: 'Materiales y áridos', unit: 'global', qty: 1, price: 2400000 },
        { desc: 'Mano de obra', unit: 'global', qty: 1, price: 2800000 },
        { desc: 'Instalación eléctrica completa', unit: 'global', qty: 1, price: 1100000 },
        { desc: 'Fletes y logística', unit: 'global', qty: 1, price: 400000 },
        { desc: 'Gastos generales e imprevistos', unit: 'global', qty: 1, price: 500000 },
      ], 0, 'Precios acordados con actualización por inflación trimestral.'),
      mkBudget('PR-' + YR + '-002', 'c2', 'w2', 'Ampliación galpón logístico', daysAgo(65), daysAhead(30), 'aprobado', [
        { desc: 'Platea de hormigón H21 (240 m²)', unit: 'm²', qty: 240, price: 7500 },
        { desc: 'Estructura metálica y cubierta', unit: 'global', qty: 1, price: 1480000 },
        { desc: 'Cerramientos y aberturas', unit: 'global', qty: 1, price: 560000 },
      ], 0, ''),
      mkBudget('PR-' + YR + '-003', 'c3', 'w3', 'Quincho + pileta', daysAgo(45), daysAhead(60), 'aprobado', [
        { desc: 'Movimiento de suelo y platea', unit: 'global', qty: 1, price: 1900000 },
        { desc: 'Quincho con parrilla', unit: 'm²', qty: 42, price: 60000 },
        { desc: 'Pileta 8x4 con deck', unit: 'global', qty: 1, price: 2300000 },
      ], 0, 'Incluye proyecto y dirección técnica.'),
      mkBudget('PR-' + YR + '-004', 'c4', 'w4', 'Reforma local comercial', daysAgo(165), daysAhead(5), 'aprobado', [
        { desc: 'Demoliciones y retiro', unit: 'global', qty: 1, price: 280000 },
        { desc: 'Instalación de gas y cocina industrial', unit: 'global', qty: 1, price: 620000 },
        { desc: 'Revestimientos y pintura', unit: 'global', qty: 1, price: 1380000 },
      ], 0, ''),
      mkBudget('PR-' + YR + '-005', 'c5', 'w5', 'Techado cochera + lavadero', daysAgo(205), daysAgo(160), 'aprobado', [
        { desc: 'Estructura de madera y chapa', unit: 'm²', qty: 48, price: 22000 },
        { desc: 'Mano de obra', unit: 'global', qty: 1, price: 380000 },
        { desc: 'Zinguería y desagües', unit: 'global', qty: 1, price: 64000 },
      ], 0, ''),
      mkBudget('PR-' + YR + '-006', 'c6', 'w6', 'Pintura y revoques exteriores', daysAgo(155), daysAgo(120), 'aprobado', [
        { desc: 'Revoque grueso y fino', unit: 'm²', qty: 220, price: 3200 },
        { desc: 'Pintura látex exterior', unit: 'm²', qty: 220, price: 2160 },
      ], 0, ''),
      mkBudget('PR-' + YR + '-007', 'c5', null, 'Cierre perimetral + portón corredizo', daysAgo(12), daysAhead(60), 'borrador', [
        { desc: 'Muro perimetral (28 m lineales)', unit: 'm', qty: 28, price: 38000 },
        { desc: 'Portón corredizo motorizado', unit: 'global', qty: 1, price: 780000 },
        { desc: 'Mano de obra', unit: 'global', qty: 1, price: 520000 },
      ], 5, 'Pendiente de confirmación de medidas finales.'),
      mkBudget('PR-' + YR + '-008', 'c1', null, 'Remodelación baño y cocina (2° etapa)', daysAgo(8), daysAhead(90), 'enviado', [
        { desc: 'Cocina nueva con isla', unit: 'global', qty: 1, price: 1350000 },
        { desc: 'Baño en suite', unit: 'global', qty: 1, price: 950000 },
      ], 0, 'Propuesta enviada por WhatsApp, a la espera de respuesta.'),
    ];

    const wRef = id => works.find(x => x.id === id);
    const inc = (workId, dAgo, amount, concept, method, reference) => ({
      id: uid(), date: daysAgo(dAgo), workId, clientId: wRef(workId).clientId,
      amount, concept, method, reference: reference || '',
    });
    const incomes = [
      inc('w1', 98, 2880000, 'Anticipo 40%', 'Transferencia', ''),
      inc('w1', 65, 1550000, 'Certificación N°1', 'Transferencia', ''),
      inc('w1', 30, 1300000, 'Certificación N°2', 'Transferencia', ''),
      inc('w1', 9, 770000, 'Extra: medianera y vereda', 'Efectivo', ''),
      inc('w2', 52, 1152000, 'Anticipo 30%', 'Transferencia', ''),
      inc('w2', 15, 768000, 'Certificación N°1', 'Transferencia', ''),
      inc('w3', 32, 1344000, 'Anticipo 20%', 'Transferencia', ''),
      inc('w3', 7, 336000, 'Extra: sobrecimientos', 'Efectivo', ''),
      inc('w4', 145, 912000, 'Anticipo 40%', 'Transferencia', ''),
      inc('w4', 88, 608000, 'Certificación N°1', 'Cheque', 'CH-00321'),
      inc('w4', 50, 380000, 'Certificación N°2', 'Transferencia', ''),
      inc('w5', 185, 625000, 'Anticipo 50%', 'Transferencia', ''),
      inc('w5', 115, 500000, 'Certificación N°1', 'Efectivo', ''),
      inc('w5', 22, 375000, 'Saldo final', 'Transferencia', ''),
      inc('w6', 135, 472000, 'Anticipo 40%', 'Transferencia', ''),
      inc('w6', 65, 708000, 'Saldo', 'Transferencia', ''),
      inc('w1', 3, 500000, 'Certificación N°3', 'Transferencia', ''),
    ];
    /* Los anticipos del cliente quedan marcados como adelantos */
    incomes.forEach(x => { if (/^Anticipo/.test(x.concept || '')) x.incomeKind = 'adelanto'; });

    const exp = (type, workId, dAgo, category, amount, providerId, desc, invoice, method) => ({
      id: uid(), type, workId: type === 'obra' ? workId : null, date: daysAgo(dAgo),
      category, amount, providerId: providerId || null, description: desc,
      invoiceNumber: invoice || '', paymentMethod: method || 'Efectivo',
    });
    const wageRows = [
      ['e1', 14, 200000], ['e2', 14, 160000], ['e3', 14, 152000],
      ['e1', 7, 200000], ['e2', 7, 160000], ['e3', 7, 152000],
    ];
    const empRef = id => employees.find(x => x.id === id);
    const wageExpenses = wageRows.map(wx => ({
      id: uid(), type: 'obra', workId: wx[0] === 'e3' ? 'w2' : 'w1', date: daysAgo(wx[1]),
      category: 'Mano de obra', amount: wx[2], providerId: null, employeeId: wx[0],
      description: 'Sueldo semanal ' + empRef(wx[0]).firstName + ' ' + empRef(wx[0]).lastName,
      invoiceNumber: '', paymentMethod: 'Transferencia',
    }));
    const advanceRows = [
      ['e2', 4, 50000, 'w1'],
      ['e3', 2, 40000, 'w2'],
    ];
    const advanceExpenses = advanceRows.map(ax => ({
      id: uid(), type: 'obra', workId: ax[3], date: daysAgo(ax[1]),
      category: 'Mano de obra', amount: ax[2], providerId: null, employeeId: ax[0],
      description: 'Adelanto de sueldo ' + empRef(ax[0]).firstName + ' ' + empRef(ax[0]).lastName,
      invoiceNumber: '', paymentMethod: 'Efectivo', expenseKind: 'adelanto',
    }));
    const expenses = [
      exp('obra', 'w1', 100, 'Materiales', 640000, 'p1', 'Arena, cemento y hierros primera etapa', 'F-00452', 'Transferencia'),
      exp('obra', 'w1', 88, 'Fletes', 95000, 'p4', 'Flete de áridos y hierros', '', 'Efectivo'),
      exp('obra', 'w1', 78, 'Materiales', 520000, 'p1', 'Cerámicos, griferías y cañerías', 'F-00499', 'Transferencia'),
      exp('obra', 'w1', 70, 'Mano de obra', 480000, null, 'Cuadrilla semana 1-2', '', 'Efectivo'),
      exp('obra', 'w1', 55, 'Materiales', 430000, 'p2', 'Maderas, placas y perfilería', 'F-11230', 'Transferencia'),
      exp('obra', 'w1', 52, 'Mano de obra', 380000, null, 'Cuadrilla semana 3-4', '', 'Efectivo'),
      exp('obra', 'w1', 44, 'Subcontratos', 420000, 's1', 'Instalación eléctrica completa', 'F-00088', 'Transferencia'),
      exp('obra', 'w1', 42, 'Mano de obra', 450000, null, 'Cuadrilla semana 5-6', '', 'Efectivo'),
      exp('obra', 'w1', 35, 'Materiales', 165000, 'p1', 'Pinturas y terminaciones', 'F-00521', 'Transferencia'),
      exp('obra', 'w1', 28, 'Fletes', 70000, 'p4', 'Retiro de escombros', '', 'Efectivo'),
      exp('obra', 'w1', 20, 'Alquiler de equipos', 130000, null, 'Andamios y elevador (15 días)', '', 'Transferencia'),
      exp('obra', 'w1', 14, 'Mano de obra', 400000, null, 'Cuadrilla semana 7-8', '', 'Efectivo'),
      exp('obra', 'w1', 10, 'Materiales', 220000, 'p2', 'Iluminación y artefactos', 'F-11302', 'Transferencia'),
      exp('obra', 'w2', 48, 'Materiales', 700000, 'p3', 'Hormigón elaborado H21', 'F-00771', 'Transferencia'),
      exp('obra', 'w2', 33, 'Subcontratos', 270000, 's2', 'Desagües y conexiones', '', 'Efectivo'),
      exp('obra', 'w2', 30, 'Mano de obra', 420000, null, 'Montaje de estructura', '', 'Efectivo'),
      exp('obra', 'w2', 24, 'Materiales', 380000, 'p1', 'Perfiles y chapas', 'F-00544', 'Transferencia'),
      exp('obra', 'w2', 22, 'Fletes', 110000, 'p4', 'Traslado de estructura', '', 'Efectivo'),
      exp('obra', 'w2', 7, 'Mano de obra', 280000, null, 'Avance de cerramientos', '', 'Efectivo'),
      exp('obra', 'w3', 28, 'Materiales', 820000, 'p3', 'Hormigón y hierros para platea', 'F-00790', 'Transferencia'),
      exp('obra', 'w3', 19, 'Mano de obra', 380000, null, 'Excavación y platea', '', 'Efectivo'),
      exp('obra', 'w3', 11, 'Materiales', 430000, 'p1', 'Ladrillos y cal', 'F-00560', 'Transferencia'),
      exp('obra', 'w3', 9, 'Fletes', 120000, 'p4', 'Movimiento de suelo', '', 'Efectivo'),
      exp('obra', 'w3', 5, 'Materiales', 200000, 'p2', 'Membranas y aislaciones', 'F-11345', 'Transferencia'),
      exp('obra', 'w4', 140, 'Materiales', 640000, 'p1', 'Demolición y materiales base', 'F-00398', 'Transferencia'),
      exp('obra', 'w4', 128, 'Mano de obra', 560000, null, 'Cuadrilla etapa 1', '', 'Efectivo'),
      exp('obra', 'w4', 84, 'Mano de obra', 400000, null, 'Cuadrilla etapa 2', '', 'Efectivo'),
      exp('obra', 'w4', 70, 'Subcontratos', 250000, 's2', 'Instalación de gas', '', 'Transferencia'),
      exp('obra', 'w5', 180, 'Materiales', 330000, 'p1', 'Maderas y chapas', 'F-00355', 'Transferencia'),
      exp('obra', 'w5', 148, 'Mano de obra', 450000, null, 'Montaje completo de techado', '', 'Efectivo'),
      exp('obra', 'w5', 112, 'Fletes', 65000, 'p4', 'Traslado de materiales', '', 'Efectivo'),
      exp('obra', 'w5', 60, 'Materiales', 105000, 'p2', 'Zinguería y tornillería', 'F-11002', 'Transferencia'),
      exp('obra', 'w6', 130, 'Materiales', 270000, 'p5', 'Revoques y membranas', 'F-02112', 'Transferencia'),
      exp('obra', 'w6', 95, 'Mano de obra', 350000, null, 'Cuadrilla de revoque', '', 'Efectivo'),
      exp('obra', 'w6', 85, 'Fletes', 45000, 'p4', 'Flete de materiales', '', 'Efectivo'),
      exp('obra', 'w6', 70, 'Materiales', 85000, 'p5', 'Látex exterior', 'F-02190', 'Transferencia'),
      exp('general', null, 9, 'Combustible', 185000, null, 'Combustible camioneta y máquinas', '', 'Mercado Pago'),
      exp('general', null, 18, 'Servicios', 95000, null, 'Luz, agua e internet del taller', 'F-88321', 'Transferencia'),
      exp('general', null, 14, 'Impuestos', 210000, null, 'Monotributo y tasas municipales', '', 'Transferencia'),
      exp('general', null, 24, 'Alquiler', 180000, null, 'Depósito de materiales', '', 'Transferencia'),
      exp('general', null, 16, 'Mantenimiento de herramientas', 60000, 'p2', 'Repuestos y afilado de sierras', 'F-11311', 'Efectivo'),
      exp('general', null, 38, 'Combustible', 160000, null, 'Combustible flota', '', 'Mercado Pago'),
      exp('general', null, 72, 'Combustible', 150000, null, 'Combustible flota', '', 'Mercado Pago'),
      exp('general', null, 70, 'Impuestos', 205000, null, 'Monotributo e IIBB', '', 'Transferencia'),
      exp('general', null, 44, 'Seguros', 95000, null, 'Seguro de obras y responsabilidad civil', '', 'Transferencia'),
      exp('general', null, 82, 'Servicios', 80000, null, 'Telefonía y software de gestión', '', 'Transferencia'),
      ...wageExpenses,
      ...advanceExpenses,
    ];

    const assets = [
      { id: 'a1', name: 'Hormigonera 130 L', category: 'Equipo mayor', purchaseDate: '2022-03-10', cost: 380000, status: 'operativo', supplierId: 'p2', notes: 'Con motor eléctrico monofásico.', location: 'w1', usages: [{ from: daysAgo(90), workId: null, notes: 'En depósito' }, { from: daysAgo(45), workId: 'w1', notes: 'Llevada a la obra de la familia Rossi' }], maintenance: [{ date: daysAgo(60), description: 'Cambio de rulemanes y limpieza de tambor', cost: 45000 }] },
      { id: 'a2', name: 'Camioneta F-100', category: 'Vehículo', purchaseDate: '2019-08-22', cost: 1480000, status: 'operativo', supplierId: null, notes: 'Uso general de obra y fletes propios.', location: 'w2', usages: [{ from: daysAgo(200), workId: null, notes: 'Compra · uso general' }, { from: daysAgo(60), workId: 'w2', notes: 'Afectada al galpón logístico' }], maintenance: [{ date: daysAgo(25), description: 'Service completo y frenos', cost: 185000 }, { date: daysAgo(95), description: 'Cubiertas delanteras', cost: 260000 }] },
      { id: 'a3', name: 'Amoladora angular 9"', category: 'Herramienta eléctrica', purchaseDate: '2024-05-14', cost: 145000, status: 'operativo', supplierId: 'p2', notes: '', location: 'w1', usages: [{ from: daysAgo(120), workId: null, notes: 'Compra' }, { from: daysAgo(30), workId: 'w1', notes: 'En obra Rossi' }], maintenance: [] },
      { id: 'a4', name: 'Andamios completos (3 cuerpos)', category: 'Equipo mayor', purchaseDate: '2023-02-02', cost: 420000, status: 'en reparación', supplierId: 'p1', notes: 'En taller: refuerzo de soldaduras.', location: null, usages: [{ from: daysAgo(300), workId: null, notes: 'Compra' }, { from: daysAgo(100), workId: 'w4', notes: 'Usados en el local comercial' }, { from: daysAgo(15), workId: null, notes: 'A taller por reparación' }], maintenance: [{ date: daysAgo(15), description: 'Refuerzo de soldaduras y pintura', cost: 55000 }] },
      { id: 'a5', name: 'Sierra circular de banco', category: 'Herramienta eléctrica', purchaseDate: '2023-06-18', cost: 310000, status: 'operativo', supplierId: 'p2', notes: '', location: null, usages: [{ from: daysAgo(200), workId: null, notes: 'Compra · uso en depósito' }], maintenance: [{ date: daysAgo(45), description: 'Cambio de disco y alineación', cost: 28000 }] },
      { id: 'a6', name: 'Rotomartillo SDS Max', category: 'Herramienta eléctrica', purchaseDate: '2024-11-05', cost: 240000, status: 'operativo', supplierId: 'p2', notes: '', location: 'w3', usages: [{ from: daysAgo(60), workId: null, notes: 'Compra' }, { from: daysAgo(20), workId: 'w3', notes: 'En obra quincho y pileta' }], maintenance: [] },
      { id: 'a7', name: 'Kit herramientas de albañilería', category: 'Herramienta manual', purchaseDate: '2023-01-10', cost: 96000, status: 'operativo', supplierId: 'p2', notes: 'Cucharas, fratachos, niveles y plomadas.', location: null, usages: [{ from: daysAgo(200), workId: null, notes: 'Compra · uso en depósito' }], maintenance: [] },
    ];

    const socios = contacts.filter(c => c.type === 'socio' && c.active !== false);
    const split = amount => socios.map(s => ({ partnerId: s.id, name: s.name, amount: Math.round(amount * (s.percent || 0) / 100) }));
    const distributions = [
      { id: 'd1', period: monthLabel(daysAgo(25)), date: daysAgo(25), amount: 520000, status: 'pagada', paidDate: daysAgo(12), method: 'Transferencia', splits: split(520000), notes: 'Liquidación mensual' },
      { id: 'd2', period: monthLabel(daysAgo(8)), date: daysAgo(8), amount: 240000, status: 'pendiente', paidDate: null, method: 'Transferencia', splits: split(240000), notes: '' },
      { id: 'd3', period: monthLabel(daysAhead(18)), date: daysAhead(18), amount: 200000, status: 'pendiente', paidDate: null, method: 'Transferencia', splits: split(200000), notes: '' },
    ];

    const seguros = [
      { id: 's1', tipo: 'ART', compania: 'Provincia ART', numeroPoliza: 'ART-45821-7', costo: 185000, fechaVencimiento: daysAgo(12), estado: 'vencido', obraId: null, createdAt: daysAgo(180), updatedAt: daysAgo(180) },
      { id: 's2', tipo: 'Vehículo', compania: 'La Caja Seguros', numeroPoliza: 'AU-778412', costo: 92000, fechaVencimiento: daysAhead(5), estado: 'activo', obraId: 'w2', createdAt: daysAgo(120), updatedAt: daysAgo(120) },
      { id: 's3', tipo: 'VTV', compania: 'Planta VTV Córdoba', numeroPoliza: 'VTV-2026-114', costo: 28000, fechaVencimiento: daysAhead(45), estado: 'activo', obraId: 'w2', createdAt: daysAgo(300), updatedAt: daysAgo(300) },
      { id: 's4', tipo: 'Caución', compania: 'Fianzas del Centro', numeroPoliza: 'CAU-033-2026', costo: 340000, fechaVencimiento: daysAhead(20), estado: 'activo', obraId: 'w1', createdAt: daysAgo(60), updatedAt: daysAgo(60) },
      { id: 's5', tipo: 'Otro', compania: 'Sancor Salud', numeroPoliza: 'SC-9012', costo: 64000, fechaVencimiento: daysAhead(90), estado: 'activo', obraId: null, createdAt: daysAgo(200), updatedAt: daysAgo(200) },
    ];

    return {
      settings: { company: 'GADU Construye', theme: 'dark', reservePercent: 30 },
      contacts, works, budgets, incomes, expenses, assets, distributions, employees, attendance, seguros,
    };
  }

  /* ------------------------------------------------------------
     Persistencia
     ------------------------------------------------------------ */
  let data = null;
  let key = KEY;
  let _hasData = false;   // "¿hay datos persistidos?" (flag en memoria, sin tocar storage)
  let _userId = null;     // id del usuario actual (para notificaciones)

  /* Resuelve el backend de storage: usa G.storage (localForage/IndexedDB) si
     está disponible; si no (tests en Node o storage.js no cargado), cae a un
     fallback síncrono sobre localStorage. */
  function storage() {
    if (G.storage && G.storage.get && G.storage.set) return G.storage;
    return {
      get(k) { try { return Promise.resolve(localStorage.getItem(k)); } catch (e) { return Promise.resolve(null); } },
      set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} return Promise.resolve(v); },
      del(k) { try { localStorage.removeItem(k); } catch (e) {} return Promise.resolve(); },
    };
  }

  /* En modo SaaS cada usuario tiene su almacén local separado.
     Al migrar desde la versión sin usuarios, se copian los datos
     de la clave vieja a la clave del primer usuario que entra. */
  function attachUser(uid) {
    const oldKey = KEY;
    const newKey = uid ? (KEY + '_' + uid) : KEY;
    if (uid) {
      try {
        if (!localStorage.getItem(newKey) && localStorage.getItem(oldKey)) {
          localStorage.setItem(newKey, localStorage.getItem(oldKey));
        }
      } catch (e) {}
    }
    key = newKey;
    _userId = uid || null;
    data = null;
    _hasData = false;
  }

  /* Migración automática: si hay datos viejos en localStorage, los pasa a
     IndexedDB (vía G.storage) y recién después borra localStorage. */
  async function migrateFromLocalStorage() {
    try {
      const raw = localStorage.getItem(key) || localStorage.getItem(KEY);
      if (raw) {
        const existing = await storage().get(key);
        if (!existing) await storage().set(key, raw);
      }
      localStorage.removeItem(key);
      localStorage.removeItem(KEY);
      console.log('[GADU-STORAGE] migración localStorage → IndexedDB completa');
    } catch (e) {}
  }

  function hasLocalData() {
    if (_hasData) return true;
    try { return !!localStorage.getItem(key); } catch (e) { return false; }
  }

  /* ¿El onboarding ya está completado? Verificación SÍNCRONA en memoria y
     en localStorage (para que maybeShow no dependa de una carga async). */
  function hasOnboarded() {
    if (data && data.settings && data.settings.onboardingDone) return true;
    try {
      const raw = localStorage.getItem(key) || localStorage.getItem(KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      return !!(d && d.settings && d.settings.onboardingDone);
    } catch (e) { return false; }
  }

  function load() {
    if (data) return Promise.resolve(data);
    /* 1) SYNC: leer localStorage legacy (arranque + tests Node). Deja `data`
       no-null de inmediato para que S.totals()/S.data nunca revienten. */
    try {
      const raw = localStorage.getItem(key) || localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && Array.isArray(d.works) && Array.isArray(d.incomes)) { data = d; _hasData = true; }
      }
    } catch (e) {}
    /* 2) Arranque limpio: SIN datos de demostración automáticos. */
    if (!data) data = emptySeed();
    normalize();
    /* 3) ASYNC: migrar + leer IndexedDB (puede reemplazar con datos más nuevos). */
    return (async () => {
      await migrateFromLocalStorage();
      try {
        const raw = await storage().get(key);
        if (raw) {
          const d = JSON.parse(raw);
          if (d && Array.isArray(d.works) && Array.isArray(d.incomes)) { data = d; _hasData = true; normalize(); }
        }
      } catch (e) {}
      return data;
    })();
  }
  /* Estado inicial en blanco (sin seed ficticio) */
  function emptySeed() {
    return {
      settings: currentSettings(),
      contacts: [], works: [], budgets: [], incomes: [], expenses: [],
      employees: [], attendance: [], assets: [], distributions: [], compromisos: [], seguros: [],
      debts: [], crews: [],
      trash: [],
    };
  }
  function normalize() {
    if (!data.settings) data.settings = { company: 'GADU Construye', theme: 'dark', reservePercent: 30 };
    /* Sincronización automática ACTIVA por defecto: cada guardado se sube en
       segundo plano sin botón manual. La copia local en localStorage se
       mantiene SIEMPRE como respaldo ante cortes de conexión. */
    if (!data.settings.cloud) data.settings.cloud = {};
    if (data.settings.cloud.autoPush === undefined) data.settings.cloud.autoPush = true;
    ['contacts', 'works', 'budgets', 'incomes', 'expenses', 'assets', 'distributions', 'employees', 'attendance', 'seguros', 'compromisos', 'debts', 'crews', 'trash'].forEach(k => {
      if (!Array.isArray(data[k])) data[k] = [];
    });
    /* Migración limpia: compromisos de la agenda (visitas/entregas/eventos) */
    data.compromisos.forEach(c => {
      if (c.hora === undefined) c.hora = '';
      if (c.estado === undefined) c.estado = 'pendiente';
      if (c.createdAt === undefined) c.createdAt = c.fecha || todayISO();
      /* Nuevos campos multirubro: compatibles con compromisos guardados antes */
      if (c.horaFin === undefined) c.horaFin = '';
      if (c.modalidad === undefined) c.modalidad = 'presencial';
      if (c.enlace === undefined) c.enlace = '';
      if (c.asignadoA === undefined) c.asignadoA = null;
    });
    /* Migración: antigüedad del empleado (fecha de alta del legajo) */
    data.employees.forEach(e => { if (e.createdAt === undefined) e.createdAt = null; });
    /* Anti-duplicados: fusionar jornadas idénticas del mismo empleado y fecha
       (limpia los dobles históricos, p. ej. dos jornadas de 8h el mismo día) */
    const seenAtt = {};
    const mergedAtt = [];
    data.attendance.forEach(a => {
      const k = (a.employeeId || '') + '|' + (a.date || '');
      if (seenAtt[k] != null) {
        const prev = mergedAtt[seenAtt[k]];
        const horas = (prev.hours || []).slice();
        (a.hours || []).forEach(h => {
          const t = h.tipo || 'normal';
          const dup = horas.some(x => x.workId === h.workId && (x.tipo || 'normal') === t && Number(x.hours || 0) === Number(h.hours || 0));
          if (!dup) horas.push({ workId: h.workId || null, hours: Number(h.hours) || 0, tipo: t });
        });
        prev.hours = horas;
        if (!prev.status || prev.status === 'ausente') prev.status = a.status || prev.status;
        if (a.notes) prev.notes = (prev.notes ? prev.notes + ' · ' : '') + a.notes;
      } else {
        seenAtt[k] = mergedAtt.length;
        mergedAtt.push(a);
      }
    });
    data.attendance = mergedAtt;
    /* Migración: ubicación e historial de uso de herramientas */
    data.assets.forEach(a => {
      if (!Array.isArray(a.usages)) a.usages = [];
      if (a.location === undefined) a.location = null;
    });
    /* Migración: foto/avatar en contactos y empleados */
    data.contacts.forEach(c => { if (c.photo === undefined) c.photo = null; });
    data.employees.forEach(e => { if (e.photo === undefined) e.photo = null; });
    /* Migración: seguros y vencimientos */
    data.seguros.forEach(s => {
      if (s.obraId === undefined) s.obraId = null;
      if (s.createdAt === undefined) s.createdAt = s.fechaVencimiento || todayISO();
      if (s.updatedAt === undefined) s.updatedAt = s.fechaVencimiento || todayISO();
      if (s.estado === undefined) s.estado = (seguroDaysLeft(s) < 0 ? 'vencido' : 'activo');
    });
  }

  /* ---------- Seguros y vencimientos: semáforo ---------- */
  function seguroDaysLeft(s) {
    if (!s || !s.fechaVencimiento) return 99999;
    const end = parseISO(s.fechaVencimiento);
    const today = parseISO(todayISO());
    return Math.round((end - today) / 86400000);
  }
  function seguroEstado(s) {
    const days = seguroDaysLeft(s);
    if (days < 0) return { key: 'vencido', tone: 'danger', label: 'Vencido hace ' + (-days) + ' día' + (-days !== 1 ? 's' : ''), days };
    if (days === 0) return { key: 'hoy', tone: 'danger', label: '¡Vence hoy!', days };
    if (days <= 7) return { key: 'por-vencer', tone: 'warning', label: 'Vence en ' + days + ' día' + (days !== 1 ? 's' : ''), days };
    return { key: 'al-dia', tone: 'success', label: 'Al día · ' + days + ' días', days };
  }
  /* Debounce de guardado local (500ms) para evitar write-amplification.
     El flush inmediato se dispara en 'beforeunload' para no perder datos. */
  let saveTimer = null;
  let _supportBackup = null;   // backup del admin en modo soporte (inspección de usuario)
  function flushSave() {
    if (_supportBackup !== null) return;   // en modo soporte NO persistir nada
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (data) {
      storage().set(key, JSON.stringify(data)).catch(e => {
        try {
          if (G.ui && G.ui.toast) G.ui.toast('No se pudo guardar (' + (e && e.message ? e.message : e) + '). Exportá un respaldo.', 'error');
        } catch (ignored) {}
      });
    }
  }
  function save() {
    if (!data) return;
    if (_supportBackup !== null) return;   // en modo soporte NO guardar ni sincronizar
    /* IndexedDB (localForage): debounce 500ms para evitar write-amplification.
       localStorage fallback (Node/tests): escritura sincrónica (no necesita debounce). */
    if (G.storage && G.storage.isIDB) {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(flushSave, 500);
    } else {
      flushSave();
    }
    /* Sincronización automática con la nube (si está activada) */
    if (data.settings && data.settings.cloud && data.settings.cloud.autoPush) {
      try { if (G.sync && G.sync.schedulePush) G.sync.schedulePush(); } catch (e) {}
    }
  }
  if (typeof window !== 'undefined') {
    try { window.addEventListener('beforeunload', flushSave); } catch (e) {}
  }
  function reset() { data = seed(); normalize(); save(); }

  /* Aplicar datos llegados por Realtime desde OTRO dispositivo:
     actualiza la memoria y el disco SIN volver a pushear (evita el bucle).
     Normaliza SIEMPRE el documento entrante: documentos remotos antiguos
     (sin seguros, compromisos, empleados, etc.) no pueden tumbar el Dashboard. */
  function applyRemote(newData) {
    if (_supportBackup !== null) return false;   // en modo soporte NO aplicar remoto
    if (!newData || typeof newData !== 'object' ||
      !Array.isArray(newData.works) || !Array.isArray(newData.incomes) || !Array.isArray(newData.expenses)) return false;
    const prev = data;
    data = newData;
    normalize();
    /* Preservar estado local que un documento remoto viejo NO debe pisar:
       - onboardingDone (para que el modal de bienvenida no reaparezca tras vincular)
       - profile (nombre/apodo/WhatsApp recién guardados) si el remoto no lo trae */
    if (prev && prev.settings) {
      data.settings = data.settings || {};
      if (prev.settings.onboardingDone) data.settings.onboardingDone = true;
      if (!data.settings.profile && prev.settings.profile) data.settings.profile = prev.settings.profile;
    }
    _hasData = true;
    storage().set(key, JSON.stringify(data)).catch(() => {});
    return true;
  }

  /* ---------- Modo soporte (admin inspecciona a un usuario) ----------
     Reemplaza `data` EN MEMORIA (sin persistir ni sincronizar) y guarda
     el backup del admin para restaurarlo al salir. */
  function enterSupportMode(d) {
    if (!d || typeof d !== 'object' || !Array.isArray(d.works)) return false;
    _supportBackup = data;
    data = d;
    normalize();
    _hasData = true;
    return true;
  }
  function exitSupportMode() {
    if (_supportBackup === null) return false;
    data = _supportBackup;
    _supportBackup = null;
    normalize();
    return true;
  }
  function inSupportMode() { return _supportBackup !== null; }

  /* ---------- Empezar de cero (datos reales) ---------- */
  function currentSettings() {
    const st = (data && data.settings) || {};
    return {
      company: st.company || 'GADU Construye',
      theme: st.theme || 'dark',
      reservePercent: st.reservePercent != null ? st.reservePercent : 30,
    };
  }
  function minimalSeed() {
    const hoy = todayISO();
    const yr = new Date().getFullYear();
    return {
      settings: currentSettings(),
      contacts: [
        { id: 'mc1', type: 'cliente', name: 'Cliente de ejemplo', company: '', phone: '', whatsapp: '', email: '', address: '', notes: 'Reemplazá por tu primer cliente real.' },
        { id: 'mp1', type: 'proveedor', name: 'Proveedor de ejemplo', company: '', phone: '', whatsapp: '', email: '', address: '', notes: 'Reemplazá por tu primer proveedor real.' },
        { id: 'ms1', type: 'subcontratista', name: 'Subcontratista de ejemplo', company: '', phone: '', whatsapp: '', email: '', address: '', notes: '' },
        { id: 'mso1', type: 'socio', name: 'Socio de ejemplo', company: '', phone: '', whatsapp: '', email: '', address: '', notes: '', percent: 100, active: true },
      ],
      works: [
        { id: 'mw1', code: 'OB-001', name: 'Obra de ejemplo', clientId: 'mc1', location: '', status: 'activa', startDate: hoy, endDate: '', budgetTotal: 0, advanceFisico: 0, description: 'Reemplazá por tu primera obra real.' },
      ],
      budgets: [
        { id: 'mb1', code: 'PR-' + yr + '-001', clientId: 'mc1', workId: 'mw1', name: 'Presupuesto de ejemplo', date: hoy, validUntil: daysAhead(30), status: 'borrador', items: [{ desc: 'Ítem de ejemplo', unit: 'global', qty: 1, price: 0 }], discount: 0, subtotal: 0, total: 0, notes: '' },
      ],
      incomes: [
        { id: 'mi1', date: hoy, workId: 'mw1', clientId: 'mc1', amount: 0, concept: 'Cobro de ejemplo', method: 'Transferencia', reference: '', incomeKind: 'pago' },
      ],
      expenses: [
        { id: 'me1', type: 'obra', workId: 'mw1', date: hoy, category: 'Materiales', amount: 0, providerId: 'mp1', employeeId: null, description: 'Gasto de ejemplo', invoiceNumber: '', paymentMethod: 'Efectivo', expenseKind: null },
      ],
      employees: [
        { id: 'memp1', firstName: 'Empleado', lastName: 'de ejemplo', phone: '', paymentData: '', hourlyRate: 0, active: true, notes: 'Reemplazá por tu primer empleado real.' },
      ],
      attendance: [
        { id: 'matt1', employeeId: 'memp1', date: hoy, status: 'presente', hours: [{ workId: 'mw1', hours: 0 }], notes: '' },
      ],
      assets: [
        { id: 'ma1', name: 'Herramienta de ejemplo', category: 'Herramienta manual', purchaseDate: hoy, cost: 0, status: 'operativo', supplierId: null, notes: '', maintenance: [] },
      ],
      distributions: [
        { id: 'md1', period: monthLabel(hoy), date: hoy, amount: 0, status: 'pendiente', paidDate: null, method: 'Transferencia', splits: [{ partnerId: 'mso1', name: 'Socio de ejemplo', amount: 0 }], notes: '' },
      ],
      seguros: [
        { id: 'ms1', tipo: 'ART', compania: 'ART de ejemplo', numeroPoliza: '', costo: 0, fechaVencimiento: daysAhead(30), estado: 'activo', obraId: null, createdAt: hoy, updatedAt: hoy },
      ],
      compromisos: [
        { id: 'mc1', fecha: daysAhead(2), hora: '09:00', tipo: 'visita', titulo: 'Visita de obra · quincho y pileta', lugar: '', contactoId: null, notas: '', estado: 'pendiente', createdAt: hoy },
      ],
      debts: [
        { id: 'mde1', concepto: 'Heladera', tipo: 'Personal', montoTotal: 1200000, cuotasTotales: 12, cuotaActual: 3, montoPorCuota: 100000, fechaVencimiento: daysAhead(10), finalizada: false, createdAt: hoy, updatedAt: hoy },
      ],
    };
  }
  function startReal() { data = minimalSeed(); normalize(); flushSave(); }
  function startEmpty() {
    /* Documento vacío COMPLETO (todas las colecciones, incluida seguros)
       y normalizado: evita fallos de totals() tras limpiar los datos. */
    data = emptySeed();
    normalize();
    flushSave();
  }
  function exportJSON() { return JSON.stringify(data, null, 2); }
  function importJSON(text) {
    const d = JSON.parse(text);
    if (!d || typeof d !== 'object' || !Array.isArray(d.works) || !Array.isArray(d.incomes) || !Array.isArray(d.expenses)) {
      throw new Error('El archivo no tiene formato válido');
    }
    const isISO = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const check = (arr, label) => {
      (arr || []).forEach(x => {
        if (!x || typeof x !== 'object') throw new Error('Registro inválido en ' + label);
        if (!isISO(x.date)) throw new Error('Falta una fecha válida en ' + label);
        if (x.amount != null && !(Number(x.amount) >= 0)) throw new Error('Monto inválido en ' + label);
      });
    };
    check(d.incomes, 'ingresos');
    check(d.expenses, 'gastos');
    check(d.attendance, 'asistencia');
    check(d.distributions, 'liquidaciones');
    data = d;
    normalize();
    save();
  }
  function reload() {
    data = null;
    return load();
  }

  /* ------------------------------------------------------------
     CRUD
     ------------------------------------------------------------ */
  function add(coll, obj) {
    obj.id = obj.id || uid();
    if (coll === 'works' && !obj.publicToken) obj.publicToken = publicToken();
    if (coll === 'attendance') return addAttendance(obj);   // anti-duplicados por empleado+fecha
    data[coll].unshift(obj); save(); return obj;
  }
  /* Alta de jornada ANTI-DUPLICADOS: una sola jornada por empleado y fecha.
     Si ya existe, fusiona las horas (descarta entradas idénticas) y deja las
     horas extras como desglose separado con tipo 'extra'. */
  function addAttendance(obj) {
    obj.id = obj.id || uid();
    const prev = data.attendance.find(a => a.employeeId === obj.employeeId && a.date === obj.date);
    if (!prev) {
      data.attendance.unshift(obj);
      save();
      return obj;
    }
    const horas = (prev.hours || []).slice();
    (obj.hours || []).forEach(h => {
      const t = h.tipo || 'normal';
      const dup = horas.some(x => x.workId === h.workId && (x.tipo || 'normal') === t && Number(x.hours || 0) === Number(h.hours || 0));
      if (!dup) horas.push({ workId: h.workId || null, hours: Number(h.hours) || 0, tipo: t });
    });
    prev.hours = horas;
    if (obj.status && obj.status !== prev.status) prev.status = obj.status;
    if (obj.notes) prev.notes = (prev.notes ? prev.notes + ' · ' : '') + obj.notes;
    save();
    return prev;
  }
  function update(coll, id, patch) { const it = data[coll].find(x => x.id === id); if (it) Object.assign(it, patch); save(); return it; }
  function remove(coll, id) {
    const it = data[coll].find(x => x.id === id);
    if (it) {
      data.trash = data.trash || [];
      const trashItem = {
        id: uid(),
        collection: coll,
        item: it,
        deletedAt: new Date().toISOString(),
      };
      data.trash.unshift(trashItem);
      data[coll] = data[coll].filter(x => x.id !== id);
      notifyDelete(trashItem);
    }
    save();
    syncNow();
  }
  function restore(trashId) {
    const t = (data.trash || []).find(x => x.id === trashId);
    if (!t || !t.collection || !Array.isArray(data[t.collection])) return false;
    data[t.collection].unshift(t.item);
    data.trash = data.trash.filter(x => x.id !== trashId);
    save();
    syncNow();
    return true;
  }

  /* Sincronización inmediata con la nube (sin esperar el debounce de save):
     garantiza que el borrado/restauración llegue a Supabase ya. */
  function syncNow() {
    try {
      if (G.sync && G.sync.push && data) G.sync.push(data).catch(() => {});
    } catch (e) { /* sin conexión: el push programado reintenta */ }
  }

  /* Etiqueta legible del item borrado (para el mensaje de WhatsApp) */
  function describeItem(coll, item) {
    item = item || {};
    const tipos = {
      expenses: 'Gasto', incomes: 'Ingreso', works: 'Obra', employees: 'Empleado',
      contacts: 'Contacto', budgets: 'Presupuesto', attendance: 'Jornada',
      assets: 'Herramienta', seguros: 'Seguro', compromisos: 'Compromiso', distributions: 'Reparto',
      debts: 'Deuda', crews: 'Cuadrilla',
    };
    const tipo = tipos[coll] || String(coll);
    let detalle = '';
    if (coll === 'expenses') detalle = '$' + (item.amount || 0) + ' · ' + (item.category || item.description || '');
    else if (coll === 'incomes') detalle = '$' + (item.amount || 0) + ' · ' + (item.concepto || '');
    else if (coll === 'works') detalle = item.name || item.nombre || '';
    else if (coll === 'employees') detalle = ((item.firstName || '') + ' ' + (item.lastName || '')).trim();
    else if (coll === 'contacts') detalle = item.name || '';
    else if (coll === 'budgets') detalle = item.name || item.nombre || '';
    else if (coll === 'attendance') detalle = (item.date || '') + ' · ' + (item.employeeId || '');
    else if (coll === 'assets') detalle = item.name || item.nombre || '';
    else if (coll === 'seguros') detalle = item.tipo || item.compania || '';
    else if (coll === 'compromisos') detalle = item.titulo || item.tipo || '';
    else if (coll === 'debts') detalle = (item.concepto || '') + ' · Cuota ' + (item.cuotaActual || 0) + '/' + (item.cuotasTotales || 0);
    else if (coll === 'crews') detalle = (item.name || '') + ' · ' + ((item.employeeIds || []).length) + ' integrantes';
    else detalle = item.description || item.name || item.nombre || '';
    return { tipo, detalle };
  }

  /* Dispara la notificación WhatsApp (fire-and-forget, no bloquea el borrado) */
  function notifyDelete(t) {
    try {
      if (!G.auth || !G.sync) return;
      const sess = G.auth.getSession ? G.auth.getSession() : null;
      const uid = (sess && sess.userId) || _userId;
      if (!uid) return;
      const { tipo, detalle } = describeItem(t.collection, t.item);
      const url = (G.auth.SUPABASE_URL || '') + '/functions/v1/whatsapp-delete-notify';
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': G.auth.SUPABASE_ANON_KEY || '',
          'Authorization': 'Bearer ' + ((sess && sess.accessToken) || ''),
        },
        body: JSON.stringify({ userId: uid, trashId: t.id, tipo, detalle }),
      }).catch(() => {});
    } catch (e) { /* sin conexión / sin auth: se omite el aviso */ }
  }
  function removeWork(id) {
    data.works = data.works.filter(x => x.id !== id);
    data.incomes = data.incomes.filter(x => x.workId !== id);
    data.expenses = data.expenses.filter(x => x.workId !== id);
    data.budgets.forEach(b => { if (b.workId === id) b.workId = null; });
    data.attendance.forEach(a => { if (Array.isArray(a.hours)) a.hours = a.hours.filter(h => h.workId !== id); });
    save();
  }
  function nextCode(prefix, coll) {
    const year = new Date().getFullYear();
    const re = new RegExp('^' + prefix + '-' + year + '-(\\d+)$');
    let max = 0;
    data[coll].forEach(x => { const m = String(x.code || '').match(re); if (m) max = Math.max(max, +m[1]); });
    return prefix + '-' + year + '-' + String(max + 1).padStart(3, '0');
  }

  /* ------------------------------------------------------------
     Consultas y cálculos financieros
     ------------------------------------------------------------ */
  const incomesOfWork = id => data.incomes.filter(x => x.workId === id);
  const expensesOfWork = id => data.expenses.filter(x => x.type === 'obra' && x.workId === id);

  function workStats(id) {
    const work = data.works.find(x => x.id === id) || null;
    const incomes = sum(incomesOfWork(id).map(x => x.amount));
    const costs = sum(expensesOfWork(id).map(x => x.amount));
    const budget = work ? Number(work.budgetTotal) || 0 : 0;
    const margin = incomes - costs;
    return {
      work, incomes, costs, margin,
      marginPct: incomes > 0 ? margin / incomes * 100 : (costs > 0 ? -100 : 0),
      advanceCobro: budget > 0 ? Math.min(100, incomes / budget * 100) : (incomes > 0 ? 100 : 0),
      advanceCosto: budget > 0 ? Math.min(100, costs / budget * 100) : (costs > 0 ? 100 : 0),
    };
  }

  function totals() {
    const incomes = sum(data.incomes.map(x => x.amount));
    const direct = sum(data.expenses.filter(x => x.type === 'obra').map(x => x.amount));
    const general = sum(data.expenses.filter(x => x.type === 'general').map(x => x.amount));
    const assets = sum(data.assets.map(x => x.cost));
    const maint = sum(data.assets.map(a => sum((a.maintenance || []).map(m => m.cost))));
    const seguros = sum(data.seguros.map(x => x.costo));
    return {
      incomes, direct, general, expenses: round2(direct + general),
      net: round2(incomes - direct - general), grossMargin: round2(incomes - direct), assets, maint, seguros,
    };
  }

  function monthlySeries(n) {
    const out = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.getFullYear() + '-' + pad(d.getMonth() + 1);
      const inc = sum(data.incomes.filter(x => (x.date || '').slice(0, 7) === key).map(x => x.amount));
      const exp = sum(data.expenses.filter(x => (x.date || '').slice(0, 7) === key).map(x => x.amount));
      out.push({
        key,
        label: d.toLocaleDateString('es-AR', { month: 'short' }),
        full: d.toLocaleDateString('es-AR', { month: 'long' }) + ' ' + d.getFullYear(),
        inc, exp,
      });
    }
    return out;
  }

  function expenseDistribution() {
    const items = data.works
      .map(w => ({ id: w.id, label: w.name, value: sum(expensesOfWork(w.id).map(x => x.amount)) }))
      .filter(x => x.value > 0)
      .sort((a, b) => b.value - a.value);
    items.push({ id: 'general', label: 'Gastos generales', value: totals().general });
    return items;
  }

  function distributionSummary() {
    const t = totals();
    const pct = Number(data.settings.reservePercent) || 0;
    const available = round2(Math.max(0, t.net) * (100 - pct) / 100);
    const paid = sum(data.distributions.filter(x => x.status === 'pagada').map(x => x.amount));
    const pending = sum(data.distributions.filter(x => x.status === 'pendiente').map(x => x.amount));
    const overdue = data.distributions.filter(x => x.status === 'pendiente' && x.date < todayISO());
    const upcoming = data.distributions.filter(x => x.status === 'pendiente' && x.date >= todayISO());
    return {
      gross: t.grossMargin, general: t.general, net: t.net, reservePercent: pct,
      available, paid, pending, remaining: round2(Math.max(0, available - pending)), overdue, upcoming,
    };
  }

  function socios() { return data.contacts.filter(c => c.type === 'socio' && c.active !== false); }

  function splitsFor(amount) {
    const list = socios();
    const totalPct = sum(list.map(s => s.percent));
    if (!(totalPct > 0)) return list.map(s => ({ partnerId: s.id, name: s.name, amount: 0 }));
    let assigned = 0;
    return list.map((s, i) => {
      const raw = amount * (s.percent || 0) / totalPct;
      const val = i === list.length - 1 ? amount - assigned : Math.round(raw);
      assigned += val;
      return { partnerId: s.id, name: s.name, amount: val };
    });
  }

  function contactById(id) { return data.contacts.find(c => c.id === id) || null; }

  /* ---------- Empleados, asistencia y jornales ---------- */
  function employeeById(id) { return data.employees.find(e => e.id === id) || null; }
  function employeeName(e) { return e ? (e.firstName + ' ' + e.lastName).trim() : ''; }
  function attendanceFor(employeeId, date) {
    return data.attendance.find(a => a.employeeId === employeeId && a.date === date) || null;
  }
  function employeePayments(id) {
    return data.expenses.filter(x => x.employeeId === id).slice().sort((a, b) => b.date.localeCompare(a.date));
  }
  function employeeStats(id, upTo) {
    const pays = data.expenses.filter(x => x.employeeId === id && (!upTo || (x.date || '') <= upTo));
    const paidTotal = sum(pays.map(x => x.amount));
    const advances = sum(pays.filter(x => x.expenseKind === 'adelanto').map(x => x.amount));
    const mk = todayISO().slice(0, 7);
    const paidMonth = sum(data.expenses.filter(x => x.employeeId === id && (x.date || '').slice(0, 7) === mk).map(x => x.amount));
    const att = data.attendance.filter(a => a.employeeId === id).slice().sort((a, b) => b.date.localeCompare(a.date));
    const present = att.filter(a => a.status === 'presente');
    const daysWorked = present.length;
    const hoursTotal = sum(present.flatMap(a => a.hours || []).map(h => h.hours));
    const byWork = {};
    present.forEach(a => (a.hours || []).forEach(h => {
      if (!byWork[h.workId]) byWork[h.workId] = { workId: h.workId, hours: 0, days: {} };
      byWork[h.workId].hours += Number(h.hours) || 0;
      byWork[h.workId].days[a.date] = true;
    }));
    const byWorkList = Object.values(byWork)
      .map(b => ({ workId: b.workId, hours: b.hours, days: Object.keys(b.days).length }))
      .sort((a, b) => b.hours - a.hours);
    return {
      pays, paidTotal, advances, salary: paidTotal - advances, paidMonth,
      daysWorked, hoursTotal, byWorkList, attendance: att,
    };
  }
  function employeeMonth(id) {
    const mk = todayISO().slice(0, 7);
    const att = data.attendance.filter(a => a.employeeId === id && (a.date || '').slice(0, 7) === mk);
    const present = att.filter(a => a.status === 'presente');
    const pays = data.expenses.filter(x => x.employeeId === id && (x.date || '').slice(0, 7) === mk);
    return {
      present: present.length,
      absent: att.length - present.length,
      hours: sum(present.flatMap(a => a.hours || []).map(h => h.hours)),
      salary: sum(pays.filter(x => x.expenseKind !== 'adelanto').map(x => x.amount)),
      advances: sum(pays.filter(x => x.expenseKind === 'adelanto').map(x => x.amount)),
    };
  }
  function employeeAdvances(id) {
    const list = data.expenses.filter(x => x.employeeId === id && x.expenseKind === 'adelanto')
      .slice().sort((a, b) => b.date.localeCompare(a.date));
    return { list, total: sum(list.map(x => x.amount)) };
  }
  function employeeAdvancesThisMonth() {
    const mk = todayISO().slice(0, 7);
    return sum(data.expenses.filter(x => x.employeeId && x.expenseKind === 'adelanto' && (x.date || '').slice(0, 7) === mk).map(x => x.amount));
  }
  /* Dinero acumulado pendiente: (horas totales × tarifa) − adelantos totales.
     Se recalcula en tiempo real cada vez que cambia una jornada o un adelanto. */
  function employeeAccumulated(id) {
    const e = data.employees.find(x => x.id === id);
    const st = employeeStats(id);
    const devengado = round2((st.hoursTotal || 0) * (Number(e ? e.hourlyRate : 0) || 0));
    return { devengado, adelantos: st.advances, acumulado: round2(devengado - st.advances) };
  }

  /* ---------- Consultas por obra: personal y adelantos ---------- */
  function workClientAdvances(workId) {
    const list = data.incomes.filter(x => x.workId === workId && x.incomeKind === 'adelanto')
      .slice().sort((a, b) => b.date.localeCompare(a.date));
    return { list, total: sum(list.map(x => x.amount)) };
  }
  function workEmployeeAdvances(workId) {
    const list = data.expenses.filter(x => x.workId === workId && x.employeeId && x.expenseKind === 'adelanto')
      .slice().sort((a, b) => b.date.localeCompare(a.date));
    return { list, total: sum(list.map(x => x.amount)) };
  }
  function workEmployees(workId) {
    const map = {};
    data.attendance.forEach(a => {
      if (a.status !== 'presente') return;
      (a.hours || []).forEach(h => {
        if (h.workId !== workId) return;
        if (!map[a.employeeId]) map[a.employeeId] = { employeeId: a.employeeId, hours: 0, days: {}, last: a.date };
        map[a.employeeId].hours += Number(h.hours) || 0;
        map[a.employeeId].days[a.date] = true;
        if (a.date > map[a.employeeId].last) map[a.employeeId].last = a.date;
      });
    });
    return Object.values(map).map(m => {
      const emp = employeeById(m.employeeId);
      return {
        employee: emp,
        name: employeeName(emp),
        hours: m.hours,
        days: Object.keys(m.days).length,
        last: m.last,
        cost: emp && emp.hourlyRate ? m.hours * Number(emp.hourlyRate) : 0,
      };
    }).sort((a, b) => b.hours - a.hours);
  }
  function presentToday() {
    return data.attendance.filter(a => a.date === todayISO() && a.status === 'presente');
  }
  function employeesPaidThisMonth() {
    const mk = todayISO().slice(0, 7);
    return sum(data.expenses.filter(x => x.employeeId && x.expenseKind !== 'adelanto' && (x.date || '').slice(0, 7) === mk).map(x => x.amount));
  }
  function removeEmployee(id) {
    data.employees = data.employees.filter(x => x.id !== id);
    data.attendance = data.attendance.filter(a => a.employeeId !== id);
    data.expenses.forEach(x => { if (x.employeeId === id) x.employeeId = null; });
    save();
  }

  /* ---------- Herramientas: ubicación e historial de uso ---------- */
  function moveAsset(id, workId, notes) {
    const a = data.assets.find(x => x.id === id);
    if (!a) return false;
    const next = workId || null;
    if ((a.location || null) === next) return false;
    const usages = (a.usages || []).slice();
    usages.push({ from: todayISO(), workId: next, notes: notes || '' });
    a.location = next;
    a.usages = usages;
    save();
    return true;
  }
  /* Cambia el estado del activo y lo deja registrado en la trazabilidad.
     No toca costos ni borra historial: solo agrega un movimiento. */
  function setAssetStatus(id, status, notes) {
    const a = data.assets.find(x => x.id === id);
    if (!a) return false;
    if ((a.status || 'operativo') === status) return false;   // sin cambio → no registra
    a.status = status;
    const usages = (a.usages || []).slice();
    usages.push({ from: todayISO(), workId: a.location || null, notes: notes || ('Estado: ' + status) });
    a.usages = usages;
    save();
    return true;
  }
  function assetUsage(a) {
    const log = (a.usages || []).slice().sort((x, y) => (x.from || '').localeCompare(y.from || ''));
    const byWork = {};
    let totalDays = 0;
    log.forEach((u, i) => {
      if (!u.from) return;
      const end = i + 1 < log.length && log[i + 1].from ? log[i + 1].from : todayISO();
      const d1 = parseISO(u.from);
      const d2 = parseISO(end);
      const days = Math.max(0, Math.round((d2 - d1) / 86400000));
      if (u.workId && days > 0) {
        totalDays += days;
        byWork[u.workId] = (byWork[u.workId] || 0) + days;
      }
    });
    const byWorkList = Object.keys(byWork)
      .map(id => ({ workId: id, days: byWork[id] }))
      .sort((a, b) => b.days - a.days);
    return { log, totalDays, byWorkList, current: a.location };
  }

  /* ---------- Totales por período (para análisis en el tiempo) ---------- */
  function totalsBetween(from, to) {
    const inR = x => (!from || (x.date || '') >= from) && (!to || (x.date || '') <= to);
    const incomes = sum(data.incomes.filter(inR).map(x => x.amount));
    const direct = sum(data.expenses.filter(x => x.type === 'obra' && inR(x)).map(x => x.amount));
    const general = sum(data.expenses.filter(x => x.type === 'general' && inR(x)).map(x => x.amount));
    const assetsIn = data.assets.filter(a => (!from || (a.purchaseDate || '') >= from) && (!to || (a.purchaseDate || '') <= to));
    const assets = sum(assetsIn.map(x => x.cost));
    const maint = sum(data.assets.flatMap(a => a.maintenance || []).filter(inR).map(m => m.cost));
    return {
      incomes, direct, general, expenses: round2(direct + general),
      net: round2(incomes - direct - general), grossMargin: round2(incomes - direct),
      assets, maint,
      incomesCount: data.incomes.filter(inR).length,
      expensesCount: data.expenses.filter(inR).length,
      assetsCount: assetsIn.length,
    };
  }

  G.store = {
    load, save, reset, exportJSON, importJSON, reload, startReal, startEmpty,
    add, update, remove, restore, removeWork, removeEmployee, nextCode,
    workStats, totals, totalsBetween, monthlySeries, expenseDistribution, distributionSummary, socios, splitsFor, contactById,
    employeeById, employeeName, attendanceFor, employeePayments, employeeStats, employeeMonth, employeeAdvances, employeeAdvancesThisMonth, employeeAccumulated, presentToday, employeesPaidThisMonth,
    workClientAdvances, workEmployeeAdvances, workEmployees,
    moveAsset, setAssetStatus, assetUsage, addAttendance,
    CATS_OBRA, CATS_GENERAL, METODOS, WORK_STATUS, ASSET_STATUS, ASSET_CATS, SEGURO_TIPOS, CONTACT_TYPES, BUDGET_STATUS,
    uid, todayISO, parseISO, monthLabel, daysAgo, daysAhead, sum, KEY, attachUser, hasLocalData, hasOnboarded, applyRemote,
    enterSupportMode, exitSupportMode, inSupportMode,
    seguroDaysLeft, seguroEstado,
    /* Getter defensivo: nunca devuelve null (auto-carga/seed) para evitar
       errores del tipo "reading 'incomes'" durante el render inicial. */
    get data() {
      if (data === null) { try { load(); } catch (e) { data = seed(); } }
      if (data === null) data = seed();
      return data;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);

/* ============================================================
   GADU · Gráficos en canvas (sin dependencias)
   Flujo de caja (áreas) y donut con tooltips interactivos
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU = root.GADU || {};
  const UI = G.ui;

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  function prepare(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 600;
    const h = canvas.clientHeight || 260;
    canvas.width = Math.max(50, Math.floor(w * dpr));
    canvas.height = Math.max(50, Math.floor(h * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return m * p;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function box(ctx, bx, by, bw, bh) {
    const bg = cssVar('--surface-3', '#1f2a47');
    const border = cssVar('--border', '#232e4e');
    ctx.fillStyle = bg;
    roundRect(ctx, bx, by, bw, bh, 8);
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, bw, bh, 8);
    ctx.stroke();
  }

  /* ---------- Flujo de caja: áreas + líneas ---------- */
  function cashflow(canvas, series, categories) {
    const PAD = { L: 46, R: 12, T: 16, B: 26 };
    const draw = () => {
      const { ctx, w, h } = prepare(canvas);
      const st = canvas._cf || {};
      const hover = st.hover;
      ctx.clearRect(0, 0, w, h);

      const padL = PAD.L, padR = PAD.R, padT = PAD.T, padB = PAD.B;
      const pw = w - padL - padR, ph = h - padT - padB;
      const n = categories.length;
      const maxV = niceMax(Math.max(1, ...series.map(s => Math.max(...s.values))));

      ctx.font = '11px "Segoe UI", system-ui, sans-serif';
      const gridColor = cssVar('--border-soft', 'rgba(255,255,255,.06)');
      const mutedColor = cssVar('--muted', '#8b96b3');
      const ticks = 4;
      for (let i = 0; i <= ticks; i++) {
        const y = padT + ph - (ph * i / ticks);
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
        ctx.fillStyle = mutedColor;
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(UI.fmtCompact(maxV * i / ticks), padL - 8, y);
      }

      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      categories.forEach((c, i) => {
        const x = padL + pw * (i + 0.5) / n;
        ctx.fillStyle = mutedColor;
        ctx.fillText(c.label, x, h - padB + 8);
      });

      series.forEach(s => {
        const pts = s.values.map((v, i) => ({ x: padL + pw * (i + 0.5) / n, y: padT + ph - (ph * (v / maxV)) }));
        const grad = ctx.createLinearGradient(0, padT, 0, padT + ph);
        grad.addColorStop(0, s.color + '55');
        grad.addColorStop(1, s.color + '00');
        ctx.beginPath();
        pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.lineTo(pts[pts.length - 1].x, padT + ph);
        ctx.lineTo(pts[0].x, padT + ph);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.beginPath();
        pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.stroke();
        const dotFill = cssVar('--surface', '#121a30');
        pts.forEach(p => {
          ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = dotFill; ctx.fill();
          ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.stroke();
        });
      });

      if (hover != null) {
        const x = padL + pw * (hover + 0.5) / n;
        ctx.strokeStyle = cssVar('--border', '#232e4e');
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ph); ctx.stroke();
        ctx.setLineDash([]);
        const lines = [categories[hover].full];
        let net = 0;
        series.forEach((s, si) => {
          lines.push(s.label + ': ' + UI.fmtMoney(s.values[hover]));
          net += si === 0 ? s.values[hover] : -s.values[hover];
        });
        lines.push('Neto: ' + UI.fmtMoney(net));
        ctx.font = '12px "Segoe UI", system-ui, sans-serif';
        const bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + 24;
        const bh = lines.length * 17 + 14;
        let bx = x + 12;
        if (bx + bw > w - 8) bx = x - bw - 12;
        const by = Math.max(4, Math.min(padT + 8, h - bh - 4));
        box(ctx, bx, by, bw, bh);
        const textColor = cssVar('--text', '#eaeef8');
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        lines.forEach((l, i) => {
          ctx.fillStyle = i === 0 ? mutedColor : textColor;
          ctx.fillText(l, bx + 12, by + 13 + i * 17);
        });
      }
    };

    canvas._cf = { series, categories, hover: null };
    canvas.onmousemove = e => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const st = canvas._cf;
      const n = st.categories.length;
      const idx = Math.max(0, Math.min(n - 1, Math.floor((x - PAD.L) / (canvas.clientWidth - PAD.L - PAD.R) * n)));
      if (st.hover !== idx) { st.hover = idx; draw(); }
    };
    canvas.onmouseleave = () => { canvas._cf.hover = null; draw(); };
    draw();
  }

  /* ---------- Donut ---------- */
  function donut(canvas, segments) {
    const draw = () => {
      const { ctx, w, h } = prepare(canvas);
      const st = canvas._dn || {};
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      const R = Math.min(w, h) / 2 - 10;
      const inner = R * 0.62;
      const total = segments.reduce((a, s) => a + s.value, 0);
      const gap = segments.length > 1 ? 0.03 : 0;
      const mutedColor = cssVar('--muted', '#8b96b3');
      const textColor = cssVar('--text', '#eaeef8');

      if (total <= 0) {
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.strokeStyle = cssVar('--border', '#232e4e'); ctx.lineWidth = 14; ctx.stroke();
        ctx.fillStyle = mutedColor; ctx.font = '12px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('Sin gastos registrados', cx, cy);
        return;
      }

      let ang = -Math.PI / 2;
      segments.forEach((s, i) => {
        const frac = s.value / total;
        const a0 = ang + (i === 0 ? 0 : gap / 2);
        const a1 = ang + frac * Math.PI * 2 - gap / 2;
        const off = st.hover === i ? 5 : 0;
        ctx.beginPath();
        ctx.arc(cx, cy, R + off, a0, a1);
        ctx.arc(cx, cy, inner + off, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = s.color;
        ctx.fill();
        ang += frac * Math.PI * 2;
      });

      ctx.fillStyle = mutedColor;
      ctx.font = '11px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText('Total gastos', cx, cy - 2);
      ctx.fillStyle = textColor;
      ctx.font = 'bold 17px "Segoe UI", system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(UI.fmtCompact(total), cx, cy + 4);

      if (st.hover != null) {
        const s = segments[st.hover];
        const lines = [s.label, UI.fmtMoney(s.value), (s.value / total * 100).toFixed(1) + ' %'];
        ctx.font = '12px "Segoe UI", system-ui, sans-serif';
        const bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + 24;
        const bh = lines.length * 17 + 14;
        const bx = w - bw - 8, by = 8;
        box(ctx, bx, by, bw, bh);
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        lines.forEach((l, i) => {
          ctx.fillStyle = i === 0 ? mutedColor : textColor;
          ctx.fillText(l, bx + 12, by + 13 + i * 17);
        });
      }
    };

    canvas._dn = { segments, hover: null };
    canvas.onmousemove = e => {
      const rect = canvas.getBoundingClientRect();
      const cw = canvas.clientWidth, ch = canvas.clientHeight;
      const cx = cw / 2, cy = ch / 2;
      const dx = e.clientX - rect.left - cx, dy = e.clientY - rect.top - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const R = Math.min(cw, ch) / 2 - 10;
      let ang = Math.atan2(dy, dx) + Math.PI / 2;
      if (ang < 0) ang += Math.PI * 2;
      let idx = null;
      if (dist <= R + 6 && dist >= R * 0.62 - 8) {
        const total = canvas._dn.segments.reduce((a, s) => a + s.value, 0);
        if (total > 0) {
          let acc = 0;
          for (let i = 0; i < canvas._dn.segments.length; i++) {
            acc += canvas._dn.segments[i].value / total * Math.PI * 2;
            if (ang <= acc) { idx = i; break; }
          }
        }
      }
      if (canvas._dn.hover !== idx) { canvas._dn.hover = idx; draw(); }
    };
    canvas.onmouseleave = () => { canvas._dn.hover = null; draw(); };
    draw();
  }

  G.charts = { cashflow, donut };
})(typeof window !== 'undefined' ? window : globalThis);

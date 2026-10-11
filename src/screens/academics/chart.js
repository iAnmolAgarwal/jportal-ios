// sgpa (green) and cgpa (blue) per semester, ui/components/Charts.kt GpaChart.
// semesters without results are ghosts: tap one to add it, drag it up and down
// to see where the cgpa would land. only those columns take the drag, the rest scrolls.
import { h, render } from '../../ui/dom.js';

const H = 220, PAD = 28, TOP = 16, BOTTOM = H - 24, LO = 4, HI = 10;

/** smooth-ish line through points using midpoint quadratics, no overshoot */
function smooth(p) {
  if (!p.length) return '';
  let d = `M${p[0][0]} ${p[0][1]}`;
  for (let i = 1; i < p.length; i++) {
    const [px, py] = p[i - 1], [cx, cy] = p[i];
    d += `Q${px} ${py} ${(px + cx) / 2} ${(py + cy) / 2}`;
    if (i === p.length - 1) d += `L${cx} ${cy}`;
  }
  if (p.length === 1) d += `L${p[0][0]} ${p[0][1]}`;
  return d;
}

/** gpaChart({ onProject(semester, sgpa) }) -> { el, update(points, futureSlots) } */
export function gpaChart({ onProject }) {
  const svg = h('svg', { height: H, width: '100%' });
  const hits = h('div');
  const el = h('div', { class: 'chart', role: 'img' }, svg, hits);
  let pts = [], slots = [], dragging = null, W = 0, hitKey = '';

  const all = () => [...new Set([...pts.map((p) => p.semester), ...slots])].sort((a, b) => a - b);
  const step = () => (W - 2 * PAD) / Math.max(1, all().length - 1);
  const x = (s) => PAD + all().indexOf(s) * step();
  const y = (v) => BOTTOM - ((v - LO) / (HI - LO)) * (BOTTOM - TOP);
  const valueAt = (py) => {
    const v = HI - ((py - TOP) / (BOTTOM - TOP)) * (HI - LO);
    return Math.round(Math.min(HI, Math.max(LO, v)) * 10) / 10;
  };

  function series(color, key) {
    const out = [];
    if (!pts.length) return out;
    const xy = pts.map((p) => [x(p.semester), y(p[key])]);
    let realEnd = pts.findIndex((p) => p.projected);
    if (realEnd < 0) realEnd = pts.length;
    if (realEnd > 1) out.push(h('path', { d: smooth(xy.slice(0, realEnd)), fill: 'none', stroke: color, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    if (realEnd < pts.length) {
      out.push(h('path', { d: smooth(xy.slice(Math.max(0, realEnd - 1))), fill: 'none', stroke: color, 'stroke-opacity': 0.6, 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-dasharray': '6 4' }));
    }
    xy.forEach(([px, py], i) => out.push(pts[i].projected
      ? h('circle', { cx: px, cy: py, r: 7, fill: 'var(--sc-low)', stroke: color, 'stroke-width': 2.5 })
      : h('circle', { cx: px, cy: py, r: 4.5, fill: color })));
    return out;
  }

  function draw() {
    W = el.clientWidth || 342;
    const kids = [];
    for (let g = 5; g <= 10; g++) {
      kids.push(h('line', { x1: PAD, x2: W - PAD, y1: y(g), y2: y(g), stroke: 'var(--outline-variant)', 'stroke-opacity': 0.4, 'stroke-width': 1 }));
      kids.push(h('text', { class: 'lbl', x: 0, y: y(g) + 4 }, String(g)));
    }
    for (const s of all()) kids.push(h('text', { class: 'lbl', x: x(s), y: BOTTOM + 18, 'text-anchor': 'middle' }, `S${s}`));
    for (const s of slots) {
      if (pts.some((p) => p.semester === s)) continue;
      kids.push(h('circle', { cx: x(s), cy: y(8), r: 6, fill: 'none', stroke: 'var(--outline-variant)', 'stroke-width': 1.5, 'stroke-dasharray': '2.4 2.4' }));
    }
    kids.push(...series('var(--cgpa)', 'cgpa'), ...series('var(--sgpa)', 'sgpa'));
    if (dragging != null) {
      const p = pts.find((q) => q.semester === dragging);
      if (p) kids.push(h('text', { class: 'lbl', x: x(dragging), y: y(p.sgpa) - 14, 'text-anchor': 'middle', style: { fill: 'var(--sgpa)', fontSize: '12px' } }, p.sgpa.toFixed(1)));
    }
    render(svg, kids);
    const last = pts.filter((p) => !p.projected).at(-1);
    el.setAttribute('aria-label', `SGPA and CGPA by semester. Latest CGPA ${last ? last.cgpa.toFixed(2) : 0}`);
    const key = `${W}|${all().join(',')}|${slots.join(',')}`;
    if (key !== hitKey) { hitKey = key; drawHits(); }
  }

  function drawHits() {
    const w = Math.max(28, step());
    render(hits, slots.map((s) => h('div', {
      class: 'hit', style: { left: x(s) - w / 2 + 'px', width: w + 'px' },
      'aria-label': `Semester ${s} what-if`,
      onpointerdown: (e) => grab(e, s),
    })));
  }

  function grab(e, s) {
    const t = e.currentTarget;
    try { t.setPointerCapture(e.pointerId); } catch {}
    const y0 = e.clientY;
    let moved = false;
    const top = () => svg.getBoundingClientRect().top;
    const move = (ev) => {
      if (!moved && Math.abs(ev.clientY - y0) < 6) return;
      moved = true;
      dragging = s;
      onProject(s, valueAt(ev.clientY - top()));
    };
    const up = () => {
      t.removeEventListener('pointermove', move);
      t.removeEventListener('pointerup', up);
      t.removeEventListener('pointercancel', up);
      if (!moved && !pts.some((p) => p.semester === s)) onProject(s, pts.at(-1)?.sgpa ?? 8);
      dragging = null;
      draw();
    };
    t.addEventListener('pointermove', move);
    t.addEventListener('pointerup', up);
    t.addEventListener('pointercancel', up);
    e.preventDefault();
  }

  if (typeof ResizeObserver !== 'undefined') {
    let lastW = 0;
    new ResizeObserver(() => { if (el.clientWidth && el.clientWidth !== lastW) { lastW = el.clientWidth; draw(); } }).observe(el);
  }

  return {
    el,
    update(points, futureSlots) { pts = points; slots = futureSlots; draw(); },
  };
}

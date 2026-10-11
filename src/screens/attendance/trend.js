// running attendance % with the goal as a dashed line (ui/components/Charts.kt TrendChart)
import { h, render } from '../../ui/dom.js';

let gid = 0;

/** smooth-ish line through points using midpoint quadratics, no overshoot */
function smooth(pts) {
  if (!pts.length) return '';
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i];
    d += `Q${px.toFixed(1)} ${py.toFixed(1)} ${((px + cx) / 2).toFixed(1)} ${((py + cy) / 2).toFixed(1)}`;
    if (i === pts.length - 1) d += `L${cx.toFixed(1)} ${cy.toFixed(1)}`;
  }
  if (pts.length === 1) d += `L${pts[0][0]} ${pts[0][1]}`;
  return d;
}

/** values: running percentages oldest first. draws at the element's own width */
export function trendChart(values, target) {
  if (values.length < 2) return null;
  const H = 120;
  const last = Math.round(values.at(-1));
  const el = h('div', { class: 'att-trend', role: 'img', 'aria-label': `Attendance trend, now ${last} percent, goal ${target} percent`, style: { height: H + 'px', position: 'relative' } });
  const id = `att-tg${++gid}`;
  let drawnW = 0;
  const draw = () => {
    const W = Math.round(el.clientWidth);
    if (!W || W === drawnW) return;
    drawnW = W;
    // the line's 3px stroke and 5px end dot need a little room at the edges
    const pad = 6;
    const lo = Math.min(Math.min(...values), target) - 5;
    const hi = 100;
    const y = (v) => pad + (H - 2 * pad) - ((v - lo) / (hi - lo)) * (H - 2 * pad);
    const step = (W - 2 * pad) / (values.length - 1);
    const pts = values.map((v, i) => [pad + i * step, y(v)]);
    const line = smooth(pts);
    const end = pts.at(-1);
    const gy = y(target);
    render(el, h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: { display: 'block', overflow: 'visible' } },
      h('defs', null, h('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 },
        h('stop', { offset: '0', 'stop-color': 'var(--primary)', 'stop-opacity': '0.28' }),
        h('stop', { offset: '1', 'stop-color': 'var(--primary)', 'stop-opacity': '0' }))),
      h('line', { x1: 0, y1: gy, x2: W, y2: gy, stroke: 'var(--outline)', 'stroke-width': 1.5, 'stroke-dasharray': '5 5' }),
      h('path', { d: `${line}L${end[0]} ${H}L${pts[0][0]} ${H}Z`, fill: `url(#${id})`, stroke: 'none' }),
      h('path', { d: line, fill: 'none', stroke: 'var(--primary)', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'att-trend-line' }),
      h('circle', { cx: end[0], cy: end[1], r: 5, fill: 'var(--primary)' })));
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(draw).observe(el);
  requestAnimationFrame(draw);
  return el;
}

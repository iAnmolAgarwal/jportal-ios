// a tiny hyperscript helper, no framework. screens build plain dom nodes.
//
//   h('div', { class: 'card', onclick: fn, style: { color: 'red' } }, 'text', child, [more, kids])
//
// props: class, style (object or string), on* handlers, dataset via data-*,
// `html` sets innerHTML (only for trusted svg strings), anything else is an attribute.
// null / false / undefined children are skipped, arrays are flattened.

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'line', 'rect', 'g', 'polyline', 'polygon', 'text', 'defs', 'linearGradient', 'stop']);

export function h(tag, props, ...children) {
  const svg = SVG_TAGS.has(tag);
  const el = svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k.startsWith('--')) el.style.setProperty(k, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, kids) {
  for (const c of kids) {
    if (c == null || c === false || c === true) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** replace all children of el */
export function render(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

/** escape for the rare innerHTML use */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** "COMPILER DESIGN" -> "Compiler Design", keeping short all-caps words like ML, AI, II */
export function titleCase(s) {
  const small = new Set(['and', 'of', 'in', 'for', 'the', 'to', 'on', 'with', 'a', 'an', '&']);
  return String(s ?? '').trim().toLowerCase().split(/\s+/).map((w, i) => {
    if (/^(i{1,3}|iv|vi{0,3}|ix|x)$/.test(w)) return w.toUpperCase();
    if (i > 0 && small.has(w)) return w;
    return w.replace(/(^|[-(/])([a-z])/g, (m, p, c) => p + c.toUpperCase());
  }).join(' ');
}

/** "2026ODDSEM" -> "Odd 2026", "2026EVESEM" -> "Even 2026" */
export function semLabel(code) {
  const m = /^(\d{4})(ODD|EVE)SEM$/i.exec(code || '');
  if (!m) return code || '';
  return `${m[2].toUpperCase() === 'ODD' ? 'Odd' : 'Even'} ${m[1]}`;
}

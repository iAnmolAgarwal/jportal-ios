// shared building blocks. every screen uses these so the app reads as one thing.
import { h, render, semLabel } from './dom.js';
import { ICONS } from './icons.js';
import { ago } from '../core/store.js';

/** a material symbol from the android app's drawables. names: see icons.js */
export function icon(name, size = 24, extra = {}) {
  const ic = ICONS[name];
  if (!ic) return h('span', { style: { width: size + 'px', height: size + 'px', display: 'inline-block' } });
  return h('svg', { viewBox: ic.vb, width: size, height: size, fill: 'currentColor', 'aria-hidden': 'true', ...extra },
    ic.d.map((d) => h('path', { d })));
}

// ---------------------------------------------------------------- ring
// jportal's attendance ring: wavy while safely above target, flat below it.
// a dot on the track marks the target when you're short of it.

const rings = new Set();
let raf = 0;
const WAVE_MS = 4200;
function tick(t) {
  raf = 0;
  for (const r of rings) {
    if (!r.svg.isConnected) { if (r.mounted) rings.delete(r); continue; }
    r.mounted = true;
    r.draw(t);
  }
  if (rings.size) raf = requestAnimationFrame(tick);
}

/**
 * ring({ percent, target, size = 56, stroke = 6, shortfall = false, animate = true }, ...centerChildren)
 * colour: primary when >= target, warn within 10 below, error further below.
 */
export function ring({ percent, target = 75, size = 56, stroke = 6, shortfall = false, animate = true }, ...center) {
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  const safe = pct >= target;
  const color = safe ? 'var(--primary)' : pct >= target - 10 ? 'var(--warn)' : 'var(--error)';
  const amp0 = safe ? stroke * 0.24 : 0;
  const r = size / 2 - stroke / 2 - amp0;
  const c = size / 2;
  const start = -Math.PI / 2;
  const gap = Math.min(0.5, (stroke * 1.6) / r);
  const track = h('path', { fill: 'none', stroke: 'var(--on-surface-variant)', 'stroke-opacity': '0.25', 'stroke-width': stroke, 'stroke-linecap': 'round' });
  const arc = h('path', { fill: 'none', stroke: color, 'stroke-width': stroke, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const svg = h('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, style: { position: 'absolute', inset: '0' } }, track, arc);

  const arcPath = (a0, a1) => {
    const x0 = c + r * Math.cos(a0), y0 = c + r * Math.sin(a0);
    const x1 = c + r * Math.cos(a1), y1 = c + r * Math.sin(a1);
    return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
  };

  let shown = 0;
  const born = performance.now();
  const draw = (t) => {
    // first fill eases in over ~700ms
    const k = Math.min(1, (t - born) / 700);
    shown = (pct / 100) * (1 - Math.pow(1 - k, 3));
    const sweep = shown * 2 * Math.PI;
    if (shown < 0.999) {
      const ts = start + sweep + (shown > 0.001 ? gap : 0);
      const te = start + 2 * Math.PI - (shown > 0.001 ? gap : 0);
      track.setAttribute('d', te > ts ? arcPath(ts, te) : '');
    } else track.setAttribute('d', '');
    if (shown <= 0.001) { arc.setAttribute('d', ''); return; }
    const waves = Math.max(8, (2 * Math.PI * r) / (stroke * 4.6));
    const phase = animate && safe ? ((t % WAVE_MS) / WAVE_MS) * 2 * Math.PI : 0;
    const steps = Math.max(24, Math.floor(shown * waves * 16));
    let d = '';
    for (let i = 0; i <= steps; i++) {
      const a = start + (sweep * i) / steps;
      const edge = Math.min(1, Math.min(i, steps - i) / (steps * 0.08 + 1));
      const rr = r + amp0 * edge * Math.sin(waves * (a - start) + phase);
      d += `${i ? 'L' : 'M'}${(c + rr * Math.cos(a)).toFixed(2)} ${(c + rr * Math.sin(a)).toFixed(2)}`;
    }
    arc.setAttribute('d', d);
    if (k >= 1 && !(animate && safe)) rings.delete(entry);
  };
  if (shortfall && pct > 0 && pct < target) {
    const ta = start + (target / 100) * 2 * Math.PI;
    svg.append(h('circle', { cx: c + r * Math.cos(ta), cy: c + r * Math.sin(ta), r: stroke * 0.3, fill: 'var(--error)' }));
  }
  const entry = { svg, draw, mounted: false };
  rings.add(entry);
  if (!raf) raf = requestAnimationFrame(tick);
  draw(born);
  return h('div', { class: 'ring', style: { position: 'relative', width: size + 'px', height: size + 'px', flex: 'none', display: 'grid', placeItems: 'center' } },
    svg, h('div', { style: { position: 'relative', textAlign: 'center', lineHeight: '1.05' } }, ...center));
}

// ---------------------------------------------------------------- layout

/**
 * the top of every tab or pushed screen.
 * header({ title, subtitle, back: fn?, right: node? })
 */
export function header({ title, subtitle, back, right }) {
  return h('div', { class: 'head' },
    h('div', { class: 'topbar' },
      back ? h('button', { class: 'back', onclick: back, 'aria-label': 'Back' }, icon('arrow_back')) : h('span'),
      right || h('span')),
    h('h1', { class: 'headline page-title' }, title),
    subtitle ? h('div', { class: 'label muted page-sub' }, subtitle) : null);
}

/** "Updated 5m ago" that keeps itself current */
export function updated(at) {
  const el = h('span', { class: 'label muted' }, ago(at));
  const id = setInterval(() => { if (!el.isConnected) clearInterval(id); else el.textContent = ago(at); }, 30000);
  return el;
}

export const section = (text) => h('div', { class: 'section' }, text);
export const note = (text) => h('div', { class: 'note' }, text);

/**
 * semester picker: a chip that opens the native ios picker.
 * semChip({ sems: [{registrationcode, registrationid}], value: code, onChange(sem), filled })
 */
export function semChip({ sems, value, onChange, filled = false, label = semLabel }) {
  const sel = h('select', { 'aria-label': 'Semester', onchange: (e) => onChange(sems.find((s) => s.registrationcode === e.target.value)) },
    sems.map((s) => h('option', { value: s.registrationcode, selected: s.registrationcode === value }, label(s.registrationcode))));
  return h('label', { class: ['chip', filled && 'filled'] }, label(value), icon('expand_more', 20), sel);
}

/** segmented({ options: [['overview','Overview'],...], value, onChange }) */
export function segmented({ options, value, onChange }) {
  return h('div', { class: 'seg', role: 'tablist' },
    options.map(([k, text]) => h('button', { role: 'tab', 'aria-selected': String(k === value), onclick: () => onChange(k) }, text)));
}

// ---------------------------------------------------------------- states

export const spinner = () => h('div', { class: 'center' }, h('div', { class: 'spinner' }));
export const skeletons = (n = 4, height = 100) => h('div', { class: 'stack' }, Array.from({ length: n }, () => h('div', { class: 'skeleton', style: { height: height + 'px' } })));

/** a friendly empty or failed state */
export function emptyState(title, body, action) {
  return h('div', { class: 'center' },
    h('div', { class: 'title-lg' }, title),
    body ? h('div', { class: 'body-md muted', style: { maxWidth: '280px' } }, body) : null,
    action || null);
}

export function errorState(err, retry) {
  const expired = err?.kind === 'expired';
  return emptyState(
    expired ? 'Signed out' : "Couldn't load this",
    expired ? 'Your portal session ran out. Sign in again on the portal.' : (err?.message || String(err)),
    expired
      ? h('button', { class: 'btn', onclick: () => { location.href = '/studentportal/'; } }, 'Sign in')
      : retry ? h('button', { class: 'btn tonal', onclick: retry }, icon('refresh', 18), 'Retry') : null);
}

/** a slim banner above cached data when the refresh failed */
export function staleBanner(err) {
  return h('div', { class: 'banner' }, icon('wifi_off', 18), h('span', null, `Showing saved data. ${err?.message || ''}`));
}

// ---------------------------------------------------------------- sheet

/** a bottom sheet over the whole app. returns close() */
export function sheet(...content) {
  const host = document.querySelector('#jportal-root')?.shadowRoot?.querySelector('.app') || globalThis.__jpApp;
  const close = () => { scrim.remove(); panel.remove(); };
  const scrim = h('div', { class: 'scrim', onclick: close });
  const panel = h('div', { class: 'sheet' }, h('div', { class: 'grip' }), ...content);
  host.append(scrim, panel);
  return close;
}

export { h, render };

// bits the academics tab and the grade card share: their css, jportal's grade
// letter and value-over-label figure, and a tiny live resource over cached().
import { h } from '../../ui/dom.js';
import { cached, peek } from '../../core/store.js';
import { gradeColor } from '../../domain/academics.js';

// one style tag per screen root; every rule sits under .acad so it can't leak into other screens
export const CSS = `
.acad .hd-row { display: flex; gap: 28px; padding: 0 4px; }
.acad .big .k { font-size: 14px; line-height: 20px; font-weight: 600; color: var(--on-surface-variant); }
.acad .big .v { font-size: 44px; line-height: 48px; font-weight: 700; letter-spacing: -1.5px; font-variation-settings: 'ROND' 100; font-variant-numeric: tabular-nums; }
.acad .seg-wrap { position: sticky; top: calc(-1 * (var(--safe-t) + 8px)); z-index: 3; background: var(--bg); margin: -8px -16px 0; padding: 8px 16px 16px; }
.acad .credits { display: flex; align-items: flex-end; margin-top: 16px; padding: 0 4px; }
.acad .credits .t { font-size: 16px; line-height: 24px; font-weight: 600; margin: 0 0 6px; }
.acad .bar { display: flex; align-items: center; gap: 4px; height: 8px; margin: 8px 4px 0; }
.acad .bar .fill { height: 8px; border-radius: 4px; background: var(--cgpa); }
.acad .bar .track { flex: 1; height: 8px; border-radius: 4px; background: var(--surface-variant); position: relative; }
.acad .bar .track::after { content: ''; position: absolute; right: 2px; top: 2px; width: 4px; height: 4px; border-radius: 2px; background: var(--cgpa); }
.acad .chart-card { background: var(--sc-low); border-radius: var(--r-lg); padding: 16px 8px; margin-top: 16px; }
.acad .chart { position: relative; height: 220px; user-select: none; -webkit-user-select: none; }
.acad .chart svg { position: absolute; inset: 0; overflow: visible; }
.acad .chart .hit { position: absolute; top: 0; bottom: 0; touch-action: none; cursor: ns-resize; }
.acad .chart-foot { display: flex; align-items: center; gap: 8px; padding: 0 12px; min-height: 40px; }
.acad .chart-foot .body-sm { flex: 1; }
.acad .lbl { font-size: 11px; font-weight: 600; fill: var(--on-surface-variant); font-family: var(--font); }

/* the android 16 grouped list: rows a hair apart, outer corners round, inner barely */
.acad .xg { display: flex; flex-direction: column; gap: 3px; }
.acad .xg > .xi { background: var(--sc-low); border-radius: 6px; overflow: hidden; position: relative; }
.acad .xg > .xi:first-child { border-top-left-radius: 24px; border-top-right-radius: 24px; }
.acad .xg > .xi:last-child { border-bottom-left-radius: 24px; border-bottom-right-radius: 24px; }
.acad .xi.tap { cursor: pointer; }
.acad .xi.tap:active { background: var(--sc-high); }
.acad .row-sem { display: flex; align-items: center; padding: 14px 12px 14px 20px; gap: 0; }
.acad .row-sem .grow { flex: 1; min-width: 0; }
.acad .fig { display: flex; flex-direction: column; align-items: center; }
.acad .fig .v { font-size: 22px; line-height: 28px; font-weight: 700; font-variation-settings: 'ROND' 100; font-variant-numeric: tabular-nums; }
.acad .fig .k { font-size: 11px; line-height: 16px; font-weight: 600; letter-spacing: .3px; color: var(--on-surface-variant); }
.acad .chev { color: var(--on-surface-variant); display: grid; place-items: center; margin-left: 4px; }

/* grade letter on a faint wash of its own colour */
.acad .gl { position: relative; display: grid; place-items: center; font-weight: 700; flex: none; font-variation-settings: 'ROND' 100; }
.acad .gl::before, .acad .gchip.on::before, .acad .wash::before { content: ''; position: absolute; inset: 0; border-radius: inherit; background: currentColor; opacity: .14; pointer-events: none; }
.acad .gl span { position: relative; }

/* sgpa calculator */
.acad .calc-sum { padding: 16px 16px 16px 20px; }
.acad .calc-sum .hd-row { padding: 0; }
.acad .calc-sub { padding: 14px 16px 14px 20px; }
.acad .calc-sub .meta { display: flex; align-items: center; gap: 6px; }
.acad .gchips { display: flex; gap: 5px; margin-top: 10px; }
.acad .gchip { position: relative; min-width: 0; height: 34px; padding: 0; border-radius: 10px; border: 1px solid var(--outline-variant); font-size: 14px; font-weight: 700; color: var(--on-surface-variant); font-variation-settings: 'ROND' 100; flex: 1 1 0; max-width: 48px; }
.acad .gchip.on { border-color: transparent; }
.acad .cr-in { width: 56px; height: 30px; border-radius: 8px; border: 1px solid var(--outline); background: transparent; padding: 0 8px; font-size: 14px; font-weight: 600; }
.acad .hint { font-size: 12px; line-height: 16px; color: var(--on-surface-variant); }

/* exams */
.acad .sem-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.acad .strip { display: flex; gap: 6px; overflow-x: auto; margin: 8px -16px 0; padding: 4px 16px; scrollbar-width: none; scroll-behavior: auto; }
.acad .strip::-webkit-scrollbar { display: none; }
.acad .dc { flex: none; min-width: 48px; min-height: 72px; padding: 10px; border-radius: 24px; display: flex; flex-direction: column; align-items: center; color: var(--on-surface-variant); background: transparent; }
.acad .dc.today { box-shadow: inset 0 0 0 2px var(--primary); }
.acad .dc.exam { background: var(--secondary-container); color: var(--on-secondary-container); cursor: pointer; }
.acad .dc.done { background: var(--sc-high); color: var(--on-surface-variant); cursor: pointer; }
.acad .dc.next { background: var(--tertiary-container); color: var(--on-tertiary-container); }
.acad .dc .in { display: flex; flex-direction: column; align-items: center; }
.acad .dc.dim .in { opacity: .6; }
.acad .dc .wd { font-size: 11px; line-height: 16px; font-weight: 600; }
.acad .dc .dn { font-size: 16px; line-height: 24px; font-weight: 700; font-variant-numeric: tabular-nums; }
.acad .dc .dots { display: flex; gap: 3px; height: 6px; margin-top: 4px; }
.acad .dc .dots i { width: 6px; height: 6px; border-radius: 3px; background: currentColor; }
.acad .dayh { display: flex; align-items: center; padding: 12px 4px 8px; font-size: 14px; line-height: 20px; font-weight: 600; }
.acad .dayh .grow { color: var(--on-surface-variant); }
.acad .dayh .rel { color: var(--primary); }
.acad .gap { display: flex; align-items: center; gap: 0; padding: 8px 16px; color: var(--on-surface-variant); font-size: 12px; font-weight: 600; }
.acad .gap hr { flex: 1; border: 0; border-top: 1px solid var(--outline-variant); margin: 0 12px; }
.acad .gap .ic { display: flex; align-items: center; gap: 6px; }
.acad .paper { display: flex; align-items: stretch; padding: 0 12px 0 8px; position: relative; cursor: pointer; }
.acad .paper.next::before { content: ''; position: absolute; inset: 0; background: var(--tertiary-container); opacity: .6; }
.acad .paper > * { position: relative; }
.acad .paper.done > .tb, .acad .paper.done > .txt { opacity: .6; }
.acad .tb { width: 84px; flex: none; padding: 12px 0; text-align: right; }
.acad .tb .c { font-size: 22px; line-height: 28px; font-weight: 700; color: var(--primary); font-variation-settings: 'ROND' 100; white-space: nowrap; letter-spacing: -0.3px; }
.acad .tb .c small { font-size: 12px; font-weight: 600; }
.acad .tb .to { font-size: 12px; line-height: 16px; font-weight: 600; color: var(--on-surface-variant); white-space: nowrap; }
.acad .rail { width: 28px; flex: none; position: relative; }
.acad .rail i { position: absolute; left: 50%; transform: translateX(-50%); display: block; }
.acad .rail .ln { width: 2px; background: var(--outline-variant); }
.acad .rail .acc { width: 6px; border-radius: 3px; background: var(--tertiary); }
.acad .rail .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--outline-variant); top: 21px; }
.acad .rail .dot.big { width: 14px; height: 14px; top: 19px; background: var(--tertiary); }
.acad .txt { flex: 1; min-width: 0; padding: 12px 0; }
.acad .txt .s { font-size: 16px; line-height: 24px; font-weight: 600; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.acad .txt .m { font-size: 14px; line-height: 20px; color: var(--on-surface-variant); }
.acad .txt .clash { display: flex; align-items: center; gap: 4px; margin-top: 4px; color: var(--error); font-size: 12px; font-weight: 600; }
.acad .seat { align-self: center; margin-left: 8px; min-width: 56px; padding: 6px 10px; border-radius: 12px; text-align: center; background: var(--secondary-container); color: var(--on-secondary-container); }
.acad .seat .r { font-size: 14px; line-height: 20px; font-weight: 700; white-space: nowrap; }
.acad .seat .st { font-size: 11px; line-height: 16px; font-weight: 600; white-space: nowrap; }
.acad .seat.soon { background: transparent; border: 1px dashed var(--outline); color: var(--on-surface-variant); display: flex; flex-direction: column; align-items: center; }
.acad .pend { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
.acad .pend .ic { min-width: 64px; display: grid; place-items: center; color: var(--on-surface-variant); }
.acad .doneh { display: flex; align-items: center; width: 100%; padding: 12px 0 12px 4px; margin-top: 12px; color: var(--primary); font-size: 14px; font-weight: 600; text-align: left; }
.acad .doneh .grow { flex: 1; }
.acad .doneh svg { transition: transform .2s; }
.acad .doneh.open svg { transform: rotate(180deg); }
.acad-sheet .lab { font-size: 14px; font-weight: 600; color: var(--primary); }
.acad-sheet .fact { display: flex; gap: 16px; align-items: flex-start; }
.acad-sheet .fact svg { flex: none; margin-top: 2px; color: var(--on-surface-variant); }
.acad-sheet .fact.err svg { color: var(--error); }
.acad-sheet .facts { display: flex; flex-direction: column; gap: 14px; margin-top: 16px; }
.acad-sheet .acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
.acad-sheet hr { border: 0; border-top: 1px solid var(--outline-variant); margin: 20px 0; }

/* grade card */
.acad .gc-row { display: flex; align-items: center; padding: 14px 16px 14px 20px; gap: 12px; }
.acad .gc-row .grow { flex: 1; min-width: 0; }
.acad .gc-row .n { font-size: 16px; line-height: 24px; font-weight: 600; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.acad .gc-row .cd { font-size: 12px; line-height: 16px; font-weight: 600; color: var(--on-surface-variant); }
.acad .gc-row .fig { margin-left: 4px; min-width: 44px; }
`;

export const style = () => h('style', null, CSS);

/** jportal's grade column: the letter in its colour on a faint wash of it */
export function gradeLetter(grade, size = 44) {
  const g = String(grade || '').trim();
  return h('div', {
    class: 'gl', 'aria-label': `Grade ${g || 'not out'}`,
    style: { width: size + 'px', height: size + 'px', borderRadius: size * 0.3 + 'px', color: gradeColor(g), fontSize: Math.round(size * 0.42) + 'px' },
  }, h('span', null, g || '–'));
}

/** jportal's value-over-label column */
export const figure = (value, label, color) => h('div', { class: 'fig' },
  h('div', { class: 'v', style: { color } }, value), h('div', { class: 'k' }, label));

/** headline number with its label on top */
export const big = (label, value, color) => h('div', { class: 'big' },
  h('div', { class: 'k' }, label), h('div', { class: 'v', style: { color } }, value));

/** a grouped list, rows a hair apart */
export const xgroup = (rows, extra = {}) => h('div', { class: 'xg', ...extra }, rows.map((r) => (r ? h('div', { class: ['xi', r.tap && 'tap'], onclick: r.tap, role: r.tap ? 'button' : null }, r.el) : null)));

/** coalesces bursts of updates into one render per frame */
export function scheduler(fn) {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    Promise.resolve().then(() => { queued = false; fn(); });
  };
}

/**
 * a live view over store.cached: { data, at, error, done }. data comes from the
 * cache straight away when there is one, then from the network. onChange runs on every change.
 */
export function resource(key, fn, onChange) {
  const r = { data: peek(key), at: null, error: null, done: false, key };
  const go = () => {
    r.done = false;
    cached(key, fn, (d, info) => { r.data = d; r.at = info.at; if (info.fresh) r.error = null; onChange(); })
      .then(() => { r.done = true; onChange(); })
      .catch((e) => { r.error = e; r.done = true; onChange(); });
  };
  r.reload = () => { r.error = null; go(); onChange(); };
  go();
  return r;
}

export const NO_MEMBER = 'Sign out and sign in again once so JPortal can pick up your student id.';

/** lowercase portal semesters: { registrationcode, registrationid } lists under various keys */
export const semList = (resp, ...path) => {
  let v = resp;
  for (const p of path) v = v?.[p];
  return Array.isArray(v) ? v.filter((s) => s && s.registrationcode) : [];
};

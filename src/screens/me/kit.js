// shared bits for the me and subjects slices: jportal-android's grouped rows,
// entries, info rows, grade letters and a small loader for single-call pages.
// class names are jm-* since every screen shares one shadow root.
import { h, render, titleCase, semLabel } from '../../ui/dom.js';
import { icon, header, skeletons, errorState, staleBanner, emptyState, semChip, updated } from '../../ui/components.js';
import { cached } from '../../core/store.js';

export const KIT_CSS = `
.jm-grp { display: flex; flex-direction: column; gap: 3px; }
.jm-grp > * { background: var(--sc-low); border-radius: 6px; overflow: hidden; }
.jm-grp > :first-child { border-top-left-radius: 24px; border-top-right-radius: 24px; }
.jm-grp > :last-child { border-bottom-left-radius: 24px; border-bottom-right-radius: 24px; }
.jm-tap { cursor: pointer; transition: background .12s; }
.jm-tap:active { background: var(--sc-high); }
.jm-entry { display: flex; align-items: center; gap: 16px; padding: 14px 20px; min-height: 72px; }
.jm-ebox { width: 44px; height: 44px; border-radius: 50%; flex: none; display: grid; place-items: center; background: var(--sc-high); color: var(--on-surface-variant); }
.jm-ebox.alert { background: var(--tertiary-container); color: var(--on-tertiary-container); }
.jm-et { font-size: 16px; line-height: 24px; font-weight: 600; }
.jm-es { font-size: 14px; line-height: 20px; color: var(--on-surface-variant); }
.jm-info { display: flex; align-items: center; padding: 12px 20px; gap: 8px; }
.jm-info.trail { padding-right: 8px; }
.jm-ik { font-size: 12px; line-height: 16px; font-weight: 600; color: var(--on-surface-variant); letter-spacing: .2px; }
.jm-iv { font-size: 16px; line-height: 24px; overflow-wrap: anywhere; }
.jm-sec { display: flex; align-items: center; gap: 8px; margin: 28px 0 12px 4px; }
.jm-sec .section { margin: 0; flex: 1; }
.jm-fig { display: flex; flex-direction: column; align-items: center; flex: none; min-width: 48px; }
.jm-fig b { font-size: 22px; line-height: 28px; font-weight: 700; color: var(--cgpa); font-variation-settings: 'ROND' 100; }
.jm-fig span { font-size: 11px; line-height: 16px; font-weight: 600; color: var(--on-surface-variant); letter-spacing: .3px; }
.jm-grade { flex: none; display: grid; place-items: center; font-weight: 700; position: relative; font-variation-settings: 'ROND' 100; }
.jm-grade::before { content: ''; position: absolute; inset: 0; border-radius: inherit; background: currentColor; opacity: .14; }
.jm-av { display: grid; place-items: center; border-radius: 50%; background: var(--primary); color: var(--on-primary); flex: none; font-weight: 600; font-variation-settings: 'ROND' 100; }
.jm-picker { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 8px; }
.jm-picker .chip.filled { background: var(--secondary-container); color: var(--on-secondary-container); height: 32px; border-radius: 8px; font-size: 14px; padding: 0 8px 0 12px; }
.jm-toast { position: absolute; left: 50%; bottom: calc(var(--safe-b) + 96px); transform: translateX(-50%); z-index: 30; background: var(--on-surface); color: var(--bg); padding: 10px 18px; border-radius: 999px; font-size: 14px; font-weight: 600; white-space: nowrap; animation: jp-fade .2s; pointer-events: none; }
.jm-blank { height: 16px; }
`;

/** "TEST  NAME" -> "Test Name": first letter after any non-letter goes up, the rest down */
export function nameCase(s) {
  const t = String(s ?? '').trim().replace(/\s+/g, ' ');
  let out = '';
  for (let i = 0; i < t.length; i++) out += i === 0 || !/\p{L}/u.test(t[i - 1]) ? t[i].toUpperCase() : t[i].toLowerCase();
  return out;
}

/** 4 -> "4", 3.5 -> "3.5" */
export const fmt = (d) => { const n = Number(d) || 0; return n % 1 === 0 ? String(n) : n.toFixed(1); };
/** "₹50,000" the way android's %,.0f prints it */
export const rupees = (v) => '₹' + Math.round(Number(v) || 0).toLocaleString('en-US');
export const blank = (v) => v == null || String(v).trim() === '';
export { titleCase, semLabel };

const GRADE_VARS = { 'A+': '--g-ap', A: '--g-a', 'B+': '--g-bp', B: '--g-b', 'C+': '--g-cp', C: '--g-c', D: '--g-d', F: '--g-f' };
export const gradeColor = (g) => { const v = GRADE_VARS[String(g || '').trim().toUpperCase()]; return v ? `var(${v})` : 'var(--on-surface-variant)'; };

/** android's Group: rows a hair apart, outer corners round */
export const group = (...rows) => h('div', { class: 'jm-grp' }, ...rows);

/** a tappable row with a round icon tile, title and optional subtitle */
export function entry({ icon: ic, title, subtitle, alert = false, onClick, trailing }) {
  return h('div', { class: ['jm-entry', onClick && 'jm-tap'], role: onClick ? 'button' : null, onclick: onClick || null },
    h('div', { class: ['jm-ebox', alert && 'alert'] }, icon(ic, 24)),
    h('div', { class: 'grow' },
      h('div', { class: 'jm-et' }, title),
      subtitle ? h('div', { class: 'jm-es' }, subtitle) : null),
    trailing || null);
}

/** section header in primary, an optional trailing node on the right */
export const sectionH = (text, trailing) => h('div', { class: 'jm-sec' }, h('div', { class: 'section' }, text), trailing || null);

/** big number over a small label, credits style */
export const figure = (value, label) => h('div', { class: 'jm-fig' }, h('b', null, value), h('span', null, label));

/** the grade letter in its colour on a faint wash of the same colour */
export function gradeLetter(grade, size = 44) {
  return h('div', {
    class: 'jm-grade', 'aria-label': `Grade ${grade || 'not out'}`,
    style: { width: size + 'px', height: size + 'px', borderRadius: size * 0.3 + 'px', color: gradeColor(grade), fontSize: Math.round(size * 0.42) + 'px' },
  }, h('span', { style: { position: 'relative' } }, grade || '–'));
}

export function initials(name, size) {
  const txt = String(name || '').split(' ').filter((w) => w.trim()).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return h('div', { class: 'jm-av', style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.34) + 'px' } }, txt);
}

/** a short pill at the bottom of the app */
export function toast(text) {
  const app = globalThis.__jpApp;
  if (!app) return;
  app.querySelectorAll('.jm-toast').forEach((t) => t.remove());
  const t = h('div', { class: 'jm-toast', role: 'status' }, text);
  app.append(t);
  setTimeout(() => t.remove(), 1800);
}

export async function copy(label, value) {
  try {
    await navigator.clipboard.writeText(String(value));
    toast(`${label} copied`);
  } catch {
    toast("Couldn't copy");
  }
}

/** label over value; a tap copies `copyValue` (the value unless told otherwise). blank values give null */
export function infoRow(label, value, { copyValue = value, trailing } = {}) {
  if (blank(value)) return null;
  const can = !blank(copyValue);
  return h('div', { class: ['jm-info', can && 'jm-tap', trailing && 'trail'], onclick: can ? () => copy(label, copyValue) : null },
    h('div', { class: 'grow' }, h('div', { class: 'jm-ik' }, label), h('div', { class: 'jm-iv' }, String(value))),
    trailing || null);
}

/** a group of info rows, blank ones dropped so the corners land on real rows */
export function infoGroup(pairs) {
  const rows = pairs.map(([k, v]) => infoRow(k, v)).filter(Boolean);
  return rows.length ? group(...rows) : null;
}

/**
 * one portal call drawn on a pushed page, android's Page(): skeleton, then the
 * data (cache first), a stale banner when the refresh failed, an error with retry.
 * draw(data) returns the content nodes.
 */
export function loadPage(ctx, { title, key, load, draw, maxAge = 0, css = '' }) {
  const body = h('div', null, skeletons(3, 72));
  const root = h('div', null, h('style', null, KIT_CSS + css), header({ title, back: ctx.pushed ? ctx.nav.back : undefined }), body);
  const run = () => {
    let shown = false;
    cached(key, load, (data) => { shown = true; render(body, draw(data)); }, { maxAge })
      .catch((e) => {
        if (shown || e.stale) body.prepend(staleBanner(e));
        else render(body, errorState(e, () => { render(body, skeletons(3, 72)); run(); }));
      });
  };
  run();
  return root;
}

/**
 * android's rememberPicked: a semester list, the newest picked until you pick,
 * and what the portal says for it. onState({ sems, sem, data, at, error, loading }) on every change.
 */
export function picked({ key, list, of, onState }) {
  const st = { sems: null, sem: null, data: undefined, at: 0, error: null, loading: true };
  const emit = () => onState({ ...st });
  const loadSem = (sem) => {
    st.sem = sem; st.data = undefined; st.error = null; st.loading = true; emit();
    if (!sem) { st.data = null; st.loading = false; emit(); return; }
    let got = false;
    cached(`${key}:${sem.registrationcode}`, () => of(sem), (data, { at }) => {
      if (st.sem !== sem) return;
      got = true; st.data = data; st.at = at; st.loading = false; emit();
    }).catch((e) => {
      if (st.sem !== sem) return;
      st.error = e; st.loading = false; if (!got) st.data = undefined; emit();
    });
  };
  const start = () => {
    st.error = null; st.loading = true; emit();
    let got = false;
    cached(`${key}:sems`, list, (sems) => {
      const first = !got;
      got = true;
      st.sems = sems;
      if (first || !sems.some((s) => s.registrationcode === st.sem?.registrationcode)) loadSem(sems[0] || null);
    }).catch((e) => {
      if (got) return; // cached semesters are fine, the per-semester call reports its own trouble
      st.error = e; st.loading = false; emit();
    });
  };
  start();
  return {
    pick: (sem) => loadSem(sem),
    retry: () => (st.sems ? loadSem(st.sem) : start()),
  };
}

/** android's SemesterPicker: filled chip on the left, "Updated …" on the right */
export function semesterPicker(sems, sem, onPick, at) {
  if (!sem || !sems?.length) return null;
  return h('div', { class: 'jm-picker' },
    semChip({ sems, value: sem.registrationcode, onChange: onPick, filled: true }),
    at ? updated(at) : null);
}

export { emptyState, errorState, staleBanner, skeletons, header };

// marks, read out of the portal's "Subject Marks (Event Wise)" pdf.
// android: feature/academics/Marks.kt. the same content lives in two places:
//   marksPane(ctx)  the Marks segment of the Academics tab (no page title, the tab has one)
//   marks(ctx)      Route.Marks, pushed from a subject's "All marks", { code } picks the semester
// exam columns keep the portal's own names and order, the college's scheme is the college's business.

import { h, render, titleCase } from '../ui/dom.js';
import { header, semChip, updated, skeletons, emptyState, errorState, staleBanner } from '../ui/components.js';
import { api } from '../core/api.js';
import { cached } from '../core/store.js';
import { parseMarks, MarksParseError } from '../core/marks/parser.js';

const CSS = `
.mk-pick { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 12px; min-height: 40px; }
.mk-list { display: flex; flex-direction: column; gap: 10px; }
.mk-sum { background: var(--primary-container); color: var(--on-primary-container); border-radius: var(--r-xl); padding: 20px; margin: 4px 0 3px; }
.mk-sum .lbl { font-size: 14px; line-height: 20px; font-weight: 600; letter-spacing: .1px; }
.mk-sum .row { display: flex; align-items: flex-end; gap: 0; }
.mk-sum .number { font-variant-numeric: normal; }
.mk-sum .of { font-size: 16px; line-height: 24px; font-weight: 600; padding: 0 0 6px 4px; }
.mk-sum .pct { margin-left: auto; font-size: 24px; line-height: 32px; font-weight: 700; font-variation-settings: 'ROND' 100; padding-bottom: 4px; }
.mk-card { display: block; width: 100%; text-align: left; background: var(--sc-low); border-radius: var(--r-lg); padding: 16px; color: var(--on-surface); }
.mk-card:active { filter: brightness(0.97); }
.mk-top { display: flex; align-items: flex-start; gap: 12px; }
.mk-name { font-size: 16px; line-height: 24px; font-weight: 600; letter-spacing: .15px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.mk-code { font-size: 12px; line-height: 16px; font-weight: 600; letter-spacing: .5px; color: var(--on-surface-variant); }
.mk-tot { flex: none; text-align: right; }
.mk-got { font-size: 24px; line-height: 32px; font-weight: 700; font-variation-settings: 'ROND' 100; }
.mk-so { font-size: 11px; line-height: 16px; font-weight: 600; letter-spacing: .5px; color: var(--on-surface-variant); }
.mk-bar { display: flex; height: 6px; margin-top: 10px; }
.mk-bar .ind { height: 6px; border-radius: 3px; flex: none; }
.mk-bar .trk { height: 6px; border-radius: 3px; flex: 1; background: var(--secondary-container); margin-left: 4px; }
.mk-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.mk-chip { background: var(--sc-high); border-radius: var(--r-md); padding: 10px 14px; min-width: 0; max-width: 100%; }
.mk-ev { font-size: 12px; line-height: 16px; font-weight: 600; letter-spacing: .5px; color: var(--on-surface-variant); overflow-wrap: anywhere; }
.mk-val { display: flex; align-items: flex-end; gap: 4px; }
.mk-main { font-size: 24px; line-height: 32px; font-weight: 700; font-variation-settings: 'ROND' 100; }
.mk-sub { font-size: 12px; line-height: 16px; font-weight: 600; letter-spacing: .5px; padding-bottom: 4px; }
`;

// ---------------------------------------------------------------- helpers

/** 13 -> "13", 13.125 -> "13.1" (kotlin's "%.1f", half up) */
export function fmt(d) {
  if (d % 1 === 0) return String(d);
  const r = Math.round(Math.abs(d) * 10 + 1e-9) / 10;
  return (d < 0 ? '-' : '') + r.toFixed(1);
}

/** android's marks bands: >=80% green, >=60% yellow, >=40% orange, else red */
const band = (f) => (f >= 0.8 ? 0 : f >= 0.6 ? 1 : f >= 0.4 ? 2 : 3);
const bar = (f) => `var(--m${band(f)})`;
const ink = (f) => `var(--m${band(f)}-ink)`;

const weighted = (s) => s.scores.map((e) => e.weighted).filter((w) => w && w.type === 'value');
const sum = (xs, k) => xs.reduce((a, x) => a + x[k], 0);

function friendly(e) {
  if (e instanceof MarksParseError) return Object.assign(new Error("Couldn't read the marks PDF from the portal"), { stale: e.stale, at: e.at });
  return e;
}

// ---------------------------------------------------------------- pieces

function summary(report) {
  const all = report.subjects.flatMap(weighted);
  const got = sum(all, 'obtained');
  const max = sum(all, 'max');
  return h('div', { class: 'mk-sum' },
    h('div', { class: 'lbl' }, 'So far, all subjects'),
    h('div', { class: 'row' },
      h('span', { class: 'number' }, fmt(got)),
      h('span', { class: 'of' }, `of ${fmt(max)}`),
      max > 0 ? h('span', { class: 'pct' }, `${Math.trunc((got * 100) / max)}%`) : null));
}

/** one exam event: raw marks (OM), tinted by band; absent in red; a dash otherwise */
export function scoreChip(e) {
  const m = e.marks;
  let main = '–', sub = '', tint = null;
  if (m && m.type === 'value') {
    main = fmt(m.obtained);
    sub = `of ${fmt(m.max)}`;
    if (m.max > 0) tint = ink(m.obtained / m.max);
  } else if (m && m.type === 'absent') {
    main = 'A'; sub = 'absent'; tint = 'var(--error)';
  }
  return h('div', { class: 'mk-chip' },
    h('div', { class: 'mk-ev' }, e.event),
    h('div', { class: 'mk-val' },
      h('span', { class: 'mk-main', style: tint ? { color: tint } : null }, main),
      sub ? h('span', { class: 'mk-sub' }, sub) : null));
}

function subjectCard(s, code, nav) {
  const isNa = (x) => x && x.type === 'na';
  const shown = s.scores.filter((e) => !isNa(e.marks) || !isNa(e.weighted));
  const w = weighted(s);
  const got = sum(w, 'obtained');
  const max = sum(w, 'max');
  const f = max > 0 ? Math.min(1, Math.max(0, got / max)) : 0;
  return h('button', { class: 'mk-card', onclick: () => code && nav?.push('subject', { semCode: code, subjectCode: s.code }) },
    h('div', { class: 'mk-top' },
      h('div', { class: 'grow' },
        h('div', { class: 'mk-name' }, titleCase(s.name)),
        h('div', { class: 'mk-code' }, s.code)),
      max > 0 ? h('div', { class: 'mk-tot' },
        h('div', { class: 'mk-got' }, fmt(got)),
        h('div', { class: 'mk-so' }, `of ${fmt(max)} so far`)) : null),
    max > 0 ? h('div', { class: 'mk-bar', role: 'progressbar', 'aria-valuenow': Math.round(f * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 },
      f > 0 ? h('div', { class: 'ind', style: { width: `calc((100% - ${f < 1 ? 4 : 0}px) * ${f})`, background: bar(got / max) } }) : null,
      f < 1 ? h('div', { class: 'trk', style: f > 0 ? null : { marginLeft: '0' } }) : null) : null,
    shown.length ? h('div', { class: 'mk-chips' }, shown.map(scoreChip)) : null);
}

// ---------------------------------------------------------------- the content

/**
 * semester chip + "Updated", then the marks for that semester.
 * startCode: semester to open on (falls back to the newest).
 */
function marksContent(ctx, startCode) {
  const pick = h('div', { class: 'mk-pick' });
  const stale = h('div');
  const body = h('div', null, skeletons(1, 136), h('div', { style: { height: '12px' } }), skeletons(3, 150));
  const root = h('div', { class: 'mk' }, h('style', null, CSS), pick, stale, body);

  let sems = [];
  let picked = startCode || null;
  let token = 0;
  let lastAt = 0; // when the report on screen was fetched

  const drawPick = (sem, at) => {
    if (!sem) { render(pick); pick.style.display = 'none'; return; }
    pick.style.display = '';
    render(pick,
      semChip({ sems, value: sem.registrationcode, filled: true, onChange: (s) => { if (s) { picked = s.registrationcode; loadReport(); } } }),
      at ? updated(at) : null);
  };

  const showReport = (report) => {
    if (!report.subjects.length) { render(body, emptyState('No marks uploaded yet')); return; }
    render(body, h('div', { class: 'mk-list' },
      summary(report),
      report.subjects.map((s) => subjectCard(s, current()?.registrationcode, ctx.nav))));
  };

  const current = () => sems.find((s) => s.registrationcode === picked) || sems[0] || null;

  function loadReport() {
    const sem = current();
    const my = ++token;
    render(stale);
    if (!sem) {
      // no marks semesters at all is an answer too, not something to wait on
      drawPick(null);
      render(body, emptyState('No marks uploaded yet'));
      return;
    }
    lastAt = 0;
    drawPick(sem);
    render(body, skeletons(1, 136), h('div', { style: { height: '12px' } }), skeletons(3, 150));
    let have = false;
    cached(`marks:${sem.registrationcode}`, async () => parseMarks(await api.marksPdf(sem)), (report, { at }) => {
      if (my !== token) return;
      have = true;
      lastAt = at;
      render(stale);
      drawPick(sem, at);
      showReport(report);
    }, { maxAge: 30 * 60 * 1000 }).catch((e) => {
      if (my !== token) return;
      const err = friendly(e);
      if (have || e.stale) render(stale, staleBanner(err));
      else render(body, errorState(err, loadReport));
    });
  }

  function loadSems() {
    render(body, skeletons(1, 136), h('div', { style: { height: '12px' } }), skeletons(3, 150));
    let started = false;
    cached('marks:sems', () => api.marksSemesters(), (data) => {
      sems = data?.semestercode || [];
      // the cached list answers first; only refetch the report when the semester changes
      const before = started ? current()?.registrationcode : null;
      if (!sems.some((s) => s.registrationcode === picked)) picked = sems[0]?.registrationcode || null;
      if (!started || before !== current()?.registrationcode) { started = true; loadReport(); }
      else drawPick(current(), lastAt);
    }, { maxAge: 6 * 60 * 60 * 1000 }).catch((e) => {
      if (started) return; // a cached list is on screen, the report has its own stale banner
      render(body, errorState(e, loadSems));
    });
  }

  loadSems();
  return root;
}

/** the Marks segment inside the Academics tab: no page title */
export function marksPane(ctx = {}) {
  return marksContent(ctx, ctx.code || ctx.params?.code || null);
}

/** Route.Marks: the same view full-screen with a back arrow. params { code } */
export function marks(ctx) {
  return h('div', null,
    header({ title: 'Marks', back: ctx.nav.back }),
    marksContent(ctx, ctx.params?.code || null));
}

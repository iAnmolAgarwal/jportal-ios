// the subjects tab: everything ever registered, searchable. port of
// feature/subjects/SubjectsScreen.kt with the stitching from AcademicsData.kt
// (registrations per semester + grades from the grade cards + the current semester).
import { h, render } from '../ui/dom.js';
import { icon, header, skeletons, errorState, staleBanner, emptyState } from '../ui/components.js';
import { api } from '../core/api.js';
import { cached } from '../core/store.js';
import { session } from '../core/session.js';
import { KIT_CSS, group, sectionH, figure, gradeLetter, fmt, nameCase, titleCase, semLabel } from './me/kit.js';
import { registrationRows } from './me/registration.js';

const CSS = `
.js-search { display: flex; align-items: center; gap: 4px; height: 56px; border-radius: 28px; background: var(--sc-high); padding: 0 4px 0 16px; color: var(--on-surface-variant); }
.js-search input { flex: 1; min-width: 0; height: 100%; border: 0; outline: 0; background: transparent; color: var(--on-surface); font-size: 16px; padding: 0 8px; }
.js-search input::placeholder { color: var(--on-surface-variant); }
.js-search input::-webkit-search-cancel-button { -webkit-appearance: none; }
.js-chips { display: flex; gap: 8px; overflow-x: auto; padding: 8px 0 0; margin: 0 -16px; padding-left: 16px; padding-right: 16px; scrollbar-width: none; }
.js-chips::-webkit-scrollbar { display: none; }
.js-chip { flex: none; display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 16px; border-radius: 8px; border: 1px solid var(--outline-variant); font-size: 14px; font-weight: 600; color: var(--on-surface-variant); }
.js-chip[aria-pressed=true] { background: var(--secondary-container); border-color: transparent; color: var(--on-secondary-container); padding-left: 8px; }
.js-now { padding: 3px 10px; border-radius: 999px; background: var(--secondary-container); color: var(--on-secondary-container); font-size: 12px; font-weight: 600; }
.js-row { display: flex; align-items: center; gap: 12px; padding: 14px 20px; }
.js-name { font-size: 16px; line-height: 22px; font-weight: 600; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.js-code { font-size: 12px; line-height: 16px; font-weight: 600; color: var(--on-surface-variant); margin-top: 2px; }
.js-t { font-size: 12px; line-height: 16px; color: var(--on-surface-variant); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.js-hit { color: var(--primary); font-weight: 700; }
`;

const COMPONENT = { L: 'Lecture', T: 'Tutorial', P: 'Practical' };
const ORDER = ['L', 'T', 'P'];
const HALF_DAY = 12 * 3600 * 1000;
const FILTERS = [['current', 'This semester'], ['labs', 'Labs'], ['graded', 'Graded']];

/** where a regular term sits in time: 2025EVESEM (january) comes right before 2025ODDSEM (july) */
function term(code) {
  const m = /(\d{4})(ODD|EVE|EVEN)SEM/.exec(String(code || '').toUpperCase());
  return m ? Number(m[1]) * 2 + (m[2] === 'ODD' ? 1 : 0) : null;
}

/** a registered subject, its L/T/P rows folded into one */
function fold(semCode, rows, grades) {
  const by = new Map();
  for (const r of rows) {
    const code = String(r.subjectcode || '').trim();
    if (!code) continue;
    if (!by.has(code)) by.set(code, []);
    by.get(code).push(r);
  }
  return [...by].map(([code, parts]) => {
    const seen = new Set();
    const teachers = parts
      .map((p) => [String(p.subjectcomponentcode || '').trim(), String(p.employeename || '').trim().replace(/\s+/g, ' ')])
      .filter(([, n]) => n)
      .sort((a, b) => ((ORDER.indexOf(a[0]) + 10) % 10) - ((ORDER.indexOf(b[0]) + 10) % 10))
      .filter(([k, n]) => { const id = k + '|' + n; if (seen.has(id)) return false; seen.add(id); return true; });
    const g = grades.find((x) => String(x.subjectcode || '').trim() === code)?.grade;
    return {
      semCode, code,
      name: parts[0].subjectdesc || code,
      credits: Math.max(...parts.map((p) => Number(p.credits) || 0)),
      teachers,
      audit: parts.some((p) => p.audtsubject === 'Y'),
      grade: g && String(g).trim() ? String(g).trim() : null,
      get lab() { return this.teachers.length > 0 && this.teachers.every(([k]) => k === 'P'); },
    };
  });
}

export function subjects(ctx) {
  const S = {
    currentCode: null, currentNumber: null,
    regs: {}, grades: {}, // code -> rows
    pending: 0, metaDone: false, semsDone: false,
    error: null, stale: null,
    noMember: !session()?.memberId,
  };
  let query = '';
  const filters = new Set();

  // ---------------------------------------------------------------- data
  const asked = new Set();
  const track = (p) => { S.pending++; schedule(); p.catch(() => {}).finally(() => { S.pending--; schedule(); }); };
  const core = (e) => {
    if (e?.stale) { S.stale = e; schedule(); } else if (!S.error) { S.error = e; schedule(); }
  };

  function load() {
    S.error = null; S.stale = null;
    asked.clear();
    track(cached('jm:subj:meta', () => api.attendanceMeta(), (d) => {
      S.currentCode = d?.semlist?.[0]?.registrationcode || null;
      S.currentNumber = Number(d?.headerlist?.[0]?.stynumber) || null;
      S.metaDone = true; schedule();
    }).catch((e) => { S.metaDone = true; core(e); }));

    track(cached('jm:subj:sems', () => api.subjectSemesters().then((r) => r?.registrations || []), (sems) => {
      S.semsDone = true;
      if (S.noMember) { schedule(); return; }
      sems.forEach((sem, i) => {
        const key = 'reg:' + sem.registrationcode;
        if (asked.has(key)) return;
        asked.add(key);
        // the newest semester can still change, older ones are settled
        track(cached(`jm:subj:reg:${sem.registrationcode}`, () => api.registeredSubjects(sem), (d) => {
          S.regs[sem.registrationcode] = d?.registrations || []; schedule();
        }, { maxAge: i === 0 ? 0 : HALF_DAY }));
      });
    }).catch((e) => { S.semsDone = true; core(e); }));

    // grades are a nice-to-have on this screen, their failures stay quiet
    const program = cached('jm:subj:program', () => api.program().then((r) => r?.studentinfo || null), () => {}, { maxAge: 7 * 24 * 3600 * 1000 });
    program.catch(() => {});
    track(cached('jm:subj:gsems', () => api.gradeCardSemesters().then((r) => r?.registrations || []), (sems) => {
      program.then((prog) => {
        if (!prog) return;
        for (const sem of sems) {
          const key = 'gc:' + sem.registrationcode;
          if (asked.has(key)) continue;
          asked.add(key);
          track(cached(`jm:subj:gc:${sem.registrationcode}`, () => api.gradeCard(sem, prog), (d) => {
            S.grades[sem.registrationcode] = d?.gradecard || []; schedule();
          }, { maxAge: HALF_DAY }));
        }
      }).catch(() => {});
    }));
  }

  function semesters() {
    const anchor = term(S.currentCode);
    const numberOf = (code) => {
      const t = term(code);
      if (t == null || anchor == null || !S.currentNumber) return null;
      const n = S.currentNumber - (anchor - t);
      return n > 0 ? n : null;
    };
    const codes = [...new Set([S.currentCode, ...Object.keys(S.regs), ...Object.keys(S.grades)].filter(Boolean))];
    return codes.map((code) => ({
      code,
      number: numberOf(code),
      current: code === S.currentCode,
      subjects: fold(code, S.regs[code] || [], S.grades[code] || []),
    })).sort((a, b) => (b.current - a.current) || ((term(b.code) || 0) - (term(a.code) || 0)));
  }

  // ---------------------------------------------------------------- view
  const input = h('input', {
    type: 'search', placeholder: 'Search subjects, teachers, codes', 'aria-label': 'Search subjects', enterkeyhint: 'search',
    autocomplete: 'off', autocorrect: 'off', spellcheck: 'false',
    oninput: () => { query = input.value; drawClear(); draw(); },
    onkeydown: (e) => { if (e.key === 'Enter') input.blur(); },
  });
  const clearSlot = h('span');
  const drawClear = () => render(clearSlot, query ? h('button', {
    class: 'iconbtn', 'aria-label': 'Clear', onclick: () => { input.value = ''; query = ''; drawClear(); draw(); },
  }, icon('close', 24)) : null);
  const chips = h('div', { class: 'js-chips' });
  const drawChips = () => render(chips, FILTERS.map(([k, label]) => h('button', {
    class: 'js-chip', 'aria-pressed': String(filters.has(k)), 'data-filter': k,
    onclick: () => { filters.has(k) ? filters.delete(k) : filters.add(k); drawChips(); draw(); },
  }, filters.has(k) ? icon('done', 18) : null, label)));
  drawChips();
  drawClear();

  const regBox = h('div', null, sectionH('Registration'), registrationRows(ctx));
  const list = h('div');
  const banner = h('div');

  /** bold and tinted where the query hit, so you can see why a row is here */
  const hit = (text, q) => {
    if (!q) return text;
    const lower = text.toLowerCase();
    const out = [];
    let at = 0, i = lower.indexOf(q);
    while (i >= 0) {
      if (i > at) out.push(text.slice(at, i));
      out.push(h('span', { class: 'js-hit' }, text.slice(i, i + q.length)));
      at = i + q.length;
      i = lower.indexOf(q, at);
    }
    out.push(text.slice(at));
    return out;
  };

  const matches = (s, sub, q) =>
    (!filters.has('current') || s.current) &&
    (!filters.has('labs') || sub.lab) &&
    (!filters.has('graded') || sub.grade != null) &&
    (!q || sub.name.toLowerCase().includes(q) || sub.code.toLowerCase().includes(q) || sub.teachers.some(([, n]) => n.toLowerCase().includes(q)));

  const subjectRow = (sub, q) => h('div', {
    class: 'js-row jm-tap', role: 'button',
    onclick: () => ctx.nav.push('subject', { semCode: sub.semCode, subjectCode: sub.code }),
  },
    h('div', { class: 'grow' },
      h('div', { class: 'js-name' }, hit(titleCase(sub.name), q)),
      h('div', { class: 'js-code' }, hit(sub.code + (sub.audit ? ' · audit' : ''), q)),
      sub.teachers.map(([k, n]) => h('div', { class: 'js-t' }, hit(`${COMPONENT[k] || k}: ${nameCase(n)}`, q)))),
    // graded subjects show the grade, running ones show credits big
    sub.grade ? gradeLetter(sub.grade, 44) : figure(fmt(sub.credits), 'credits'));

  let raf = 0;
  function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); }

  function draw() {
    const q = query.trim().toLowerCase();
    const loading = S.pending > 0 || !S.metaDone || !S.semsDone;
    const groups = semesters().map((s) => [s, s.subjects.filter((sub) => matches(s, sub, q))]).filter(([, l]) => l.length);
    // registration is this semester's paperwork, not a subject, so it steps aside while you search
    regBox.style.display = !q && !filters.size ? '' : 'none';
    render(banner, S.stale && !S.error ? staleBanner(S.stale) : null);
    let state = null;
    if (!groups.length) {
      if (S.error) state = errorState(S.error, load);
      else if (S.noMember && !q && !filters.size) state = emptyState("Can't list your subjects", 'Sign out and sign in again once so JPortal can pick up your student id.');
      else if (loading) state = h('div', { style: { marginTop: '28px' } }, skeletons(4, 96));
      else state = emptyState(q ? `Nothing matches “${query.trim()}”` : filters.size ? 'Nothing matches these filters' : 'No subjects yet');
    }
    render(list, state, groups.map(([s, l]) => [
      sectionH([s.number ? `Semester ${s.number}` : null, semLabel(s.code)].filter(Boolean).join(' · '),
        s.current ? h('span', { class: 'js-now' }, 'Now') : null),
      group(...l.map((sub) => subjectRow(sub, q))),
    ]));
  }

  load();
  draw();

  return h('div', null,
    h('style', null, KIT_CSS + CSS),
    header({ title: 'Subjects' }),
    banner,
    h('label', { class: 'js-search' }, icon('search', 24), input, clearSlot),
    chips,
    regBox,
    list);
}

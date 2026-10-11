// the sgpa calculator (new, not in the android app): pick the grade you expect in
// each of this semester's subjects, see the sgpa live and the cgpa it would give.
import { h, render, titleCase, semLabel } from '../../ui/dom.js';
import { section, icon } from '../../ui/components.js';
import { api } from '../../core/api.js';
import { GRADES, calculate, foldSubjects, gradeColor, fmt, f2 } from '../../domain/academics.js';
import { big, resource, semList, NO_MEMBER } from './ui.js';

const KEY = 'jp:sgpacalc';
const loadAll = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
const saveAll = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };

/** sgpaCalc(data) -> { el, update() }; data is academicsData() */
export function sgpaCalc(d) {
  const el = h('div');
  let sems = null;
  const regs = new Map(); // code -> resource
  const update = () => draw();

  function semester() {
    const { code, sem } = d.current;
    if (!code) return null;
    if (!sems) sems = resource('acad:subjsems', () => api.subjectSemesters(), update);
    // the subjects list's own id when it has this semester, the attendance one otherwise
    return semList(sems.data, 'registrations').find((s) => s.registrationcode === code) || (sems.done || sems.error ? sem : null);
  }

  function draw() {
    if (d.noMember) {
      render(el, section('SGPA calculator'), h('div', { class: 'card body-md muted' }, NO_MEMBER));
      return;
    }
    const sem = semester();
    if (!sem) {
      render(el, d.meta.error && !d.meta.data ? null : [section('SGPA calculator'), h('div', { class: 'skeleton', style: { height: '160px' } })]);
      return;
    }
    const code = sem.registrationcode;
    if (!regs.has(code)) regs.set(code, resource('acad:regs:' + code, () => api.registeredSubjects(sem), update));
    const r = regs.get(code);
    const head = section('SGPA calculator');
    if (!r.data) {
      if (!r.error) return render(el, head, h('div', { class: 'skeleton', style: { height: '160px' } }));
      return render(el, head, h('div', { class: 'card' },
        h('div', { class: 'body-md muted' }, `Couldn't load this semester's subjects. ${r.error.message || ''}`),
        h('button', { class: 'btn tonal', style: { marginTop: '12px' }, onclick: r.reload }, icon('refresh', 18), 'Retry')));
    }
    const all = foldSubjects(r.data.registrations);
    const audits = all.filter((s) => s.audit);
    const store = loadAll();
    const mine = store[code] || (store[code] = { g: {}, c: {} });
    mine.g ||= {}; mine.c ||= {};
    const subjects = all.filter((s) => !s.audit).map((s) => ({ ...s, own: !(s.credits > 0), credits: s.credits > 0 ? s.credits : Number(mine.c[s.code]) || 0 }));
    if (!subjects.length) return render(el, head, h('div', { class: 'card body-md muted' }, 'No subjects registered for this semester yet.'));

    const { number } = d.current;
    const base = d.list.filter((x) => !number || x.semester < number);
    const sum = h('div', { class: 'calc-sum' });
    const save = () => { store[code] = mine; saveAll(store); };
    const drawSum = () => {
      const c = calculate(subjects, mine.g, base);
      const picked = Object.keys(mine.g).filter((k) => subjects.some((s) => s.code === k)).length;
      render(sum,
        h('div', { class: 'row', style: { alignItems: 'flex-start' } },
          h('div', { class: 'hd-row grow' },
            big('SGPA', c.sgpa != null ? f2(c.sgpa) : '–', 'var(--sgpa)'),
            base.length ? big('CGPA', c.cgpa != null ? f2(c.cgpa) : '–', 'var(--cgpa)') : null),
          picked ? h('button', { class: 'btn text', style: { height: '36px', marginRight: '-8px' }, onclick: () => { mine.g = {}; save(); draw(); } }, 'Reset') : null),
        h('div', { class: 'hint', style: { marginTop: '8px' } },
          picked
            ? `${semLabel(code)} · ${picked} of ${subjects.length} subjects · ${fmt(c.credits)} credits` + (picked < subjects.length ? '. The rest aren\'t counted yet.' : '')
            : `Pick the grade you expect in each ${semLabel(code)} subject.` + (base.length ? ' CGPA is what you\'d have after this semester.' : '')));
    };
    drawSum();

    const rows = subjects.map((s) => {
      const chips = GRADES.map((g) => h('button', {
        class: ['gchip', mine.g[s.code] === g && 'on'],
        style: mine.g[s.code] === g ? { color: gradeColor(g) } : null,
        'aria-pressed': String(mine.g[s.code] === g),
        'aria-label': `${g} in ${titleCase(s.name)}`,
        onclick: () => {
          if (mine.g[s.code] === g) delete mine.g[s.code]; else mine.g[s.code] = g;
          save(); draw();
        },
      }, g));
      const credit = s.own
        ? h('label', { class: 'meta hint' }, h('input', {
            class: 'cr-in', type: 'number', inputmode: 'decimal', min: '0', max: '10', step: '0.5', placeholder: '?',
            value: s.credits || '', 'aria-label': `Credits for ${titleCase(s.name)}`,
            oninput: (e) => { const v = Number(e.target.value); if (v > 0) mine.c[s.code] = v; else delete mine.c[s.code]; s.credits = v > 0 ? v : 0; save(); drawSum(); },
          }), 'credits')
        : null;
      return h('div', { class: 'xi' }, h('div', { class: 'calc-sub' },
        h('div', { class: 'title' }, titleCase(s.name)),
        h('div', { class: 'meta hint' }, s.own ? [s.code, ' · ', credit] : `${s.code} · ${fmt(s.credits)} credits`),
        h('div', { class: 'gchips' }, chips)));
    });

    render(el, head,
      h('div', { class: 'xg' }, h('div', { class: 'xi' }, sum), rows),
      audits.length ? h('div', { class: 'note' }, `${audits.map((a) => titleCase(a.name)).join(', ')} ${audits.length === 1 ? 'is an audit subject' : 'are audit subjects'}, ${audits.length === 1 ? 'it doesn\'t' : 'they don\'t'} count.`) : null);
  }

  return { el, update };
}

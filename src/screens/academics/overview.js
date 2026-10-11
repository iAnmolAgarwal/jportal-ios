// academics overview: cgpa / sgpa, credits, the what-if chart, the sgpa
// calculator and one row per semester (AcademicsScreen.kt overview()).
import { h, render, semLabel } from '../../ui/dom.js';
import { icon, section, skeletons, errorState, staleBanner, emptyState } from '../../ui/components.js';
import { gpaPoints, fmt, f1, f2 } from '../../domain/academics.js';
import { academicsData } from './data.js';
import { gpaChart } from './chart.js';
import { sgpaCalc } from './calc.js';
import { big, xgroup, scheduler, figure, NO_MEMBER } from './ui.js';

const WHATIF = 'jp:whatif';
const loadWhatif = () => {
  try {
    const v = JSON.parse(localStorage.getItem(WHATIF) || '{}') || {};
    return Object.fromEntries(Object.entries(v).filter(([k, x]) => Number(k) > 0 && typeof x === 'number'));
  } catch { return {}; }
};

export function overview(ctx) {
  const root = h('div');
  const draw = scheduler(() => full());
  const d = academicsData(draw);
  let projections = loadWhatif();
  const save = () => { try { localStorage.setItem(WHATIF, JSON.stringify(projections)); } catch {} };

  const chart = gpaChart({ onProject: (s, v) => { projections = { ...projections, [s]: v }; save(); live(); } });
  const headEl = h('div');
  const foot = h('div', { class: 'chart-foot' });
  const chartCard = h('div', { class: 'chart-card' }, chart.el, foot);
  const calc = sgpaCalc(d);

  /** the bits a drag changes, redrawn without touching the rest */
  function live() {
    const real = d.list;
    const cr = d.credits.data;
    const latest = real.at(-1);
    const required = Number(cr?.totalreqcredit) || 0;
    // the portal's stymax is today's semester on most accounts, so the length of the course comes from the credits it needs
    const course = required > 0 ? Math.round(required / 20) : 8;
    const maxSem = Math.min(12, Math.max(course, (latest?.semester || 0) + 1, 2));
    const nextCredits = Number(cr?.registeredCredits) > 0 ? Number(cr.registeredCredits) : latest?.courseCredits || 20;
    const future = [];
    for (let s = (latest?.semester || 0) + 1; s <= maxSem; s++) future.push(s);
    const proj = Object.fromEntries(Object.entries(projections).filter(([k]) => future.includes(Number(k))));
    const points = gpaPoints(real, proj, nextCredits, maxSem);
    const projected = points.at(-1)?.projected ? points.at(-1) : null;
    const earned = cr ? Number(cr.earnedcredit) : null;

    render(headEl,
      h('div', { class: 'hd-row' },
        big('CGPA', latest ? f2(latest.cgpa) : '–', 'var(--cgpa)'),
        big('SGPA', latest ? f2(latest.sgpa) : '–', 'var(--sgpa)'),
        projected ? big('Projected', f2(projected.cgpa), 'var(--tertiary)') : null),
      earned != null && required > 0 ? [
        h('div', { class: 'credits' },
          h('span', { class: 'number', style: { color: 'var(--cgpa)' } }, String(earned)),
          h('span', { class: 't' }, ` / ${required} credits`)),
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': earned, 'aria-valuemax': required },
          h('div', { class: 'fill', style: { width: `calc(${Math.min(1, earned / required) * 100}% - 2px)` } }),
          earned < required ? h('div', { class: 'track' }) : null),
      ] : null);
    chart.update(points, future);
    const any = Object.keys(proj).length > 0;
    render(foot,
      h('div', { class: 'body-sm muted' }, any ? 'Dashed lines are what-ifs, not results' : 'Tap a future semester, then drag to see where your CGPA lands'),
      any ? h('button', { class: 'btn text', style: { height: '36px' }, onclick: () => { projections = {}; save(); live(); } }, 'Reset') : null);
  }

  function semesterRows() {
    const graded = d.semesters.filter((s) => s.result);
    if (!graded.length) return null;
    return [
      section('Semesters'),
      xgroup(graded.map((s) => {
        const r = s.result;
        return {
          tap: s.code ? () => ctx.nav.push('gradecard', { code: s.code }) : null,
          el: h('div', { class: 'row-sem' },
            h('div', { class: 'grow' },
              h('div', { class: 'title' }, s.number ? `Semester ${s.number}` : semLabel(s.code)),
              h('div', { class: 'body-sm muted' }, [s.code ? semLabel(s.code) : null, `${fmt(r.earnedCredits)} credits`].filter(Boolean).join(' · '))),
            figure(f1(r.sgpa), 'SGPA', 'var(--sgpa)'),
            h('div', { style: { width: '16px' } }),
            figure(f2(r.cgpa), 'CGPA', 'var(--cgpa)'),
            h('span', { class: 'chev' }, s.code ? icon('chevron_right', 24) : h('span', { style: { width: '24px' } }))),
        };
      })),
    ];
  }

  function full() {
    calc.update();
    if (d.noMember) {
      return render(root, emptyState("Can't load your results", NO_MEMBER), calc.el);
    }
    const res = d.results;
    if (!res.data) {
      if (!res.error) return render(root, skeletons(3, 120));
      return render(root, errorState(res.error, () => { d.reload(); draw(); }));
    }
    const real = d.list;
    if (!real.length) {
      return render(root, res.error ? staleBanner(res.error) : null, emptyState('No results yet, first semester?'), calc.el);
    }
    live();
    render(root,
      res.error ? staleBanner(res.error) : null,
      headEl, chartCard, semesterRows(), calc.el,
      h('div', { style: { height: '16px' } }));
  }

  full();
  return root;
}

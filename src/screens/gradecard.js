// one semester's grade card: the results up top, then every subject with its
// grade and credits (feature/academics/GradeCardScreen.kt). params: { code }
import { h, render, titleCase, semLabel } from '../ui/dom.js';
import { header, spinner, emptyState, errorState, staleBanner } from '../ui/components.js';
import { api } from '../core/api.js';
import { fmt, f1, f2, numberOf } from '../domain/academics.js';
import { academicsData } from './academics/data.js';
import { style, big, gradeLetter, figure, xgroup, resource, scheduler, semList } from './academics/ui.js';

export function gradecard(ctx) {
  const code = ctx.params?.code || '';
  const head = h('div');
  const body = h('div');
  const root = h('div', { class: 'acad' }, style(), head, body);
  const draw = scheduler(() => full());
  const d = academicsData(draw);
  let card = null;

  function full() {
    const { code: cur, number } = d.current;
    const n = numberOf(code, cur, number);
    render(head, header({ title: 'Grade card', subtitle: [n ? `Semester ${n}` : null, semLabel(code)].filter(Boolean).join(' · '), back: ctx.nav.back }));

    const sem = semList(d.gcSems.data, 'registrations').find((s) => s.registrationcode === code);
    const program = d.program.data?.studentinfo;
    if (sem && program && !card) card = resource('acad:gc:' + code, () => api.gradeCard(sem, program), draw);

    const loading = !card ? !((d.gcSems.done || d.gcSems.error) && (d.program.done || d.program.error)) : !card.data && !card.error;
    const entries = (card?.data?.gradecard || []).filter((e) => e && (e.subjectcode || e.subjectdesc));
    if (!entries.length) {
      if (loading) return render(body, spinner());
      const err = card?.error || (!sem ? d.gcSems.error : null) || (!program ? d.program.error : null);
      if (err && !card?.data) return render(body, errorState(err, () => { card = null; d.reload(); draw(); }));
      return render(body, emptyState("Grades aren't out yet"));
    }

    const result = n ? d.list.find((r) => r.semester === n) : null;
    const total = entries.reduce((a, e) => a + (Number(e.coursecreditpoint) || 0), 0);
    render(body,
      card.error ? staleBanner(card.error) : null,
      h('div', { class: 'hd-row', style: { marginTop: '-8px' } },
        result ? [big('SGPA', f1(result.sgpa), 'var(--sgpa)'), big('CGPA', f2(result.cgpa), 'var(--cgpa)')] : null,
        big('Credits', fmt(result?.earnedCredits > 0 ? result.earnedCredits : total), 'var(--cgpa)')),
      h('div', { style: { height: '16px' } }),
      xgroup(entries.map((e) => ({
        tap: () => ctx.nav.push('subject', { semCode: code, subjectCode: String(e.subjectcode || '').trim() }),
        el: h('div', { class: 'gc-row' },
          h('div', { class: 'grow' },
            h('div', { class: 'n' }, titleCase(e.subjectdesc)),
            h('div', { class: 'cd' }, String(e.subjectcode || '').trim())),
          gradeLetter(e.grade, 44),
          figure(fmt(e.coursecreditpoint), 'credits', 'var(--cgpa)')),
      }))),
      h('div', { style: { height: '16px' } }));
  }

  full();
  return root;
}

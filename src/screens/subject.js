// one subject, pushed from the attendance tab (and anywhere else with { semCode, subjectCode }).
// after jportal-android's feature/subject/SubjectScreen.kt: big ring and verdict,
// components with teachers, the month calendar, the trend, credits, every class.
import { h, render, semLabel } from '../ui/dom.js';
import { ring, icon, header, section, note, spinner, emptyState, errorState, staleBanner } from '../ui/components.js';
import { api } from '../core/api.js';
import { cached, load, prefs, now } from '../core/store.js';
import { session } from '../core/session.js';
import {
  subjectCode, subjectName, componentIds, componentTags, portalPercent, classesOf, chronological,
  tally, canMiss, mustAttend, calendar, trend, titleCase, nameCase, dayLabel, timeLabel, isoDay,
} from '../domain/attendance.js';
import { META_KEY, detailKey, dailyKey, dailySubject, semNumber, semesters, stillRing, scheduler, SHARED_CSS } from './attendance/common.js';
import { monthCalendar, CALENDAR_CSS } from './attendance/calendar.js';
import { trendChart } from './attendance/trend.js';

const CSS = SHARED_CSS + CALENDAR_CSS + `
.att-subj .hero { display: flex; flex-direction: column; align-items: center; padding: 12px 0; }
.att-subj .hero .big { font-size: 44px; line-height: 48px; letter-spacing: -1.5px; }
.att-subj .hero .of { font-size: 14px; line-height: 20px; font-weight: 600; }
.att-subj .hero .none { color: var(--on-surface-variant); }
.att-subj .hero .after { margin-top: 16px; text-align: center; }
.att-verdict { position: relative; isolation: isolate; display: inline-block; border-radius: 999px; padding: 8px 16px; font-size: 14px; line-height: 20px; font-weight: 600; text-align: center; }
.att-verdict::before { content: ''; position: absolute; inset: 0; border-radius: inherit; background: currentColor; opacity: .14; z-index: -1; }
.att-verdict.good { color: var(--good); }
.att-verdict.bad { color: var(--error); }
.att-verdict.warn { color: var(--warn); }
.att-subj .grade { margin-top: 12px; font-size: 16px; line-height: 24px; font-weight: 600; }
.att-subj .gradeletter { position: relative; isolation: isolate; width: 120px; height: 120px; border-radius: 36px; display: grid; place-items: center; font-size: 50px; font-weight: 700; font-variation-settings: 'ROND' 100; }
.att-subj .gradeletter::before { content: ''; position: absolute; inset: 0; border-radius: inherit; background: currentColor; opacity: .14; z-index: -1; }
.att-subj .gradesub { margin-top: 12px; font-size: 16px; line-height: 24px; font-weight: 600; color: var(--on-surface-variant); }
.att-comp { display: flex; flex-direction: column; gap: 8px; }
.att-comp .row { background: var(--sc-low); border-radius: var(--r-md); padding: 14px; gap: 14px; }
.att-comp .k { width: 36px; height: 36px; flex: none; border-radius: 50%; display: grid; place-items: center; background: var(--secondary-container); color: var(--on-secondary-container); font-size: 16px; font-weight: 600; }
.att-comp .n { font-size: 15px; line-height: 20px; font-weight: 600; }
.att-comp .t { font-size: 13px; line-height: 18px; color: var(--on-surface-variant); }
.att-comp .p { font-size: 16px; line-height: 24px; font-weight: 700; font-variant-numeric: tabular-nums; }
.att-subj .note { margin: 8px 4px 0; font-size: 13px; line-height: 18px; }
.att-subj .section { margin-left: 4px; }
.att-subj .att-trend { margin: 0 4px; }
.att-day { padding: 4px 0; }
.att-day .empty { padding: 10px 4px; font-size: 14px; line-height: 20px; color: var(--on-surface-variant); }
.att-class { display: flex; align-items: center; gap: 16px; padding: 10px 4px; }
.att-class .ic { flex: none; display: grid; }
.att-class .ic.good { color: var(--good); }
.att-class .ic.bad { color: var(--error); }
.att-class .d { font-size: 16px; line-height: 24px; }
.att-class .s { font-size: 12px; line-height: 16px; color: var(--on-surface-variant); }
.att-subj .credits { padding: 12px 4px; font-size: 14px; line-height: 20px; color: var(--on-surface-variant); }
`;

const COMPONENT = { L: 'Lecture', T: 'Tutorial', P: 'Practical' };
const GRADE_VAR = { 'A+': '--g-ap', A: '--g-a', 'B+': '--g-bp', B: '--g-b', 'C+': '--g-cp', C: '--g-c', D: '--g-d', F: '--g-f' };
const gradeColor = (g) => (GRADE_VAR[String(g || '').trim().toUpperCase()] ? `var(${GRADE_VAR[String(g).trim().toUpperCase()]})` : 'var(--on-surface-variant)');
const fmt = (d) => (Number(d) % 1 === 0 ? String(Math.trunc(Number(d))) : Number(d).toFixed(1));
const same = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();

function verdictPill(t, target) {
  const miss = canMiss(t, target);
  const need = mustAttend(t, target);
  const exact = t.attended * 100 === target * t.total;
  const [text, cls] =
    need === Infinity ? [`Can't reach ${target}% any more this semester`, 'bad']
      : need > 0 ? [`Attend the next ${need} ${need === 1 ? 'class' : 'classes'} to reach ${target}%`, 'bad']
        : miss > 0 ? [`You can miss ${miss} ${miss === 1 ? 'class' : 'classes'} and stay above ${target}%`, 'good']
          // no absence to spare yet not under: 18/27 is 66.7, 18/28 is 64.3
          : [`${exact ? 'Exactly on' : 'Just above'} ${target}%, the next absence drops you under`, 'warn'];
  return h('div', { class: ['att-verdict', cls] }, text);
}

function classRow(c) {
  const time = [timeLabel(c.start), timeLabel(c.end)].filter(Boolean).join(' – ');
  const sub = [time, c.classType && c.classType !== 'Regular' ? c.classType : null, nameCase(c.takenBy) || null].filter(Boolean).join(' · ');
  return h('div', { class: 'att-class' },
    h('span', { class: ['ic', c.present ? 'good' : 'bad'], 'aria-label': c.present ? 'Present' : 'Absent' }, icon(c.present ? 'check_circle' : 'cancel', 22)),
    h('div', { class: 'grow' },
      h('div', { class: 'd' }, c.date ? dayLabel(c.date) : c.datetime),
      sub ? h('div', { class: 's' }, sub) : null));
}

export function subject(ctx) {
  const { semCode = '', subjectCode: code = '' } = ctx.params || {};
  const root = h('div', { class: 'att-subj' });
  const body = h('div');
  root.append(h('style', null, CSS), body);

  const st = {
    meta: null, metaErr: null, metaDone: false,
    detail: null, detailErr: null, detailDone: false,
    daily: null, dailyErr: null, dailyDone: false,
    faculty: [], facultyDone: false,
    grade: null, gradeDone: false,
  };
  let askedDaily = false;
  const draw = scheduler(paint);
  const keep = {}; // reused nodes so a refresh doesn't replay the ring or reset the calendar

  const attSem = () => semesters(st.meta).find((s) => s.registrationcode === semCode) || null;
  const row = () => (st.detail?.studentattendancelist || []).find((r) => same(subjectCode(r), code)) || null;

  function loadAttendance() {
    st.metaErr = st.detailErr = st.dailyErr = null;
    cached(META_KEY, api.attendanceMeta, (d) => { st.meta = d; loadDetail(); draw(); })
      .catch((e) => { st.metaErr = e; draw(); })
      .finally(() => { st.metaDone = true; if (!attSem()) { st.detailDone = st.dailyDone = true; } draw(); });
  }

  let askedDetail = false;
  function loadDetail() {
    const sem = attSem();
    if (!sem || askedDetail) return;
    askedDetail = true;
    cached(detailKey(semCode), () => api.attendance(sem, semNumber(st.meta)), (d) => { st.detail = d; loadDaily(); draw(); })
      .catch((e) => { st.detailErr = e; })
      .finally(() => { st.detailDone = true; if (!row()) st.dailyDone = true; draw(); });
  }

  function loadDaily() {
    const sem = attSem(), r = row();
    if (!sem || !r || askedDaily) return;
    askedDaily = true;
    cached(dailyKey(semCode, r), () => api.dailyAttendance(sem, dailySubject(r), componentIds(r)), (d) => { st.daily = d; draw(); })
      .catch((e) => { st.dailyErr = e; })
      .finally(() => { st.dailyDone = true; draw(); });
  }

  // teachers and credits live under the subject registrations
  async function loadFaculty() {
    try {
      if (!session()?.memberId) return;
      const sems = await load('att:subjsems', api.subjectSemesters, 12 * 3600e3);
      const s = (sems?.registrations || []).find((x) => x.registrationcode === semCode);
      if (!s) return;
      const res = await load(`att:faculty:${semCode}`, () => api.registeredSubjects(s), 6 * 3600e3);
      st.faculty = (res?.registrations || []).filter((f) => same(f.subjectcode, code));
    } catch {} finally { st.facultyDone = true; draw(); }
  }

  // and the grade, once the semester is done
  async function loadGrade() {
    try {
      const sems = await load('att:gcsems', api.gradeCardSemesters, 12 * 3600e3);
      const s = (sems?.registrations || []).find((x) => x.registrationcode === semCode);
      if (!s) return;
      const program = (await load('att:program', api.program, 24 * 3600e3))?.studentinfo;
      if (!program) return;
      const gc = await load(`att:gc:${semCode}`, () => api.gradeCard(s, program), 6 * 3600e3);
      st.grade = (gc?.gradecard || []).find((g) => same(g.subjectcode, code)) || null;
    } catch {} finally { st.gradeDone = true; draw(); }
  }

  const retry = () => { askedDetail = askedDaily = false; st.metaDone = st.detailDone = st.dailyDone = false; loadAttendance(); draw(); };

  function paint() {
    const target = Number(prefs.get('target')) || 75;
    const r = row();
    const f0 = st.faculty[0];
    const name = r ? subjectName(r) : f0?.subjectdesc || st.grade?.subjectdesc || null;
    const back = () => ctx.nav.back();
    const settled = st.metaDone && st.detailDone && st.facultyDone && st.gradeDone;
    if (!name) {
      const err = st.detailErr || st.metaErr;
      render(body, header({ title: '', back }),
        !settled ? spinner()
          : err && !err.stale ? errorState(err, retry)
            : emptyState('Nothing here', "This subject isn't in the portal's attendance, subjects or grades for that semester."));
      return;
    }

    const classes = st.daily ? classesOf(st.daily) : [];
    const t = tally(classes);
    const credits = f0?.credits ?? st.grade?.coursecreditpoint ?? null;
    const facultyBy = {};
    for (const f of st.faculty) {
      const nm = String(f.employeename || '').trim().replace(/\s+/g, ' ');
      if (f.subjectcomponentcode) facultyBy[f.subjectcomponentcode] = nm;
    }
    const stale = [st.dailyErr, st.detailErr, st.metaErr].find((e) => e?.stale);
    const out = [header({ title: titleCase(name), subtitle: `${String(code).trim()} · ${semLabel(semCode)}`, back })];
    if (stale) out.push(staleBanner(stale));

    // hero
    if (r) {
      const percent = portalPercent(r) ?? 0;
      // same rule as the list card: nothing counted and nothing from the portal means it hasn't started
      const started = t.total > 0 || percent > 0;
      const sig = JSON.stringify([target, started, percent, t.total > 0 && t]);
      if (!keep.ring || keep.ringSig !== sig) {
        const mk = keep.ring ? stillRing : ring;
        keep.ring = mk({ percent: started ? percent : 0, target, size: 184, stroke: 16, shortfall: true },
          h('div', null,
            h('div', { class: ['att-num', 'big', !started && 'none'] }, started ? `${Math.round(percent)}%` : '–'),
            t.total > 0 ? h('div', { class: 'of' }, `${t.attended} of ${t.total}`) : null));
        keep.ringSig = sig;
      }
      const g = st.grade?.grade && String(st.grade.grade).trim();
      out.push(h('div', { class: 'hero' },
        keep.ring,
        t.total > 0 ? h('div', { class: 'after' }, verdictPill(t, target))
          : !started && st.dailyDone ? h('div', { class: 'after label muted' }, 'No classes marked yet') : null,
        g ? h('div', { class: 'grade', style: { color: gradeColor(g) } }, `Grade ${g}`) : null));
    } else {
      // no attendance kept for this semester any more, the grade is the headline
      const g = String(st.grade?.grade ?? '').trim();
      const bits = [credits != null && Number(credits) > 0 ? `${fmt(credits)} credits` : null,
        Number(st.grade?.gradepoint) > 0 ? `${fmt(st.grade.gradepoint)} grade points` : null].filter(Boolean);
      out.push(h('div', { class: 'hero' },
        h('div', { class: 'gradeletter', style: { color: gradeColor(g) }, 'aria-label': `Grade ${g || 'not out'}` }, g || '–'),
        h('div', { class: 'gradesub' }, bits.join(' · ') || 'Grade not out yet')));
    }

    // components, or just the teachers when there's no attendance
    if (r) {
      const rows = componentTags(r);
      if (rows.length) {
        out.push(section('Components'), h('div', { class: 'att-comp' }, rows.map(([k, pct]) =>
          h('div', { class: 'row' },
            h('div', { class: 'k' }, k),
            h('div', { class: 'grow' },
              h('div', { class: 'n' }, COMPONENT[k]),
              facultyBy[k] ? h('div', { class: 't' }, nameCase(facultyBy[k])) : null),
            pct != null ? h('div', { class: 'p' }, `${Math.round(pct)}%`) : null))),
        note("Component percentages are the portal's own, updated once a day."));
      }
    } else if (st.faculty.length) {
      const seen = new Set();
      const teachers = st.faculty.filter((f) => String(f.employeename || '').trim() && !seen.has(f.subjectcomponentcode) && seen.add(f.subjectcomponentcode));
      if (teachers.length) {
        out.push(section('Taught by'), h('div', { class: 'group' }, teachers.map((f) =>
          h('div', { class: 'kv' }, h('span', { class: 'k' }, COMPONENT[f.subjectcomponentcode] || f.subjectcomponentcode), h('span', { class: 'v' }, nameCase(f.employeename))))));
      }
    }

    // calendar and the picked day's classes
    const marks = calendar(classes);
    if (marks.size) {
      const sig = JSON.stringify([...marks]);
      if (!keep.cal || keep.calSig !== sig) {
        const today = isoDay(now());
        keep.day = h('div', { class: 'att-day' });
        const dayPanel = keep.day;
        keep.cal = monthCalendar(marks, today, (iso) => {
          if (!iso) { render(dayPanel); return; }
          const list = classesOf(st.daily).filter((c) => c.date === iso);
          render(dayPanel, list.length ? list.map(classRow)
            : h('div', { class: 'empty' }, iso > isoDay(now()) ? `Nothing marked yet for ${dayLabel(iso)}` : `No class on ${dayLabel(iso)}`));
        });
        keep.calSig = sig;
      }
      out.push(section('Calendar'), keep.cal, keep.day);
    }

    const points = trend(classes).map(([, v]) => v);
    if (points.length >= 3) {
      const sig = JSON.stringify([points, target]);
      if (!keep.trend || keep.trendSig !== sig) { keep.trend = trendChart(points, target); keep.trendSig = sig; }
      out.push(section("How it's been going"), keep.trend);
    }

    if (r && st.faculty.length) {
      out.push(h('div', { class: 'credits' }, `${fmt(f0.credits ?? 0)} credits${f0.audtsubject === 'Y' ? ' · audit' : ''}`));
    }

    if (classes.length) {
      const newestFirst = chronological(classes).reverse().concat(classes.filter((c) => !c.date));
      out.push(section('Every class'), h('div', null, newestFirst.map(classRow)));
    } else if (r && !st.dailyDone) {
      out.push(h('div', { style: { display: 'grid', placeItems: 'center', padding: '32px 0' } }, h('div', { class: 'spinner' })));
    } else if (r && st.dailyErr && !st.dailyErr.stale) {
      out.push(errorState(st.dailyErr, retry));
    }

    render(body, ...out);
  }

  const off = prefs.onChange((k) => { if (!root.isConnected) off(); else if (k === 'target') draw(); });
  paint();
  loadAttendance();
  loadFaculty();
  loadGrade();
  return root;
}

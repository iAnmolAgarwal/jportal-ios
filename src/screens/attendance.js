// the attendance tab, after jportal-android's feature/attendance/AttendanceScreen.kt.
// the percentage on every card is the portal's own; each subject's class list
// (fetched behind it) adds the counts, the recent dots and the verdict.
import { h, render } from '../ui/dom.js';
import { ring, header, updated, semChip, skeletons, emptyState, errorState, staleBanner } from '../ui/components.js';
import { api } from '../core/api.js';
import { cached, prefs } from '../core/store.js';
import {
  subjectCode, subjectName, componentIds, componentTags, portalPercent, classesOf, chronological,
  tally, tallyOf, percentOf, canMiss, mustAttend, drift, titleCase,
} from '../domain/attendance.js';
import { META_KEY, detailKey, dailyKey, dailySubject, semNumber, semesters, stillRing, placeholder, scheduler, SHARED_CSS } from './attendance/common.js';
import { openTargetSheet, TARGET_CSS } from './attendance/target.js';

const CSS = SHARED_CSS + TARGET_CSS + `
.att-list { display: flex; flex-direction: column; gap: 10px; }
.att-hero { display: flex; align-items: center; gap: 20px; padding: 20px; border-radius: var(--r-xl); background: var(--primary-container); color: var(--on-primary-container); margin-bottom: 6px; }
.att-hero .copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.att-hero .big { font-size: 36px; line-height: 38px; letter-spacing: -1.2px; }
.att-hero .unit { font-size: 11px; line-height: 16px; font-weight: 600; letter-spacing: .3px; }
.att-hero .two { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.att-target { position: relative; isolation: isolate; border-radius: var(--r-sm); padding: 6px 12px; font-size: 14px; line-height: 20px; font-weight: 600; color: var(--on-surface); }
.att-target::before { content: ''; position: absolute; inset: 0; border-radius: inherit; background: var(--surface); opacity: .55; z-index: -1; }
.att-target.ok { color: var(--good); }
.att-target:active::before { opacity: .8; }
.att-card { display: flex; align-items: center; gap: 16px; padding: 16px; transition: background-color .6s; }
.att-card .ring .pct { font-size: 16px; line-height: 20px; font-weight: 700; padding: 0 8px; }
.att-card .ring .pct.none { color: var(--on-surface-variant); }
.att-card .name { font-size: 16px; line-height: 24px; font-weight: 600; letter-spacing: .1px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.att-card .meta { display: flex; align-items: center; gap: 6px; margin-top: 4px; min-height: 18px; }
.att-tag { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 6px; border-radius: var(--r-xs); background: var(--secondary-container); color: var(--on-secondary-container); font-size: 11px; line-height: 16px; font-weight: 600; }
.att-card .count { font-size: 12px; line-height: 16px; font-weight: 600; color: var(--on-surface-variant); font-variant-numeric: tabular-nums; }
.att-card .dots { margin-left: 4px; flex: none; }
.att-card .verdict { margin-top: 4px; font-size: 14px; line-height: 20px; font-weight: 600; min-height: 20px; display: flex; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.att-card .verdict.good { color: var(--good); }
.att-card .verdict.bad { color: var(--error); }
.att-card .verdict.warn { color: var(--warn); }
.att-card .verdict.muted { color: var(--on-surface-variant); }
.att-card .ring.pulse { animation: att-pulse-ring 1.7s ease-in-out infinite; }
@keyframes att-pulse-ring { 50% { opacity: .45; } }
.att-hero .spin { width: 40px; height: 40px; border-width: 4px; }
`;

/**
 * one subject row: the portal's row plus its class list (if in), mirrors SubjectLine
 * daily = { data, err } where data is the raw daily answer
 */
function line(row, daily) {
  const classes = daily?.data ? classesOf(daily.data) : null;
  const t = classes ? tally(classes) : null;
  const counted = t && t.total > 0 ? t : null;
  const portal = portalPercent(row) ?? 0;
  return {
    row,
    code: subjectCode(row),
    classes,
    tally: counted,
    counting: !daily?.data && !daily?.err,
    started: counted != null || portal > 0,
    percent: portal,
    // the last few classes, oldest first, true for present
    recent: classes ? chronological(classes).slice(-7).map((c) => c.present) : [],
  };
}

/** one mark per recent class, newest on the right: dot for present, cross for absent */
function recentDots(recent) {
  if (!recent.length) return null;
  const hgt = 8, step = 11, w = 1.8, m = w / 2;
  const present = recent.filter(Boolean).length;
  return h('svg', {
    class: 'dots', width: recent.length * step - 3, height: hgt, viewBox: `0 0 ${recent.length * step - 3} ${hgt}`,
    role: 'img', 'aria-label': `last ${recent.length} classes: ${present} present, ${recent.length - present} absent`,
  }, recent.map((p, i) => {
    const x = i * step;
    return p
      ? h('circle', { cx: x + hgt / 2, cy: hgt / 2, r: (hgt / 2) * 0.85, fill: 'var(--good)' })
      : h('path', { d: `M${x + m} ${m}L${x + hgt - m} ${hgt - m}M${x + hgt - m} ${m}L${x + m} ${hgt - m}`, stroke: 'var(--error)', 'stroke-width': w, 'stroke-linecap': 'round', fill: 'none' });
  }));
}

function verdict(l, target) {
  if (l.counting) return h('div', { class: 'verdict' }, placeholder(84));
  const t = l.tally;
  if (t) {
    const miss = canMiss(t, target);
    const need = mustAttend(t, target);
    if (need === Infinity) return h('div', { class: 'verdict bad' }, `Can't reach ${target}%`);
    if (need > 0) return h('div', { class: 'verdict bad' }, `Attend the next ${need}`);
    if (miss > 0) return h('div', { class: 'verdict good' }, `Can miss ${miss}`);
    return h('div', { class: 'verdict warn' }, "Right on the edge, don't miss");
  }
  if (l.started) return h('div', { class: 'verdict muted' }, "Portal's %, class list didn't load");
  return h('div', { class: 'verdict muted' }, 'No classes marked yet');
}

function subjectCard(l, target, onClick, still) {
  const below = l.started && l.percent < target;
  const pct = Math.round(l.percent);
  const mk = still ? stillRing : ring;
  const r = mk({ percent: l.started ? l.percent : 0, target, size: 60, stroke: 6, shortfall: true },
    l.started || !l.counting
      ? h('div', { class: ['pct', !l.started && 'none'], 'aria-label': l.started ? `${pct} percent` : 'not started' }, l.started ? String(pct) : '–')
      : null);
  if (l.counting && !l.started) r.classList.add('pulse');
  return h('div', { class: ['card', 'tap', 'att-card', below && 'bad'], role: 'button', tabindex: '0', onclick: onClick },
    r,
    h('div', { class: 'grow' },
      h('div', { class: 'name' }, titleCase(subjectName(l.row))),
      h('div', { class: 'meta' },
        componentTags(l.row).map(([k]) => h('span', { class: 'att-tag', title: { L: 'Lecture', T: 'Tutorial', P: 'Practical' }[k] }, k)),
        l.counting ? placeholder(34) : l.tally ? [
          h('span', { class: 'count', 'aria-label': `${l.tally.attended} of ${l.tally.total} classes` }, `${l.tally.attended}/${l.tally.total}`),
          recentDots(l.recent),
        ] : null),
      verdict(l, target)));
}

function overview(lines, target, still) {
  const counted = lines.map((l) => l.tally).filter(Boolean);
  const total = tallyOf(counted.reduce((a, t) => a + t.attended, 0), counted.reduce((a, t) => a + t.total, 0));
  // one number, shown once every subject is in, so it never climbs while lists land
  const waiting = lines.filter((l) => l.counting).length;
  const uncounted = lines.filter((l) => l.started && !l.tally).length;
  const startedLines = lines.filter((l) => l.started);
  const percent = waiting > 0 ? 0
    : total.total > 0 ? percentOf(total)
      : startedLines.length ? startedLines.reduce((a, l) => a + l.percent, 0) / startedLines.length : 0;
  const low = lines.filter((l) => l.started && l.percent < target).length;

  const title = waiting > 0 ? 'Counting classes'
    : !startedLines.length ? 'No classes yet'
      : low === 0 ? 'All clear'
        : low === 1 ? '1 subject below target' : `${low} subjects below target`;
  const sub = waiting > 0 ? `${lines.length - waiting} of ${lines.length} subjects in`
    : total.total === 0 ? 'Nothing marked this semester'
      : uncounted > 0 ? `${total.attended} of ${total.total} classes, ${uncounted} not counted`
        : `${total.attended} of ${total.total} classes attended`;

  const mk = still ? stillRing : ring;
  return h('div', { class: 'att-hero' },
    mk({ percent, target, size: 116, stroke: 12 },
      waiting > 0
        ? h('div', { class: 'spinner spin' })
        : h('div', { style: { padding: '0 18px' } },
          h('div', { class: 'att-num big' }, String(Math.round(percent))),
          h('div', { class: 'unit' }, 'percent'))),
    h('div', { class: 'copy' },
      h('div', { class: 'title-lg two' }, title),
      h('div', { class: 'body-md two' }, sub),
      h('button', { class: ['att-target', low === 0 && 'ok'], onclick: () => openTargetSheet() }, `Target ${target}%`)));
}

export function attendance(ctx) {
  const root = h('div', { class: 'att' });
  const body = h('div');
  root.append(h('style', null, CSS), body);

  const st = {
    meta: null, metaAt: 0, metaErr: null,
    sem: null, detail: null, detailAt: 0, detailErr: null,
    daily: new Map(), // code -> { data, err }
    gen: 0,
  };
  // cards and the hero keep their nodes while nothing they show changes, so a refresh doesn't replay the rings
  const keep = new Map();
  const draw = scheduler(paint);

  function loadMeta() {
    st.metaErr = null;
    cached(META_KEY, api.attendanceMeta, (d, { at }) => { st.meta = d; st.metaAt = at; pickSemester(); draw(); })
      .catch((e) => { st.metaErr = e; draw(); });
  }

  function pickSemester(force = false) {
    const all = semesters(st.meta);
    const pinned = prefs.get('semester');
    const sem = all.find((s) => s.registrationcode === pinned) || all[0] || null;
    if (!sem) { st.sem = null; return; }
    if (!force && st.sem?.registrationcode === sem.registrationcode) return;
    st.sem = sem;
    loadDetail(sem);
  }

  function loadDetail(sem) {
    const gen = ++st.gen;
    const asked = new Set();
    st.detail = null; st.detailErr = null; st.detailAt = 0; st.daily = new Map();
    cached(detailKey(sem.registrationcode), () => api.attendance(sem, semNumber(st.meta)), (d, { at }) => {
      if (gen !== st.gen) return;
      st.detail = d; st.detailAt = at;
      // the class lists back the counts and the verdict, fetch them all behind the portal's percentages
      for (const row of d?.studentattendancelist || []) {
        const code = subjectCode(row);
        if (asked.has(code)) continue;
        asked.add(code);
        cached(dailyKey(sem.registrationcode, row), () => api.dailyAttendance(sem, dailySubject(row), componentIds(row)), (dd) => {
          if (gen !== st.gen) return;
          st.daily.set(code, { data: dd, err: null });
          const gap = drift(portalPercent(row), classesOf(dd));
          if (gap != null) console.debug('[jportal] attendance drift', code, gap.toFixed(1));
          draw();
        }).catch((e) => {
          if (gen !== st.gen) return;
          const cur = st.daily.get(code);
          st.daily.set(code, { data: cur?.data ?? null, err: e });
          draw();
        });
      }
      draw();
    }).catch((e) => { if (gen === st.gen) { st.detailErr = e; draw(); } });
  }

  const retry = () => { st.sem = null; if (st.meta) pickSemester(true); loadMeta(); draw(); };

  function paint() {
    const target = Number(prefs.get('target')) || 75;
    if (!st.meta) {
      render(body, st.metaErr ? errorState(st.metaErr, retry) : loading());
      return;
    }
    const all = semesters(st.meta);
    const current = all[0];
    const head = header({
      title: 'Attendance',
      subtitle: st.detailAt ? updated(st.detailAt) : null,
      right: st.sem ? semChip({
        sems: all, value: st.sem.registrationcode, filled: st.sem !== current,
        onChange: (s) => { prefs.set('semester', s === current ? null : s.registrationcode); pickSemester(); draw(); },
      }) : null,
    });
    const stale = st.metaErr?.stale ? st.metaErr : st.detailErr?.stale ? st.detailErr : null;

    if (!st.sem) { render(body, head, emptyState('No attendance for this semester yet')); return; }
    if (!st.detail) {
      render(body, head, st.detailErr ? errorState(st.detailErr, retry) : loading(true));
      return;
    }
    const rows = st.detail.studentattendancelist || [];
    if (!rows.length) { render(body, head, stale && staleBanner(stale), emptyState('No attendance for this semester yet')); return; }

    const lines = rows.map((r) => line(r, st.daily.get(subjectCode(r))));
    const semCode = st.sem.registrationcode;
    const reuse = (key, sig, make) => {
      const hit = keep.get(key);
      if (hit && hit.sig === sig) return hit.el;
      const el = make(!!hit);
      keep.set(key, { sig, el });
      return el;
    };
    const heroSig = JSON.stringify([target, lines.map((l) => [l.tally, l.counting, l.started, l.percent])]);
    render(body,
      head,
      stale ? staleBanner(stale) : null,
      h('div', { class: 'att-list' },
        reuse(`hero:${semCode}`, heroSig, (seen) => overview(lines, target, seen)),
        lines.map((l) => reuse(`card:${semCode}:${l.code}`,
          JSON.stringify([target, l.tally, l.counting, l.started, l.percent, l.recent, l.row.subjectcode, componentTags(l.row)]),
          (seen) => subjectCard(l, target, () => ctx.nav.push('subject', { semCode, subjectCode: l.code }), seen)))));
  }

  function loading(withHead) {
    return h('div', null,
      withHead ? null : header({ title: 'Attendance' }),
      h('div', { class: 'skeleton', style: { height: '156px', borderRadius: 'var(--r-xl)', marginBottom: '16px' } }),
      skeletons(5, 92));
  }

  prefs.onChange((k) => { if (k === 'target') draw(); });
  paint();
  loadMeta();
  return root;
}


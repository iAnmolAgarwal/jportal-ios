// the exams view: a semester's date sheet as a timeline (feature/academics/Exams.kt)
import { h, render, titleCase } from '../../ui/dom.js';
import { icon, section, semChip, updated, skeletons, errorState, staleBanner, emptyState, sheet } from '../../ui/components.js';
import { api } from '../../core/api.js';
import { now } from '../../core/store.js';
import * as X from '../../domain/exams.js';
import { resource, scheduler, semList } from './ui.js';

const PICK = 'jp:acad:examsem';

export function exams(ctx) {
  const root = h('div');
  const draw = scheduler(() => full());
  let showDone = false;
  let picked = null;
  try { picked = sessionStorage.getItem(PICK); } catch {}

  const sems = resource('acad:exsems', () => api.examSemesters(), draw);
  const events = new Map(); // sem code -> resource
  const sheets = new Map(); // event id -> resource
  let scrolled = null;

  const subject = (p) => titleCase(p.slot.subjectName);

  function current() {
    const list = semList(sems.data, 'semesterCodeinfo', 'semestercode');
    const sem = list.find((s) => s.registrationcode === picked) || list[0] || null;
    return { list, sem };
  }

  function full() {
    if (!root.isConnected && root.__drawn) return;
    root.__drawn = true;
    const { list, sem } = current();
    if (!sem) {
      if (!sems.data && !sems.error) return render(root, skeletons(3, 90));
      if (!sems.data) return render(root, errorState(sems.error, sems.reload));
      return render(root, emptyState('No exams on the calendar', 'Enjoy it while it lasts.'));
    }
    if (!events.has(sem.registrationcode)) events.set(sem.registrationcode, resource('acad:exev:' + sem.registrationcode, () => api.examEvents(sem), draw));
    const ev = events.get(sem.registrationcode);
    const evList = (ev.data?.eventcode?.examevent || []).filter((e) => e?.exameventid).map(X.event);

    const pick = h('div', { class: 'sem-row' },
      semChip({ sems: list, value: sem.registrationcode, filled: true, onChange: (s) => { picked = s.registrationcode; try { sessionStorage.setItem(PICK, picked); } catch {} scrolled = null; full(); } }),
      ev.at ? updated(ev.at) : null);

    if (!ev.data) {
      if (!ev.error) return render(root, pick, skeletons(3, 90));
      return render(root, pick, errorState(ev.error, ev.reload));
    }

    const t = now();
    const today = X.dayKey(new Date(t));
    const rs = evList.map((e) => {
      if (!sheets.has(e.id)) sheets.set(e.id, resource('acad:exsch:' + e.id, () => api.examSchedule(e.raw), draw));
      return [e, sheets.get(e.id)];
    });
    const papers = rs.flatMap(([e, r]) => (r.data?.subjectinfo || []).map((row) => X.paper(e, X.slot(row))));
    const loadingPapers = rs.some(([, r]) => !r.data && !r.error);
    const pending = rs.filter(([e, r]) => r.data && !(r.data.subjectinfo || []).length && e.from != null && X.dayKey(new Date(e.from)) >= today).map(([e]) => e);
    const plan = X.plan(papers, t);
    const stale = ev.error || rs.find(([, r]) => r.error && r.data)?.[1].error;

    const out = [pick, stale ? staleBanner(stale) : null];
    if (!papers.length) {
      const first = pending.slice().sort((a, b) => a.from - b.from)[0];
      if (loadingPapers) out.push(skeletons(3, 90));
      else if (first) out.push(emptyState("Date sheet's not out yet", `${X.short(first)} starts around ${X.shortDay(X.dayKey(new Date(first.from)))}. It shows up here once the portal has it.`));
      else {
        const failed = rs.find(([, r]) => r.error && !r.data);
        out.push(failed ? errorState(failed[1].error, failed[1].reload) : emptyState('No exams on the calendar', 'Enjoy it while it lasts.'));
      }
      return render(root, out);
    }

    let strip = null;
    if (!plan.next) out.push(emptyState("That's a wrap", 'Every paper on this sheet is done.'));
    else if (plan.run.length >= 2) out.push(strip = runStrip(plan, papers, (day) => openSheet(papers.filter((p) => p.day === day))));

    if (plan.days.length) {
      out.push(section('Date sheet'));
      for (const day of plan.days) {
        if (day.free > 0) out.push(h('div', { class: 'gap' }, h('hr'), h('span', { class: 'ic' }, icon('bed', 16), day.free === 1 ? '1 day free' : `${day.free} days free`), h('hr')));
        out.push(h('div', { class: 'dayh' },
          h('span', { class: 'grow' }, day.date ? X.longDay(day.date) : 'Date not out yet'),
          day.date ? h('span', { class: 'rel' }, X.relative(day.date, today)) : null));
        out.push(h('div', { class: 'xg' }, day.papers.map((p, i) => h('div', { class: 'xi' }, paperRow(p, plan, i > 0, i < day.papers.length - 1)))));
      }
    }
    if (pending.length) {
      out.push(h('div', { class: 'xg', style: { marginTop: '12px' } }, pending.map((e) => h('div', { class: 'xi' }, h('div', { class: 'pend' },
        h('span', { class: 'ic' }, icon('calendar_month', 24)),
        h('div', { class: 'grow' },
          h('div', { class: 'title' }, `${X.short(e)} date sheet`),
          h('div', { class: 'body-sm muted' }, 'Not out yet' + (e.from != null ? ` · starts around ${X.shortDay(X.dayKey(new Date(e.from)))}` : ''))))))));
    }
    if (plan.done.length) {
      const n = plan.done.length;
      out.push(h('button', { class: ['doneh', showDone && 'open'], 'aria-expanded': String(showDone), onclick: () => { showDone = !showDone; full(); } },
        h('span', { class: 'grow' }, `Done · ${n === 1 ? '1 paper' : `${n} papers`}`), icon('expand_more', 24)));
      if (showDone) out.push(h('div', { class: 'xg', style: { marginBottom: '16px' } }, plan.done.map((p, i) => h('div', { class: 'xi' }, paperRow(p, plan, i > 0, i < n - 1)))));
    }
    out.push(h('div', { style: { height: '16px' } }));
    render(root, out);

    // the strip opens a day before today, like the lazy row's first visible item
    if (strip) {
      const key = `${sem.registrationcode}|${plan.run.join(',')}`;
      if (scrolled !== key) {
        scrolled = key;
        requestAnimationFrame(() => {
          const cells = [...strip.children];
          const i = Math.max(0, cells.findIndex((c) => c.dataset.day >= today) - 1);
          if (cells[i]) strip.scrollLeft = cells[i].offsetLeft - cells[0].offsetLeft;
        });
      }
    }

    function paperRow(p, pl, up, down) {
      const st = pl.status(p);
      const done = st === 'done';
      const next = p.key === pl.next?.key;
      const s = p.slot;
      const clash = pl.clashes[p.key];
      const meta = [done && s.start != null ? X.time(s.start) : null, p.duration != null ? X.minutes(p.duration) : null].filter(Boolean).join(' · ');
      let tb;
      if (done) tb = [h('div', { class: 'c' }, p.day ? String(X.dayDate(p.day).getDate()) : '?'), h('div', { class: 'to' }, p.day ? X.monthShort(p.day) : '')];
      else if (s.start != null) {
        tb = [h('div', { class: 'c' }, X.clock(s.start), h('small', null, ' ' + X.meridiem(s.start)))];
        if (s.end != null) tb.push(h('div', { class: 'to' }, 'to ' + ((s.start < 720) === (s.end < 720) ? X.clock(s.end) : X.time(s.end))));
      } else if (s.from.trim()) tb = [h('div', { class: 'c', style: { fontSize: '14px', whiteSpace: 'normal' } }, s.from.trim())];
      else tb = [h('div', { class: 'c', style: { color: 'var(--on-surface-variant)' } }, 'TBA')];
      const rail = h('div', { class: 'rail' },
        up ? h('i', { class: 'ln', style: { top: '0', height: '26px' } }) : null,
        down ? h('i', { class: 'ln', style: { top: '26px', bottom: '0' } }) : null,
        next && down ? h('i', { class: 'acc', style: { top: '26px', bottom: '12px' } }) : null,
        h('i', { class: ['dot', next && 'big'] }));
      return h('div', { class: ['paper', next && 'next', done && 'done'], role: 'button', 'aria-label': speak(p, pl), onclick: () => openSheet([p]) },
        h('div', { class: 'tb' }, tb),
        rail,
        h('div', { class: 'txt' },
          h('div', { class: 's' }, subject(p)),
          meta ? h('div', { class: 'm' }, meta) : null,
          clash && !done ? h('div', { class: 'clash' }, icon('warning', 14), `Clashes with ${subject(clash)}`) : null),
        done ? null : seat(s));
    }

    function speak(p, pl) {
      const s = p.slot;
      return [
        subject(p), X.short(p.event), p.day ? X.longDay(p.day) : null, X.window(p)?.replace(' – ', ' to '),
        s.seated ? [s.room && `room ${s.room}`, s.seat && `seat ${s.seat}`].filter(Boolean).join(', ') : pl.status(p) !== 'done' ? 'room and seat not out yet' : null,
        pl.clashes[p.key] ? `clashes with ${subject(pl.clashes[p.key])}` : null,
        p.key === pl.next?.key ? 'next up' : null,
      ].filter(Boolean).join(', ');
    }

    function openSheet(list) {
      list = list.slice().sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
      if (!list.length) return;
      let close = () => {};
      const parts = [];
      list.forEach((p, i) => { if (i) parts.push(h('hr')); parts.push(...detail(p, () => close())); });
      close = sheet(h('div', { class: 'acad-sheet' }, parts));
    }

    function detail(p, close) {
      const s = p.slot;
      const st = plan.status(p);
      const where = [s.room, s.seat && `seat ${s.seat}`].filter(Boolean).join(', ');
      const fact = (ic, text, sub, err) => h('div', { class: ['fact', err && 'err'] }, icon(ic, 20),
        h('div', null, h('div', { class: 'body' }, text), sub ? h('div', { class: 'body-sm muted' }, sub) : null));
      const clash = plan.clashes[p.key];
      const out = [
        h('div', { class: 'lab' }, [X.short(p.event), X.outOf(p.event) ? `out of ${X.outOf(p.event)}` : null, st === 'done' ? 'done' : null].filter(Boolean).join(' · ')),
        h('div', { class: 'headline-sm', style: { marginTop: '4px' } }, subject(p)),
        s.code ? h('div', { class: 'body-sm muted' }, s.code) : null,
        h('div', { class: 'facts' },
          fact('calendar_month', p.day ? X.longDay(p.day) : 'Date not out yet', p.day ? X.relative(p.day, plan.today) : null),
          fact('schedule', X.window(p) || 'Time not out yet', p.duration != null ? X.spokenLength(p.duration) : null),
          s.seated ? [
            fact('meeting_room', s.room ? `Room ${s.room}` : 'Room not out yet'),
            fact('event_seat', s.seat ? `Seat ${s.seat}` : 'Seat not out yet'),
          ] : st !== 'done' ? fact('event_seat', 'Room and seat not out yet', 'They usually come out a day before. Check back as the day gets close.') : null,
          clash && st !== 'done' ? fact('warning', `Clashes with ${subject(clash)}`, X.window(clash), true) : null),
        h('div', { class: 'acts' },
          st === 'upcoming' && p.day ? h('button', { class: 'btn', onclick: () => addToCalendar(p, where) }, icon('edit_calendar', 18), 'Add to calendar') : null,
          h('button', { class: 'btn outline', onclick: () => { close(); ctx.nav.push('subject', { semCode: sem.registrationcode, subjectCode: s.code }); } }, 'Subject')),
      ];
      return out;
    }

    function addToCalendar(p, where) {
      const text = X.ics(p, `${X.short(p.event)}: ${subject(p)}`, where);
      if (!text) return;
      const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
      const a = h('a', { href: url, download: `${p.slot.code || 'exam'}.ics` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
  }

  // every countdown on screen follows the minute
  const tick = setInterval(() => { if (root.isConnected) full(); else clearInterval(tick); }, 60000);
  full();
  return root;
}

/** room and seat, or a dashed "seat soon" until the portal puts them out */
function seat(s) {
  if (s.seated) {
    return h('div', { class: 'seat' },
      h('div', { class: 'r' }, s.room || 'Room ?'),
      s.seat ? h('div', { class: 'st' }, `seat ${s.seat}`) : null);
  }
  return h('div', { class: 'seat soon' }, icon('event_seat', 16), h('div', { class: 'st' }, 'seat soon'));
}

/** every day from the first paper to the last, free days left visible */
function runStrip(plan, papers, onDay) {
  const first = plan.run[0], last = plan.run.at(-1);
  // a week out, today joins the strip so the prep days before the first paper show too
  const from = plan.today < first && X.daysBetween(plan.today, first) <= 7 ? plan.today : first;
  const span = [];
  for (let d = from; d <= last; d = X.addDays(d, 1)) span.push(d);
  const running = new Set(plan.days.flatMap((d) => d.papers.map((p) => p.event.id)));
  const byDay = new Map();
  for (const p of papers) if (running.has(p.event.id) && p.day) { if (!byDay.has(p.day)) byDay.set(p.day, []); byDay.get(p.day).push(p); }
  const nextDay = plan.next?.day;
  return h('div', { class: 'strip' }, span.map((d) => {
    const ps = byDay.get(d) || [];
    const exam = ps.length > 0;
    const done = exam && ps.every((p) => plan.status(p) === 'done');
    const next = d === nextDay;
    const today = d === plan.today;
    const said = [X.longDay(d), today ? 'today' : null, !exam ? 'free day' : done ? 'done' : ps.length === 1 ? '1 exam' : `${ps.length} exams`].filter(Boolean).join(', ');
    return h(exam ? 'button' : 'div', {
      class: ['dc', exam && 'exam', done && 'done', next && 'next', today && 'today', !(exam && !done) && 'dim'],
      'data-day': d, 'aria-label': said, onclick: exam ? () => onDay(d) : null,
    }, h('div', { class: 'in' },
      h('div', { class: 'wd' }, X.narrowWeekday(d)),
      h('div', { class: 'dn' }, String(X.dayDate(d).getDate())),
      h('div', { class: 'dots' }, ps.slice(0, 3).map(() => h('i')))));
  }));
}

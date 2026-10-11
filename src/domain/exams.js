// the date sheet, ported from jportal-android's domain/ExamPlan.kt and ktjiit's ExamSlot.
// days are local 'YYYY-MM-DD' strings, clock times are minutes after midnight, "now" is ms.

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dayDate = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (key, n) => { const d = dayDate(key); d.setDate(d.getDate() + n); return dayKey(d); };
/** whole days from a to b */
export const daysBetween = (a, b) => Math.round((dayDate(b) - dayDate(a)) / 86400000);

// 03:30 pm, 3:30PM, 09:00:AM, 14:00, 14:00:00
const CLOCK = /(\d{1,2})[:.](\d{2})(?::\d{2})?(?:\s*:?\s*([ap])\.?m\b\.?)?/gi;

/** every clock time in a portal string, in order, as minutes */
export function parseClocks(s) {
  const out = [];
  for (const m of String(s || '').matchAll(CLOCK)) {
    const h = Number(m[1]), min = Number(m[2]);
    const ap = (m[3] || '').toLowerCase();
    const hour = ap === '' ? h : ap === 'a' ? (h === 12 ? 0 : h) : (h === 12 ? 12 : h + 12);
    const twelve = ap === '' || (h >= 1 && h <= 12);
    if (twelve && hour >= 0 && hour <= 23 && min >= 0 && min <= 59) out.push(hour * 60 + min);
  }
  return out;
}

/** an ExamSlot from the portal's subjectinfo row */
export function slot(r) {
  const date = String(r.datetime || '').trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date);
  const day = m ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : null;
  const from = String(r.datetimefrom || ''), until = String(r.datetimeupto || '');
  const start = parseClocks(from)[0] ?? parseClocks(until)[0] ?? null;
  const last = parseClocks(until).at(-1);
  const end = last != null && (start == null || last > start) ? last : null;
  const room = String(r.roomcode || '').trim(), seat = String(r.seatno || '').trim();
  const subject = String(r.subjectdesc || '');
  return {
    date, day, from, until, start, end, room, seat,
    code: String(r.subjectcode || '').trim(),
    subjectName: subject.split('(')[0].trim(),
    seated: !!(room || seat),
  };
}

/** an ExamEvent */
export function event(r) {
  return {
    id: r.exameventid,
    code: String(r.exameventcode || ''),
    description: String(r.exameventdesc || ''),
    from: r.eventfrom != null ? Number(r.eventfrom) : null,
    registrationid: r.registrationid,
    raw: r,
  };
}

/** TEST-2-26ODD-20MARKS -> T2 */
export function short(ev) {
  const c = (ev.code || ev.description).toUpperCase();
  const t = /\b(?:TEST|T)[-\s]?(\d+)/.exec(c);
  if (t) return `T${t[1]}`;
  if (c.includes('END')) return 'End sem';
  if (c.includes('MID')) return 'Mid sem';
  return ev.code || ev.description;
}

/** the paper's weight when the event code carries it */
export const outOf = (ev) => { const m = /(\d+)\s*-?\s*MARKS/.exec(ev.code.toUpperCase()); return m ? Number(m[1]) : null; };

const at = (day, mins) => { const d = dayDate(day); d.setMinutes(mins); return d.getTime(); };

export function paper(ev, s) {
  const start = s.day && s.start != null ? at(s.day, s.start) : null;
  const end = s.day && s.end != null ? at(s.day, s.end) : null;
  return {
    event: ev, slot: s,
    key: `${ev.id}|${s.code}|${s.date}`,
    day: s.day, start, end,
    duration: start != null && end != null ? (end - start) / 60000 : null,
    // when it's surely over. no end time, three hours covers the longest sitting
    over: end ?? (start != null ? start + 3 * 3600000 : s.day ? at(addDays(s.day, 1), 0) : null),
  };
}

export function status(p, now) {
  if (p.over == null) return 'upcoming';
  if (now >= p.over) return 'done';
  if (p.start != null && now >= p.start) return 'live';
  return 'upcoming';
}

const sortKey = (p) => p.start ?? (p.day ? at(p.day, 0) : Infinity);

/** both windows known: they overlap. otherwise only the same start counts */
function overlaps(a, b) {
  if (a.start == null || b.start == null) return false;
  if (a.end != null && b.end != null) return a.start < b.end && b.start < a.end;
  return a.start === b.start;
}

/** the flat paper list turned into what the exams view draws */
export function plan(papers, now) {
  const done = papers.filter((p) => status(p, now) === 'done');
  const upcoming = papers.filter((p) => status(p, now) !== 'done').sort((a, b) => sortKey(a) - sortKey(b));
  const next = upcoming[0] || null;
  const groups = new Map();
  for (const p of upcoming) {
    const k = p.day ?? '';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  let prev = null;
  const days = [...groups].map(([date, list]) => {
    const d = date || null;
    const free = prev && d ? Math.max(0, daysBetween(prev, d) - 1) : 0;
    if (d) prev = d;
    return { date: d, papers: list, free };
  });
  const clashes = {};
  const byDay = new Map();
  for (const p of papers) if (p.day) { if (!byDay.has(p.day)) byDay.set(p.day, []); byDay.get(p.day).push(p); }
  for (const list of byDay.values()) for (const a of list) for (const b of list) if (a !== b && overlaps(a, b) && !clashes[a.key]) clashes[a.key] = b;
  const running = new Set(upcoming.map((p) => p.event.id));
  const run = [...new Set(papers.filter((p) => running.has(p.event.id) && p.day).map((p) => p.day))].sort();
  return {
    now, today: dayKey(new Date(now)), next, days,
    done: done.sort((a, b) => sortKey(b) - sortKey(a)),
    clashes, run,
    status: (p) => status(p, now),
  };
}

/** 90 -> "1h 30m" */
export function minutes(m) {
  if (m < 60) return `${m}m`;
  if (m % 60 === 0) return `${m / 60}h`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function spokenLength(m) {
  if (m < 60) return `${m} minutes`;
  if (m === 60) return '1 hour';
  if (m % 60 === 0) return `${m / 60} hours`;
  return `${minutes(m)} long`;
}

/** minutes -> "9:30" / "9:30 AM" */
export const clock = (mins) => `${((Math.floor(mins / 60) + 11) % 12) + 1}:${pad(mins % 60)}`;
export const meridiem = (mins) => (mins < 720 ? 'AM' : 'PM');
export const time = (mins) => `${clock(mins)} ${meridiem(mins)}`;

/** 3:30 – 4:30 PM, or 11:30 AM – 1:00 PM across noon */
export function window(p) {
  const s = p.slot;
  if (s.start == null) return (s.until || s.from).trim() || null;
  if (s.end == null) return time(s.start);
  const start = (s.start < 720) === (s.end < 720) ? clock(s.start) : time(s.start);
  return `${start} – ${time(s.end)}`;
}

export function relative(day, today) {
  const d = daysBetween(today, day);
  if (d === -1) return 'Yesterday';
  if (d < 0) return `${-d} days ago`;
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  return `in ${d} days`;
}

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MO = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "Saturday, 26 September" */
export const longDay = (key) => { const d = dayDate(key); return `${WD[d.getDay()]}, ${d.getDate()} ${MO[d.getMonth()]}`; };
/** "Sat 26 Sep" */
export const shortDay = (key) => { const d = dayDate(key); return `${WD[d.getDay()].slice(0, 3)} ${d.getDate()} ${MO[d.getMonth()].slice(0, 3)}`; };
export const narrowWeekday = (key) => WD[dayDate(key).getDay()][0];
export const monthShort = (key) => MO[dayDate(key).getMonth()].slice(0, 3).toUpperCase();

/** an .ics for one paper: 8 pm the evening before, to revise, and an hour before, to leave */
export function ics(p, title, where) {
  const begin = p.start ?? (p.day ? at(p.day, 0) : null);
  if (begin == null) return null;
  const z = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const allDay = p.start == null;
  const d8 = (key) => key.replace(/-/g, '');
  const escp = (s) => String(s).replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const eve = at(addDays(p.day, -1), 20 * 60);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//JPortal//iOS//EN', 'BEGIN:VEVENT',
    `UID:${p.key.replace(/[^\w|-]/g, '')}@jportal`,
    `DTSTAMP:${z(Date.now())}`,
    allDay ? `DTSTART;VALUE=DATE:${d8(p.day)}` : `DTSTART:${z(begin)}`,
    allDay ? `DTEND;VALUE=DATE:${d8(addDays(p.day, 1))}` : `DTEND:${z(p.over ?? begin + 3 * 3600000)}`,
    `SUMMARY:${escp(title)}`,
    where ? `LOCATION:${escp(where)}` : null,
    `DESCRIPTION:${escp(p.slot.code + (where ? '' : '. Room and seat come out about a day before.'))}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escp(title)}`, `TRIGGER:-PT${Math.round((begin - eve) / 60000)}M`, 'END:VALARM',
    allDay ? null : ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escp(title)}`, 'TRIGGER:-PT60M', 'END:VALARM'],
    'END:VEVENT', 'END:VCALENDAR',
  ].flat().filter(Boolean);
  return lines.join('\r\n');
}

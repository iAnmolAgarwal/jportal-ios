// attendance maths and portal row helpers, ported from jportal-android's
// domain/AttendanceMath.kt and ktjiit's model/Attendance.kt.
//
// a class record here is the portal's studentAttdsummarylist row, parsed once
// by parseClass(): { date: 'YYYY-MM-DD'|null, start, end (minutes or null),
// present, extra, takenBy, classType, datetime }

// ---------------------------------------------------------------- subject rows (studentattendancelist)

/** the subject code, the portal pads some with a tab */
export const subjectCode = (row) => String(row?.individualsubjectcode ?? '').trim();

/** "NAME(CODE)" -> "NAME" */
export function subjectName(row) {
  const title = String(row?.subjectcode ?? '');
  const raw = String(row?.individualsubjectcode ?? '');
  for (const c of [raw, raw.trim()]) {
    const suffix = `(${c})`;
    if (c && title.endsWith(suffix)) return title.slice(0, -suffix.length).trim() || title;
  }
  return title.replace(/\([^()]*\)\s*$/, '').trim() || title;
}

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const has = (v) => v != null;

/** component ids the daily call wants: L, T, P that the subject has */
export const componentIds = (row) =>
  [row?.Lsubjectcomponentid, row?.Tsubjectcomponentid, row?.Psubjectcomponentid].filter((c) => c != null && c !== '');

/** [['L', percent], ...] for the components the subject has */
export function componentTags(row) {
  return [
    has(row?.Lsubjectcomponentid) ? ['L', num(row.Lpercentage)] : null,
    has(row?.Tsubjectcomponentid) ? ['T', num(row.Tpercentage)] : null,
    has(row?.Psubjectcomponentid) ? ['P', num(row.Ppercentage)] : null,
  ].filter(Boolean);
}

/** the portal's headline number: LT if it has lectures or tutorials, else P */
export function portalPercent(row) {
  if (has(row?.Lsubjectcomponentid) || has(row?.Tsubjectcomponentid)) return num(row.LTpercantage) ?? num(row.Lpercentage);
  return num(row?.Ppercentage);
}

// ---------------------------------------------------------------- class records

const SHAPE = /(\d{2})\/(\d{2})\/(\d{4})\s*\((\d{1,2}):(\d{2}):?\s*([AP]M)\s*-\s*(\d{1,2}):(\d{2}):?\s*([AP]M)\)/i;
const DATE_ONLY = /^(\d{2})\/(\d{2})\/(\d{4})/;

function validDate(d, m, y) {
  const dt = new Date(Date.UTC(+y, +m - 1, +d));
  return dt.getUTCFullYear() === +y && dt.getUTCMonth() === +m - 1 && dt.getUTCDate() === +d ? `${y}-${m}-${d}` : null;
}
function minutes(h, m, ap) {
  let hh = +h;
  if (hh < 1 || hh > 12 || +m > 59) return null;
  if (ap.toUpperCase() === 'AM') hh %= 12; else hh = (hh % 12) + 12;
  return hh * 60 + +m;
}

/** "18/09/2026 (10:00:AM - 10:50 AM)", yes with that colon */
export function parseClass(c) {
  const datetime = String(c?.datetime ?? '');
  let date = null, start = null, end = null;
  const m = SHAPE.exec(datetime);
  if (m) {
    date = validDate(m[1], m[2], m[3]);
    if (date) { start = minutes(m[4], m[5], m[6]); end = minutes(m[7], m[8], m[9]); }
  } else {
    const d = DATE_ONLY.exec(datetime.slice(0, 10));
    if (d) date = validDate(d[1], d[2], d[3]);
  }
  return {
    datetime,
    date,
    start,
    end,
    present: String(c?.present ?? '').toLowerCase() === 'present',
    // the portal leaves these out of the class count, so only a present one moves the percentage
    extra: String(c?.classtype ?? '').toLowerCase() === 'extra',
    takenBy: String(c?.attendanceby ?? ''),
    classType: String(c?.classtype ?? ''),
    status: String(c?.attendancestatus ?? ''),
  };
}

/** the daily call's answer -> parsed class records */
export const classesOf = (daily) => (daily?.studentAttdsummarylist || []).map(parseClass);

/** oldest first, by date then start time; records without a date are dropped */
export function chronological(classes) {
  return classes.filter((c) => c.date).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : (a.start ?? -1) - (b.start ?? -1));
}

// ---------------------------------------------------------------- tally

/** attended / total with the target-driven verdicts */
export const tallyOf = (attended, total) => ({ attended, total });

export const percentOf = (t) => (t.total === 0 ? 0 : (t.attended * 100) / t.total);

/** classes you can skip and still sit at or above target% */
export function canMiss(t, target) {
  if (target <= 0 || t.total === 0) return 0;
  return Math.max(0, Math.floor((100 * t.attended - target * t.total) / target));
}

/** classes in a row you need to climb back to target%. Infinity when it can't be reached */
export function mustAttend(t, target) {
  if (target >= 100) return t.attended < t.total ? Infinity : 0;
  return Math.max(0, Math.ceil((target * t.total - 100 * t.attended) / (100 - target)));
}

/** the portal's rule: every present class over the regular ones, an extra can only help */
export const tally = (classes) => tallyOf(classes.filter((c) => c.present).length, classes.filter((c) => !c.extra).length);

/** counted minus the portal's number, or null when they agree (the portal rounds to one decimal) */
export function drift(server, classes) {
  const t = tally(classes);
  if (server == null || t.total === 0) return null;
  const d = percentOf(t) - server;
  return Math.abs(d) > 0.1 ? d : null;
}

/** per day: 'present' | 'absent' | 'mixed' */
export function calendar(classes) {
  const days = new Map();
  for (const c of classes) {
    if (!c.date) continue;
    const d = days.get(c.date) || { n: 0, p: 0 };
    d.n++; if (c.present) d.p++;
    days.set(c.date, d);
  }
  const out = new Map();
  for (const [k, { n, p }] of days) out.set(k, p === n ? 'present' : p === 0 ? 'absent' : 'mixed');
  return out;
}

/** running percentage after each class, oldest first: [[date, pct], ...] */
export function trend(classes) {
  let present = 0, regular = 0;
  const out = [];
  for (const c of chronological(classes)) {
    if (c.present) present++;
    if (!c.extra) regular++;
    // an extra before any regular class has no bottom to divide by yet
    if (regular > 0) out.push([c.date, (present * 100) / regular]);
  }
  return out;
}

// ---------------------------------------------------------------- text

const ROMAN = /^(i{1,3}|iv|v|vi{0,3}|ix|x)(-\w+)?$/i;
// no vowel means an acronym (DSP, DBMS). ones with vowels have to be listed
const CONSONANTS = /^[B-DF-HJ-NP-TV-XZ]{3,}$/;
const ACRONYMS = new Set(['IOT']);
const SMALL = new Set(['And', 'Of', 'The', 'For', 'In', 'To', 'Using', 'A', 'An', 'Or', 'Nor', 'But', 'Yet', 'So']);
const titled = new Map();

/** "DATA STRUCTURES LAB" -> "Data Structures Lab", keeps roman numerals and acronyms (jportal's rules) */
export function titleCase(s) {
  s = String(s ?? '');
  if (titled.has(s)) return titled.get(s);
  const out = s.split(' ').map((w) => {
    const core = w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
    if (!w) return w;
    if (ROMAN.test(w)) return w.toUpperCase();
    if (/\p{Ll}/u.test(w)) return w;
    if (ACRONYMS.has(core) || CONSONANTS.test(core)) return w;
    const t = w.toLowerCase().replace(/^./, (c) => c.toUpperCase());
    return SMALL.has(t) ? t.toLowerCase() : t;
  }).join(' ').replace(/^./, (c) => c.toUpperCase());
  titled.set(s, out);
  return out;
}

/** "DR. A.K.  RAO" -> "Dr. A.K. Rao" */
export function nameCase(s) {
  s = String(s ?? '').trim();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (/\s/.test(c)) { if (!/\s/.test(s[i - 1])) out += ' '; } else out += i === 0 || !/\p{L}/u.test(s[i - 1]) ? c.toUpperCase() : c.toLowerCase();
  }
  return out;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const ymd = (iso) => iso.split('-').map(Number);
/** 'YYYY-MM-DD' -> "Fri, 18 Sep" */
export function dayLabel(iso) {
  const [y, m, d] = ymd(iso);
  return `${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d} ${MON[m - 1]}`;
}
/** minutes since midnight -> "10:00 AM" */
export function timeLabel(min) {
  if (min == null) return null;
  const h = Math.floor(min / 60), m = min % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
/** local date of a timestamp as 'YYYY-MM-DD' */
export function isoDay(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

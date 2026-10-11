// a port of ktjiit's marks/MarksParser.kt + MarksReport.kt.
//
// reads the "Subject Marks(Event Wise)" pdf. every cell is a drawn rectangle
// and every value is one text run inside it, so the table is rebuilt from
// geometry instead of from text order (which is what breaks pdftotext-style
// parsers on wrapped headers and 3 line subject names).
//
// report shape (MarksReport as plain objects):
// {
//   student: { name, enrollmentNo, program, branch, semester, registrationCode },
//   events: string[],            // in the order the pdf lists them, not chronological
//   subjects: [{ code, name, scores: [{ event, marks: Score|null, weighted: Score|null }] }],
//   generated: string,           // "Mon Apr 20 01:46:33 IST 2026" as printed, or ''
// }
// Score: { type: 'value', obtained, max } | { type: 'absent' } | { type: 'na' } | { type: 'other', raw }
//   marks = OM/FM, weighted = OW/WT (what actually counts toward the total)

import { PdfReader, MarksParseError } from './pdf.js';
import { scan } from './scanner.js';

export { MarksParseError };

const EPS = 1.0;
// java regex \s is ascii only
const S = '[ \\t\\n\\x0B\\f\\r]';
const CODE = new RegExp(`\\(${S}*([A-Za-z0-9./\\- ]+?)${S}*\\)${S}*$`);
const GENERATED = /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2} \d{2}:\d{2}:\d{2} \w+ \d{4}$/;
const SPACES = new RegExp(`${S}+`, 'g');
const FRACTION = new RegExp(`^(-?\\d+(?:\\.\\d+)?)${S}*/${S}*(\\d+(?:\\.\\d+)?)$`);

const isBlank = (s) => s.trim() === '';

/** "15/ 40" -> value, "-" -> na, "A"/"AB"/"ABS" -> absent, "" -> null */
export function parseScore(text) {
  const t = text.trim();
  if (!t) return null;
  if (t === '-') return { type: 'na' };
  const up = t.toUpperCase();
  if (up === 'A' || up === 'AB' || up === 'ABS') return { type: 'absent' };
  const m = FRACTION.exec(t);
  if (m) return { type: 'value', obtained: Number(m[1]), max: Number(m[2]) };
  return { type: 'other', raw: t };
}

const contains = (r, px, py, slack = 0.5) => px >= r.x - slack && px <= r.x + r.w + slack && py >= r.y - slack && py <= r.y + r.h + slack;
const right = (r) => r.x + r.w;
const top = (r) => r.y + r.h;

function joinLines(lines) {
  let out = '';
  for (const l of lines) {
    const t = l.trim();
    if (!t) continue;
    if (out && !out.endsWith('-')) out += ' ';
    out += t;
  }
  return out.replace(SPACES, ' ');
}

function cells(page) {
  const seen = new Set();
  const rects = [];
  for (const r of page.rects) {
    if (!(r.w > 2 && r.h > 2)) continue;
    const k = `${r.x},${r.y},${r.w},${r.h}`;
    if (seen.has(k)) continue;
    seen.add(k);
    rects.push(r);
  }
  const byRect = new Map();
  for (const run of page.runs) {
    if (isBlank(run.text)) continue;
    const px = run.x + 0.5;
    const py = run.y + 0.5;
    let home = null;
    for (const r of rects) if (contains(r, px, py) && (!home || r.w * r.h < home.w * home.h)) home = r;
    if (!home) continue;
    if (!byRect.has(home)) byRect.set(home, []);
    byRect.get(home).push(run);
  }
  return [...byRect].map(([rect, runs]) => {
    // top to bottom, then left to right, runs on one baseline glued
    const sorted = runs.slice().sort((a, b) => (Math.round(b.y * 2) - Math.round(a.y * 2)) || (a.x - b.x));
    const groups = new Map();
    for (const r of sorted) {
      const k = Math.round(r.y * 2);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    const lines = [...groups.values()]
      .map((line) => line.map((r) => r.text.trim()).join(' ').trim())
      .filter((l) => l);
    return { rect, lines, text: joinLines(lines) };
  });
}

function findLayout(cs) {
  const anchorCell = cs.find((c) => c.text.toLowerCase() === 'subject code');
  if (!anchorCell) return null;
  const anchor = anchorCell.rect;
  const headers = cs
    .filter((c) => Math.abs(c.rect.y - anchor.y) < EPS && Math.abs(c.rect.h - anchor.h) < EPS && c.rect.x > anchor.x + EPS)
    .sort((a, b) => a.rect.x - b.rect.x);
  if (!headers.length) return null;
  const subs = cs.filter((c) => Math.abs(top(c.rect) - anchor.y) < EPS && c.rect.x >= right(anchor) - EPS);
  const columns = [];
  for (const s of subs) {
    const cx = s.rect.x + s.rect.w / 2;
    const ev = headers.findIndex((hd) => cx >= hd.rect.x - EPS && cx <= right(hd.rect) + EPS);
    if (ev < 0) continue;
    const label = s.text.replaceAll(' ', '').toUpperCase();
    let weighted;
    if (label.startsWith('OW') || label.includes('WT')) weighted = true;
    else if (label.startsWith('OM') || label.includes('FM')) weighted = false;
    else continue;
    columns.push({ event: ev, weighted, left: s.rect.x, right: right(s.rect) });
  }
  // no sub header row at all: one value per event, treat it as raw marks
  if (!columns.length) headers.forEach((hd, i) => columns.push({ event: i, weighted: false, left: hd.rect.x, right: right(hd.rect) }));
  const dataTop = subs.length ? Math.min(...subs.map((s) => s.rect.y)) : anchor.y;
  return { anchor, events: headers.map((hd) => hd.text), columns, dataTop };
}

function rows(cs, layout, below) {
  const a = layout.anchor;
  const subjectCells = cs
    .filter((c) => Math.abs(c.rect.x - a.x) < EPS && Math.abs(c.rect.w - a.w) < EPS && top(c.rect) <= below + EPS)
    .sort((p, q) => q.rect.y - p.rect.y);
  const out = [];
  for (const sc of subjectCells) {
    const m = CODE.exec(sc.text);
    if (!m) continue;
    const code = m[1].replaceAll(' ', '');
    const name = sc.text.substring(0, m.index).trim() || code;
    const rowCells = cs.filter((c) => Math.abs(c.rect.y - sc.rect.y) < EPS && c.rect.x >= right(sc.rect) - EPS);
    const marks = new Map();
    const weighted = new Map();
    for (const c of rowCells) {
      const cx = c.rect.x + c.rect.w / 2;
      const col = layout.columns.find((k) => cx >= k.left - EPS && cx <= k.right + EPS);
      if (!col) continue;
      const score = parseScore(c.text);
      (col.weighted ? weighted : marks).set(col.event, score);
    }
    const scores = [];
    layout.events.forEach((ev, i) => {
      const om = marks.get(i) ?? null;
      const ow = weighted.get(i) ?? null;
      if (om || ow) scores.push({ event: ev, marks: om, weighted: ow });
    });
    out.push({ code, name, scores });
  }
  return out;
}

const FIELDS = [
  ['name', 'Name'], ['enrollmentNo', 'Enrollment No'], ['program', 'Program'],
  ['branch', 'Branch'], ['semester', 'Semester'], ['registrationCode', 'Registration Code'],
];

function mergeStudent(s, cs) {
  const field = (key) => {
    const p = (key + ':').toLowerCase();
    for (const c of cs) if (c.text.toLowerCase().startsWith(p)) return c.text.substring(key.length + 1).trim();
    return '';
  };
  const out = {};
  for (const [k, label] of FIELDS) out[k] = s[k] || field(label);
  return out;
}

const emptyStudent = () => Object.fromEntries(FIELDS.map(([k]) => [k, '']));

/** the marks pdf bytes -> report. throws MarksParseError when it isn't one */
export async function parseMarks(pdf) {
  const bytes = pdf instanceof Uint8Array ? pdf : new Uint8Array(pdf);
  let reader;
  try {
    reader = new PdfReader(bytes);
  } catch (e) {
    throw new MarksParseError('not a pdf', e);
  }
  const pages = [];
  for (const p of reader.pages()) pages.push(scan(await reader.contents(p)));
  if (!pages.length) throw new MarksParseError('no pages');

  let layout = null;
  const subjects = new Map();
  let student = emptyStudent();
  let generated = '';

  for (const page of pages) {
    const cs = cells(page);
    student = mergeStudent(student, cs);
    if (!generated) generated = page.runs.map((r) => r.text.trim()).find((t) => GENERATED.test(t)) || '';
    const found = findLayout(cs);
    const active = found || layout;
    if (!active) continue;
    layout = active;
    const below = found ? found.dataTop : Number.MAX_VALUE;
    for (const s of rows(cs, active, below)) {
      const a = subjects.get(s.code);
      // a subject split across pages keeps its first half
      if (!a) subjects.set(s.code, s);
      else subjects.set(s.code, { ...a, scores: [...a.scores, ...s.scores.filter((x) => !a.scores.some((y) => y.event === x.event))] });
    }
  }
  if (!layout) return { student, events: [], subjects: [], generated };
  return { student, events: layout.events, subjects: [...subjects.values()], generated };
}

// what the overview and the grade card both read: the current semester, every
// result, grade card semesters, the program and credits. like rememberAcademics.
import { api } from '../../core/api.js';
import { session } from '../../core/session.js';
import { peek } from '../../core/store.js';
import { results as parseResults, numberOf, term } from '../../domain/academics.js';
import { resource, semList } from './ui.js';

export function academicsData(onChange) {
  // results need the current semester number, from the attendance header or the grade card's stymax
  let res = null;
  let started = null;
  let ready = false;
  // cache hits answer synchronously, so every change is handled after setup
  const ping = () => queueMicrotask(() => { if (!ready) return; kick(); onChange(); });
  const meta = resource('acad:meta', () => api.attendanceMeta(), ping);
  const program = resource('acad:program', () => api.program(), ping);
  const credits = resource('acad:credits', () => api.credits(), ping);
  const gcSems = resource('acad:gcsems', () => api.gradeCardSemesters(), ping);
  const noMember = !session()?.memberId;
  const stynumber = () => meta.data?.headerlist?.[0]?.stynumber || (meta.done || meta.error ? program.data?.studentinfo?.stymax : null) || null;
  function kick() {
    if (noMember) return;
    const n = stynumber();
    if (!n || String(n) === started) return;
    started = String(n);
    res = resource('acad:results', () => api.semesterResults(n), ping);
  }
  ready = true;
  kick();
  const cachedResults = peek('acad:results');

  const d = {
    meta, program, credits, gcSems,
    noMember,
    get results() {
      if (res) return res;
      // no semester number to ask with: say why once both places we look have answered
      const stuck = (meta.done || meta.error) && (program.done || program.error) && !stynumber();
      const error = stuck ? (meta.error || program.error || new Error("Couldn't tell which semester you're in")) : null;
      if (error && cachedResults) error.stale = true;
      return { data: cachedResults, error, done: stuck, reload: () => { meta.reload(); program.reload(); } };
    },
    /** the current semester's code and number */
    get current() {
      const code = meta.data?.semlist?.[0]?.registrationcode || null;
      const number = Number(meta.data?.headerlist?.[0]?.stynumber || program.data?.studentinfo?.stymax) || null;
      return { code, number, sem: meta.data?.semlist?.[0] || null };
    },
    get list() { return parseResults(d.results.data); },
    /** one row per semester code we know, numbered and joined to its result */
    get semesters() {
      const { code: cur, number } = d.current;
      const byNumber = new Map(d.list.map((r) => [r.semester, r]));
      const codes = [...new Set([cur, ...semList(gcSems.data, 'registrations').map((s) => s.registrationcode)].filter(Boolean))];
      const rows = codes.map((code) => {
        const n = numberOf(code, cur, number);
        return { code, number: n, result: n ? byNumber.get(n) || null : null, current: code === cur };
      });
      // results we can't tie to a code still get a row
      const tied = new Set(rows.map((r) => r.number).filter(Boolean));
      for (const r of d.list) if (!tied.has(r.semester)) rows.push({ code: null, number: r.semester, result: r, current: false });
      return rows.sort((a, b) => (b.current - a.current) || ((b.number || 0) - (a.number || 0)) || ((term(b.code) || 0) - (term(a.code) || 0)));
    },
    reload() {
      meta.reload(); program.reload(); credits.reload(); gcSems.reload();
      if (res) res.reload();
    },
  };
  return d;
}

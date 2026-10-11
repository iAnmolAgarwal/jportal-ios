// gpa math and semester bookkeeping, ported from jportal-android's domain/Gpa.kt
// and feature/academics/AcademicsData.kt. no dom here.

/** jiit's 10 point scale */
export const GRADES = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'];
export const GRADE_POINTS = { 'A+': 10, A: 9, 'B+': 8, B: 7, 'C+': 6, C: 5, D: 4, F: 0 };

/** the css token for a grade letter's colour, onSurfaceVariant when ungraded */
export function gradeColor(letter) {
  const g = String(letter || '').trim().toUpperCase();
  const map = { 'A+': '--g-ap', A: '--g-a', 'B+': '--g-bp', B: '--g-b', 'C+': '--g-cp', C: '--g-c', D: '--g-d', F: '--g-f', I: '--g-f', X: '--g-f' };
  return map[g] ? `var(${map[g]})` : 'var(--on-surface-variant)';
}

/** 4 -> "4", 22.5 -> "22.5" (SubjectScreen.fmt) */
export const fmt = (d) => {
  const n = Number(d) || 0;
  return n % 1 === 0 ? String(n) : n.toFixed(1);
};
export const f1 = (n) => (Number(n) || 0).toFixed(1);
export const f2 = (n) => (Number(n) || 0).toFixed(2);

/** where a regular term sits in time: 2025EVESEM (january) comes right before 2025ODDSEM (july). summer terms get none */
export function term(code) {
  const m = /(\d{4})(ODD|EVE|EVEN)SEM/.exec(String(code || '').toUpperCase());
  if (!m) return null;
  return Number(m[1]) * 2 + (m[2] === 'ODD' ? 1 : 0);
}

/** semester number of a code, counted back from the current term (the grade card's own stynumber can't be trusted) */
export function numberOf(code, currentCode, currentNumber) {
  const t = term(code);
  const anchor = term(currentCode);
  const n = Number(currentNumber);
  if (t == null || anchor == null || !n) return null;
  const v = n - (anchor - t);
  return v > 0 ? v : null;
}

/** a SemesterResult from the portal's getallsemesterdata row */
export function result(r) {
  return {
    semester: Number(r.stynumber) || 0,
    sgpa: Number(r.sgpa) || 0,
    cgpa: Number(r.cgpa) || 0,
    courseCredits: Number(r.totalcoursecredit) || 0,
    gradePoints: Number(r.earnedgradepoints) || 0,
    earnedCredits: Number(r.totalearnedcredit) || 0,
    cumulativeCredits: Number(r.totalearnedcredits) || 0,
  };
}

export const results = (resp) => (resp?.semesterList || []).map(result).filter((r) => r.semester > 0).sort((a, b) => a.semester - b.semester);

const creditsOf = (r) => (r.courseCredits > 0 ? r.courseCredits : r.earnedCredits);

/** recomputes cgpa down the line; real untouched semesters keep the portal's own figure */
function recompute(points, keepReal) {
  let gp = 0, cr = 0, any = false;
  return points.map((p) => {
    gp += p.sgpa * p.credits;
    cr += p.credits;
    any = any || p.projected;
    return keepReal && !any ? p : { ...p, cgpa: cr > 0 ? gp / cr : 0 };
  });
}

/**
 * port of Gpa.points: the real semesters, then every projected future one.
 * projections: { [semester]: sgpa }
 */
export function gpaPoints(res, projections, projectedCredits, maxSemesters) {
  const real = [...res].sort((a, b) => a.semester - b.semester)
    .map((r) => ({ semester: r.semester, sgpa: r.sgpa, credits: creditsOf(r), cgpa: r.cgpa, projected: false }));
  const next = (real.length ? Math.max(...real.map((p) => p.semester)) : 0) + 1;
  const future = [];
  for (let s = next; s <= maxSemesters; s++) {
    if (projections[s] != null) future.push({ semester: s, sgpa: projections[s], credits: projectedCredits, cgpa: 0, projected: true });
  }
  return recompute(real.map((p) => (projections[p.semester] != null ? { ...p, sgpa: projections[p.semester], projected: true } : p)).concat(future), true);
}

/**
 * the sgpa calculator. subjects: [{ code, credits }], picks: { code: letter }.
 * base: the finished semesters' results, for the cgpa it would give.
 */
export function calculate(subjects, picks, base) {
  let pts = 0, cr = 0, picked = 0;
  for (const s of subjects) {
    const g = picks[s.code];
    if (g == null || GRADE_POINTS[g] == null || !(s.credits > 0)) continue;
    pts += GRADE_POINTS[g] * s.credits;
    cr += s.credits;
    picked++;
  }
  const sgpa = cr > 0 ? pts / cr : null;
  // what the portal divides by: course credits and the points it awarded, summed over finished semesters
  let bp = 0, bc = 0;
  for (const r of base) {
    const c = creditsOf(r);
    bp += r.gradePoints > 0 ? r.gradePoints : r.sgpa * c;
    bc += c;
  }
  const cgpa = cr > 0 ? (bp + pts) / (bc + cr) : null;
  return { sgpa, cgpa, credits: cr, picked, baseCgpa: bc > 0 ? bp / bc : null };
}

/** registered (subject, component) rows folded into subjects, as AcademicsData.fold */
export function foldSubjects(rows) {
  const by = new Map();
  for (const r of rows || []) {
    const code = String(r.subjectcode || '').trim();
    if (!code) continue;
    const cur = by.get(code);
    const credits = Number(r.credits) || 0;
    if (!cur) by.set(code, { code, name: String(r.subjectdesc || '').trim(), credits, audit: r.audtsubject === 'Y', components: [r.subjectcomponentcode] });
    else {
      cur.credits = Math.max(cur.credits, credits);
      cur.audit = cur.audit || r.audtsubject === 'Y';
      cur.components.push(r.subjectcomponentcode);
    }
  }
  return [...by.values()];
}

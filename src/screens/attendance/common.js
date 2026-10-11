// bits the attendance tab and the subject screen share
import { h } from '../../ui/dom.js';
import { ring } from '../../ui/components.js';
import { subjectCode } from '../../domain/attendance.js';

export const META_KEY = 'att:meta';
export const detailKey = (semCode) => `att:${semCode}`;
export const dailyKey = (semCode, row) => `att:daily:${semCode}:${subjectCode(row)}`;

/** the semester number the attendance detail call wants */
export const semNumber = (meta) => String(meta?.headerlist?.[0]?.stynumber ?? '');
export const semesters = (meta) => (meta?.semlist || []).filter((s) => s?.registrationcode);

/**
 * ring() without its first-fill animation, for rings that are redrawn in place
 * (the target slider, re-renders after a refresh). ring() times its fill from
 * performance.now() at creation, so it is created as if born a while ago.
 */
export const stillRing = (opts, ...center) => ring({ ...opts, fill: false }, ...center);

/** a pulsing grey bar standing in for text still on its way */
export const placeholder = (w, hgt = 12) => h('span', { class: 'att-ph', style: { width: w + 'px', height: hgt + 'px' } });

/** turns a burst of state changes into one render on the next microtask */
export function scheduler(fn) {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; fn(); });
  };
}

export const SHARED_CSS = `
.att-ph { display: inline-block; border-radius: 6px; background: var(--on-surface-variant); opacity: .18; animation: att-pulse 1.7s ease-in-out infinite; vertical-align: middle; }
@keyframes att-pulse { 50% { opacity: .08; } }
.att-num { font-weight: 700; font-variation-settings: 'ROND' 100; font-variant-numeric: tabular-nums; }
`;

/**
 * what api.dailyAttendance reads off a subject: its id and the bare subject code.
 * the raw row's `subjectcode` is "NAME(CODE)", ktjiit sends individualsubjectcode
 */
export const dailySubject = (row) => ({ subjectid: row.subjectid, subjectcode: row.individualsubjectcode });

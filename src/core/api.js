// the portal's api, ported from ktjiit's Transport + Portal. every call is
// same-origin because the userscript runs on the portal page itself.
// payload keys (typos included) and plain vs encrypted come from the portal
// bundle, don't "fix" them. every method resolves to the envelope's `response`.

import { encrypt, localName, dateSeq } from './crypto.js';
import { session } from './session.js';

export const BASE = 'https://webportal.jiit.ac.in:6011/StudentPortalAPI';

export class PortalError extends Error {
  /** kind: expired | forbidden | unavailable | empty | portal | malformed | network */
  constructor(kind, message, errors = []) {
    super(message || kind);
    this.kind = kind;
    this.errors = errors;
  }
  /** the portal's "NO ... FOUND" answers, an empty list rather than a failure */
  get isNoData() {
    return this.kind === 'portal' && this.errors.some((e) => /\bno\b.*\bfound\b|not found|no record/i.test(e));
  }
}

// the portal's clock drifts (~8.5 min slow) and both key and token expiry follow it
let skew = Number(localStorage.getItem('jp:skew') || 0);
const now = () => Date.now() + skew;
function observe(res) {
  const d = Date.parse(res.headers.get('Date') || '');
  if (!Number.isNaN(d)) {
    skew = d - Date.now();
    try { localStorage.setItem('jp:skew', String(skew)); } catch {}
  }
}

async function exchange(path, method, body) {
  const url = path.startsWith('https://') ? path : BASE + path;
  const s = session();
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
        Authorization: `Bearer ${s?.token || ''}`,
        LocalName: await localName(now()),
      },
      body,
    });
  } catch (e) {
    throw new PortalError('network', "Can't reach the portal");
  }
  observe(res);
  return res;
}

async function unwrap(res) {
  if (res.status === 401) throw new PortalError('expired', 'Session expired, sign in again');
  if (res.status === 403) throw new PortalError('forbidden', 'The portal refused that');
  const text = await res.text();
  if (!text.trim()) {
    if (res.status >= 500) throw new PortalError('unavailable', 'The portal is down right now');
    if (res.status >= 400) throw new PortalError('portal', `Portal error ${res.status}`);
    throw new PortalError('empty', 'The portal sent nothing back');
  }
  let root;
  try { root = JSON.parse(text); } catch {}
  if (!root || typeof root !== 'object') {
    if (res.status >= 500) throw new PortalError('unavailable', 'The portal is down right now');
    throw new PortalError('malformed', 'Unexpected answer from the portal');
  }
  const st = root.status;
  if (st?.responseStatus === 'Success' && res.status < 400) return root.response ?? null;
  if (res.status >= 500 && !st) throw new PortalError('unavailable', 'The portal is down right now');
  const errors = Array.isArray(st?.errors) ? st.errors.filter((e) => typeof e === 'string') : [];
  throw new PortalError('portal', errors[0] || 'The portal returned an error', errors);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const transient = (e) => ['unavailable', 'empty', 'network'].includes(e.kind);

/** posts and unwraps, retrying the gateway's odd dropped request. pass retry=false for writes */
export async function post(path, payload, { encrypted = false, retry = true } = {}) {
  const delays = retry ? [500, 1500] : [];
  for (let attempt = 0; ; attempt++) {
    try {
      const before = dateSeq(now());
      const send = async () => {
        const json = payload == null ? undefined : JSON.stringify(payload);
        const body = json && encrypted ? await encrypt(json, now()) : json;
        return unwrap(await exchange(path, 'POST', body));
      };
      try {
        return await send();
      } catch (e) {
        // around midnight our dateseq and the server's can disagree, the empty answer still corrected our clock
        if (e.kind === 'empty' && dateSeq(now()) !== before) return await send();
        throw e;
      }
    } catch (e) {
      if (!(e instanceof PortalError) || !transient(e) || attempt >= delays.length) throw e;
      await sleep(delays[attempt]);
    }
  }
}

export async function get(path) {
  return unwrap(await exchange(path, 'GET'));
}

/** raw bytes for pdf endpoints, errors still come back as json envelopes */
export async function bytes(path) {
  const res = await exchange(path, 'GET');
  const type = res.headers.get('Content-Type') || '';
  if (type.includes('json') || res.status >= 400) {
    await unwrap(res);
    throw new PortalError('malformed', 'Expected a file, got json');
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  if (!buf.length) throw new PortalError('empty', 'The portal sent nothing back');
  return buf;
}

/** list calls answer "NO ... FOUND" as an error, that's just empty */
async function orEmpty(empty, p) {
  try { return await p; } catch (e) {
    if (e instanceof PortalError && e.isNoData) return empty;
    throw e;
  }
}

const iid = () => session().instituteId;
const enc = { encrypted: true };

/**
 * every call the app makes. shapes are the portal's raw json; see
 * fixtures/*.json for real (scrubbed) examples of each `response`.
 * a `sem` is { registrationid, registrationcode } as the portal lists them.
 */
export const api = {
  // attendance                                               fixture
  attendanceMeta: () =>                                    // att_meta.json
    post('/StudentClassAttendance/getstudentInforegistrationforattendence', { instituteid: iid() }),
  attendance: (sem, stynumber) => orEmpty({ studentattendancelist: [] }, // att_detail_2026ODDSEM.json
    post('/StudentClassAttendance/getstudentattendancedetail', {
      instituteid: iid(), registrationcode: sem.registrationcode, registrationid: sem.registrationid, stynumber,
    }, enc)),
  /** subject = a studentattendancelist row; components = its subjectcomponentid(s) to include */
  dailyAttendance: (sem, subject, components) => orEmpty({ studentAttdsummarylist: [] }, // daily_*.json
    post('/StudentClassAttendance/getstudentsubjectpersentage', {
      instituteid: iid(), subjectid: subject.subjectid, registrationid: sem.registrationid,
      cmpidkey: components.map((c) => ({ subjectcomponentid: c })),
      subjectcode: subject.subjectcode, registrationcode: sem.registrationcode,
    }, enc)),

  // subjects
  subjectSemesters: () => post('/reqsubfaculty/getregistrationList', { instituteid: iid() }, enc), // gc_regs.json shape
  registeredSubjects: (sem) => orEmpty({ registrations: [] }, // faculties.json
    post('/reqsubfaculty/getfaculties', { studentid: session().memberId, instituteid: iid(), registrationid: sem.registrationid }, enc)),
  credits: () => post('/feedbackformcontroller/getCreadits', { enrollmentNo: session().enrollmentNo }), // credits.json

  // exams
  examSemesters: () => orEmpty({ semesterCodeinfo: { semestercode: [] } }, // exam_sems.json
    post('/studentcommonsontroller/getsemestercode-withstudentexamevents', { clientid: session().clientId, instituteid: iid() }, enc)),
  examEvents: (sem) => orEmpty({ eventcode: { examevent: [] } }, // exam_events.json
    post('/studentcommonsontroller/getstudentexamevents', { instituteid: iid(), registationid: sem.registrationid }, enc)),
  /** event = an exam event row (exameventid, registrationid) */
  examSchedule: (event) => orEmpty({ subjectinfo: [] }, // exam_schedule.json
    post('/studentsttattview/getstudent-examschedule', { instituteid: iid(), exameventid: event.exameventid, registrationid: event.registrationid }, enc)),

  // marks
  marksSemesters: () => orEmpty({ semestercode: [] }, // marks_sems.json
    post('/studentcommonsontroller/getsemestercode-exammarks', { instituteid: iid() }, enc)),
  marksPdf: (sem) => bytes(`/studentsexamview/printstudent-exammarks/${iid()}/${sem.registrationid}/${sem.registrationcode}`), // marks/*.pdf

  // grades
  gradeCardSemesters: () => orEmpty({ registrations: [] }, // gc_regs.json
    post('/studentgradecard/getregistrationList', { instituteid: iid() }, enc)),
  program: () => post('/studentgradecard/getstudentinfo', { instituteid: iid() }, enc), // gc_info.json
  /** program = program().studentinfo */
  gradeCard: (sem, program) => orEmpty({ gradecard: [] }, // gradecard_2026EVESEM.json
    post('/studentgradecard/showstudentgradecard', {
      instituteid: iid(), registrationid: sem.registrationid, branchid: program.branchid, programid: program.programid,
    }, enc)),
  /** sgpa/cgpa for every finished semester; stynumber = current semester number */
  semesterResults: (stynumber) => orEmpty({ semesterList: [] }, // sgpa_all.json
    post('/studentsgpacgpa/getallsemesterdata', { instituteid: iid(), studentid: session().memberId, stynumber }, enc)),

  // me
  personalInfo: () => post('/studentpersinfo/getstudent-personalinformation', { instituteid: iid() }), // personal.json
  bankInfo: () => post('/studentbankdetails/getstudentbankinfo', { instituteid: iid() }, enc), // bank.json
  hostel: () => orEmpty(null, post('/myhostelallocationdetail/gethostelallocationdetail', { instituteid: iid() })), // hostel.json
  fees: () => orEmpty(null, post('/studentfeeledger/loadfeesummary', { instituteid: iid() })), // fees.json

  // registration, read only
  choiceSemesters: () => orEmpty({ registrationcodelist: [] }, post('/studentchoiceprint/getsemestercodelist', {}, enc)), // choice_sems.json
  subjectChoices: (sem) => orEmpty({ subjectpreferencegrid: [] }, // choices.json
    post('/studentchoiceprint/getsubjectpreference', { instituteid: iid(), clientid: session().clientId, registrationid: sem.registrationid }, enc)),
  moocSemesters: () => orEmpty([], post('/moocsubjectstatus/getsemestercodelist', { instituteid: iid() })), // mooc_sems.json
  moocStatus: (sem) => orEmpty(null, post('/moocsubjectstatus/getsubjectstatus', { instituteid: iid(), registrationid: sem.registrationid })), // mooc_status.json
};

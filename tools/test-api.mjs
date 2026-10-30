// transport contract tests for src/core/api.js, run with a fake fetch (no network).
// guards the Oct 2026 portal change: request bodies are plain JSON now, and spring's
// 5xx error page is a server error that must not be retried.

const store = new Map();
const mem = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
globalThis.localStorage = mem;
globalThis.sessionStorage = mem;
globalThis.__JP_PREVIEW__ = {
  session: {
    token: 't', username: 'u', instituteId: 'INST', instituteName: '', clientId: 'CL',
    memberId: 'MEM', userId: 'U', enrollmentNo: 'E', name: 'N', memberType: 'S',
  },
};

let replies = [];
let calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  const r = replies.length > 1 ? replies.shift() : replies[0];
  return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json', Date: new Date().toUTCString() } });
};

const { api, post, PortalError } = await import('../src/core/api.js');
const ok = (response) => ({ status: 200, body: JSON.stringify({ status: { responseStatus: 'Success', errors: null }, response }) });
const sem = { registrationid: 'R1', registrationcode: '2026ODDSEM' };

let pass = 0, fail = 0;
async function test(name, fn) {
  calls = []; replies = [];
  try { await fn(); pass++; console.log('ok  ', name); } catch (e) { fail++; console.log('FAIL', name, '-', e.message); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

// every data call the app makes, with the field it must send in clear text
const CASES = [
  ['attendanceMeta', () => api.attendanceMeta(), 'instituteid'],
  ['attendance', () => api.attendance(sem, '5'), 'registrationcode'],
  ['dailyAttendance', () => api.dailyAttendance(sem, { subjectid: 'S', individualsubjectcode: 'C1' }, ['L']), 'cmpidkey'],
  ['subjectSemesters', () => api.subjectSemesters(), 'instituteid'],
  ['registeredSubjects', () => api.registeredSubjects(sem), 'studentid'],
  ['credits', () => api.credits(), 'enrollmentNo'],
  ['examSemesters', () => api.examSemesters(), 'clientid'],
  ['examEvents', () => api.examEvents(sem), 'registationid'],
  ['examSchedule', () => api.examSchedule({ exameventid: 'X', registrationid: 'R1' }), 'exameventid'],
  ['marksSemesters', () => api.marksSemesters(), 'instituteid'],
  ['gradeCardSemesters', () => api.gradeCardSemesters(), 'instituteid'],
  ['program', () => api.program(), 'instituteid'],
  ['gradeCard', () => api.gradeCard(sem, { branchid: 'B', programid: 'P' }), 'branchid'],
  ['semesterResults', () => api.semesterResults('5'), 'stynumber'],
  ['personalInfo', () => api.personalInfo(), 'instituteid'],
  ['bankInfo', () => api.bankInfo(), 'instituteid'],
  ['hostel', () => api.hostel(), 'instituteid'],
  ['fees', () => api.fees(), 'instituteid'],
  ['subjectChoices', () => api.subjectChoices(sem), 'clientid'],
  ['moocSemesters', () => api.moocSemesters(), 'instituteid'],
  ['moocStatus', () => api.moocStatus(sem), 'registrationid'],
];
for (const [name, call, field] of CASES) {
  await test(`${name} sends a plain JSON body`, async () => {
    replies = [ok({})];
    await call();
    const body = calls[0]?.init?.body;
    let parsed;
    try { parsed = JSON.parse(body); } catch { throw new Error(`body is not JSON: ${String(body).slice(0, 40)}`); }
    assert(field in parsed, `missing ${field}`);
  });
}
await test('choiceSemesters sends a plain JSON body', async () => {
  replies = [ok({ registrationcodelist: [] })];
  await api.choiceSemesters();
  assert(calls[0].init.body === '{}', `body was ${calls[0].init.body}`);
});

await test('envelope success returns response', async () => {
  replies = [ok({ hello: 1 })];
  const r = await post('/x', { a: 1 });
  assert(r.hello === 1, 'wrong response');
});

await test("spring's 5xx error page is a server error, not retried", async () => {
  replies = [{ status: 500, body: JSON.stringify({ timestamp: '2026-10-27T15:58:00Z', status: 500, error: 'Internal Server Error', message: 'JSON parse error', path: '/StudentPortalAPI/x' }) }];
  let err;
  try { await post('/x', { a: 1 }); } catch (e) { err = e; }
  assert(err instanceof PortalError && err.kind === 'server', `got ${err?.kind}`);
  assert(/JSON parse error/.test(err.detail), 'detail missing');
  assert(calls.length === 1, `retried ${calls.length - 1} times`);
});

await test('empty 503 is an outage and is retried', async () => {
  replies = [{ status: 503, body: '' }];
  let err;
  try { await post('/x', {}); } catch (e) { err = e; }
  assert(err?.kind === 'unavailable', `got ${err?.kind}`);
  assert(calls.length === 3, `expected 3 attempts, got ${calls.length}`);
});

await test('portal business error keeps its message', async () => {
  replies = [{ status: 200, body: JSON.stringify({ status: { responseStatus: 'Failure', errors: ['NO RECORD FOUND'] } }) }];
  let err;
  try { await post('/x', {}); } catch (e) { err = e; }
  assert(err?.kind === 'portal' && err.isNoData, `got ${err?.kind} ${err?.message}`);
});

await test('401 is an expired session', async () => {
  replies = [{ status: 401, body: JSON.stringify({ timestamp: 'x', status: 401, error: 'Unauthorized' }) }];
  let err;
  try { await post('/x', {}); } catch (e) { err = e; }
  assert(err?.kind === 'expired', `got ${err?.kind}`);
});

// staying signed in. from here on a real session from storage, not the preview's
const { session, adoptLogin } = await import('../src/core/session.js');
const events = [];
globalThis.dispatchEvent = (e) => events.push(e.type);
const jwt = (exp) => 'h.' + Buffer.from(JSON.stringify({ exp })).toString('base64url') + '.s';
const unauthorized = { status: 401, body: JSON.stringify({ timestamp: 'x', status: 401, error: 'Unauthorized' }) };
const refreshed = (msg) => ({ status: 200, body: JSON.stringify({ status: { responseStatus: 'Success', errors: null }, response: { msg } }) });
async function signedInLongAgo() {
  await new Promise((r) => setTimeout(r, 5)); // let the last test's in-flight refresh clear
  delete globalThis.__JP_PREVIEW__;
  store.clear();
  events.length = 0;
  // what the sign-in page leaves behind: no portal Token, only our capture, its jwt 5h past exp
  store.set('jp:login', JSON.stringify({ token: jwt(Math.floor(Date.now() / 1000) - 5 * 3600), value: 'INST', Username: 'u', memberid: 'MEM', tokendate: 'Thu Oct 29 2026' }));
}

await test('a captured session outlives its jwt exp, so jportal still opens', async () => {
  await signedInLongAgo();
  assert(session()?.token?.startsWith('h.'), 'session dropped after exp');
  assert(session().memberId === 'MEM', 'member id lost');
});

await test('401 asks the portal to extend the session, then retries the same call', async () => {
  await signedInLongAgo();
  replies = [unauthorized, refreshed('Success'), ok({ fine: 1 })];
  const r = await post('/x', { a: 1 });
  assert(r?.fine === 1, 'retry did not return the data');
  assert(calls[1].url.endsWith('/token/refreshTokenRequest'), `second call was ${calls[1].url}`);
  assert(JSON.parse(calls[1].init.body).tokendate === 'Thu Oct 29 2026', 'refresh without the login date');
  assert(!events.length, 'asked for sign-in although the extension worked');
});

await test('GET calls get the same extension attempt', async () => {
  await signedInLongAgo();
  replies = [unauthorized, refreshed('Success'), ok({ fine: 2 })];
  const { get } = await import('../src/core/api.js');
  const r = await get('/y');
  assert(r?.fine === 2 && calls.length === 3, `got ${JSON.stringify(r)} after ${calls.length} calls`);
});

await test('when the portal refuses to extend, the app is asked to offer sign-in', async () => {
  await signedInLongAgo();
  replies = [unauthorized, refreshed('Failure'), unauthorized];
  let err;
  try { await post('/x', {}); } catch (e) { err = e; }
  assert(err?.kind === 'expired', `got ${err?.kind}`);
  assert(events.includes('jp:signin'), 'no jp:signin event');
  assert(calls.length === 2, `expected the call and one refresh, got ${calls.length}`);
});

await test('a google sign-in is stored the way the portal stores it', async () => {
  await signedInLongAgo();
  adoptLogin({ token: 'NEW', Username: 'u2', value: 'INST2', label: 'JIIT', clientid: 'C', memberid: 'M2', enrollmentno: 'E2', name: 'N', membertype: 'S', userid: 'U' });
  for (const [k, v] of [['Token', 'NEW'], ['Username', 'u2'], ['instituteid', 'INST2'], ['institutename', 'JIIT'], ['enrollmentno', 'E2']]) {
    assert(store.get(k) === v, `${k} = ${store.get(k)}`);
  }
  assert(store.get('tokendate'), 'no tokendate for the next refresh');
  const s = session();
  assert(s.token === 'NEW' && s.memberId === 'M2', `session is ${s.token}/${s.memberId}`);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

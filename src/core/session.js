// the portal keeps its google-signin session in localStorage, except the
// member id (the student id some calls need), which it only holds in memory.
// so: the login response is sniffed as the portal receives it (hook below,
// installed at document-start) and the member id is kept under our own key.

const CAPTURE = 'jp:login';

/** wraps xhr and fetch so the portal's own login answer reaches us, like the android app's approach a */
export function installLoginHook(win = window) {
  if (win.__jpHook) return;
  win.__jpHook = true;
  const hit = (u) => /generate-token-google-signin|generate-token/.test(String(u));
  const keep = (text) => {
    try {
      const r = JSON.parse(text)?.response;
      const res = r?.regdata || r;
      // tokendate: refreshTokenRequest wants the login moment back as new Date().toString()
      if (res?.token) win.localStorage.setItem(CAPTURE, JSON.stringify({ ...res, at: Date.now(), tokendate: new Date().toString() }));
    } catch {}
  };
  // the portal's sign-in page runs localStorage.clear() on every load. keep our jp:* keys
  // (cache, settings, the captured session) through it; signOut() removes them on purpose.
  const S = win.Storage.prototype;
  const clear = S.clear;
  S.clear = function () {
    if (this !== win.localStorage || win.__jpWipe) return clear.call(this);
    const kept = [];
    for (let i = 0; i < this.length; i++) {
      const k = this.key(i);
      if (k && k.startsWith('jp:')) kept.push([k, this.getItem(k)]);
    }
    clear.call(this);
    for (const [k, v] of kept) this.setItem(k, v);
  };
  // the portal writes Token on login and after a refresh; keep our copy in step
  const setItem = S.setItem;
  S.setItem = function (k, v) {
    setItem.call(this, k, v);
    if (this === win.localStorage && k === 'Token' && v) {
      try {
        const cap = JSON.parse(this.getItem(CAPTURE) || '{}');
        if (cap.token !== v) setItem.call(this, CAPTURE, JSON.stringify({ ...cap, token: v }));
      } catch {}
    }
  };
  const XHR = win.XMLHttpRequest.prototype;
  const open = XHR.open, send = XHR.send;
  XHR.open = function (m, u) { this.__jpu = u; return open.apply(this, arguments); };
  XHR.send = function () {
    if (hit(this.__jpu)) this.addEventListener('load', () => keep(this.responseText));
    return send.apply(this, arguments);
  };
  const f = win.fetch;
  if (f) win.fetch = function (u) {
    const p = f.apply(this, arguments);
    if (hit(u?.url || u)) p.then((r) => r.clone().text().then(keep)).catch(() => {});
    return p;
  };
}

const ls = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };

/**
 * the signed-in student, or null. fields mirror ktjiit's Session:
 * token, username, instituteId, instituteName, clientId, memberId, userId,
 * enrollmentNo, name, memberType.
 */
export function session() {
  if (globalThis.__JP_PREVIEW__) return globalThis.__JP_PREVIEW__.session;
  let cap = {};
  try { cap = JSON.parse(ls(CAPTURE) || '{}'); } catch {}
  // the portal wipes its own Token whenever its sign-in page loads; our copy keeps us
  // signed in. not dropped when the jwt's exp passes: the portal answers a dead token with
  // 401, api.js asks for an extension the way the portal does, and only then asks for a
  // sign-in, over the saved data instead of the bare sign-in page
  const live = ls('Token');
  const token = live || cap.token || '';
  if (!token) return null;
  // a capture from an older login is still good for the member id, it doesn't change
  return {
    token,
    username: ls('Username') || cap.Username || '',
    instituteId: ls('instituteid') || cap.value || '',
    instituteName: ls('institutename') || cap.label || '',
    clientId: ls('clientid') || cap.clientid || '',
    memberId: ls('memberid') || cap.memberid || '',
    userId: ls('userid') || cap.userid || '',
    enrollmentNo: ls('enrollmentno') || cap.enrollmentno || '',
    name: ls('name') || cap.name || '',
    memberType: ls('membertype') || cap.membertype || '',
  };
}

/** the moment of login as the portal formats it, for refreshTokenRequest */
export function tokenDate() {
  try { return ls('tokendate') || sessionStorage.getItem('tokendate') || JSON.parse(ls(CAPTURE) || '{}').tokendate || ''; } catch { return ''; }
}

/** seconds-since-epoch exp claim of the jwt, or null */
export function expiresAt() {
  const t = session()?.token;
  try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000; } catch { return null; }
}

/** a jwt claim, for the member id fallback when we missed the login */
export function claim(name) {
  const t = session()?.token;
  try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))[name]; } catch { return undefined; }
}

export const signedIn = () => !!session()?.token;

/** a fresh login from google.js, stored the way the portal's own sign-in page stores it, plus our copy */
export function adoptLogin(res) {
  const tokendate = new Date().toString();
  const keys = {
    Today_DATE: String(Date.now()), tokendate, Token: res.token, clientid: res.clientid, userid: res.userid,
    name: res.name, membertype: res.membertype, enrollmentno: res.enrollmentno, Username: res.Username,
    instituteid: res.value, institutename: res.label,
  };
  try {
    for (const [k, v] of Object.entries(keys)) if (v != null) localStorage.setItem(k, v);
    sessionStorage.setItem('tokendate', tokendate);
    localStorage.setItem(CAPTURE, JSON.stringify({ ...res, at: Date.now(), tokendate }));
  } catch {}
}

/** what the portal's own logout does, then back to its sign-in page */
export function signOut() {
  try {
    window.__jpWipe = true;
    localStorage.clear();
    Object.keys(localStorage).filter((k) => k.startsWith('jp:')).forEach((k) => localStorage.removeItem(k));
    sessionStorage.clear();
  } catch {}
  location.href = '/studentportal/';
}

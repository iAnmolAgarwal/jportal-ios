// signing in again from inside jportal, the way the portal's own sign-in page does it:
// google's button (gsi, which the portal page already loads) hands over an id token, and
// the portal's sso api trades it for a session. safari has no silent google sign-in (itp
// turns auto_select off), so this is one tap, not the android app's hidden re-auth.

import { BASE, PortalError } from './api.js';
import { adoptLogin } from './session.js';

const LOGIN_URL = 'https://webportal.jiit.ac.in:6013/CLXSSOAPI/token/generate-token-google-signin';

// { loadGoogleClientId, loadGoogleButtonShow, URLapiBase }, see fixtures/config.json.
// fetched the way the sign-in page does, with a bare "Bearer": the server answers an empty
// 200 without the header, and a dead token in it mustn't get in the way either
let config = null;
function loadConfig() {
  config ??= (async () => {
    let body = null;
    try {
      const res = await fetch(BASE + '/token/getlogoClientWise', {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*', Authorization: 'Bearer' },
      });
      body = await res.json();
    } catch {}
    if (!body?.response) throw new PortalError('network', "Can't reach the portal");
    return body.response;
  })().catch((e) => { config = null; throw e; });
  return config;
}

function gsi() {
  return new Promise((resolve, reject) => {
    const ready = () => window.google?.accounts?.id;
    if (ready()) return resolve(ready());
    if (!document.querySelector('script[src*="accounts.google.com/gsi/client"]')) {
      document.head.append(Object.assign(document.createElement('script'), { src: 'https://accounts.google.com/gsi/client', async: true }));
    }
    let tries = 0;
    const id = setInterval(() => {
      if (ready()) { clearInterval(id); resolve(ready()); }
      else if (++tries > 100) { clearInterval(id); reject(new PortalError('network', "Google sign-in didn't load")); }
    }, 100);
  });
}

/** what the portal's handleCredentialResponse posts, plain json, no token yet */
async function exchange(credential, url) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*' },
      body: JSON.stringify({ googleToken: credential, modulename: 'studentportal' }),
    });
  } catch {
    throw new PortalError('network', "Can't reach the portal");
  }
  let body = null;
  try { body = await res.json(); } catch {}
  const r = body?.response?.regdata || body?.response;
  if (body?.status?.responseStatus !== 'Success' || !r?.token) {
    throw new PortalError('portal', body?.status?.errors?.[0] || "The portal didn't sign you in");
  }
  adoptLogin(r);
  return r;
}

/**
 * renders google's own "continue with google" button into el. resolves once it shows,
 * rejects if it can't (portal down, google blocked). onSignedIn runs after the portal
 * accepted the login; onError with a PortalError when the exchange fails.
 */
export async function googleButton(el, { dark = false, width = 320, onSignedIn, onError } = {}) {
  const [cfg, id] = await Promise.all([loadConfig(), gsi()]);
  if (cfg?.loadGoogleButtonShow !== 'Y' || !cfg.loadGoogleClientId) {
    throw new PortalError('portal', 'The portal has Google sign-in switched off');
  }
  id.initialize({
    client_id: cfg.loadGoogleClientId,
    ux_mode: 'popup',
    callback: async (r) => {
      try { onSignedIn?.(await exchange(r.credential, cfg.URLapiBase || LOGIN_URL)); } catch (e) { onError?.(e); }
    },
  });
  id.renderButton(el, {
    theme: dark ? 'filled_black' : 'outline', size: 'large', shape: 'pill', text: 'continue_with',
    logo_alignment: 'left', width: Math.round(Math.min(400, width)),
  });
}

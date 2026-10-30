// the app shell: a shadow-dom root over the portal page, four tabs, and a
// push stack for detail screens. no framework.
//
// SCREEN CONTRACT (src/screens/*.js)
//   export function myScreen(ctx) -> HTMLElement
//   ctx.nav     { tab(name), push(name, params), back() }
//   ctx.params  whatever push() was given ({} for tabs)
//   ctx.pushed  true for detail screens (show a back arrow via header({ back: ctx.nav.back }))
// a screen returns its root synchronously and fills it in as data arrives.
// tabs are built once and kept alive; pushed screens are rebuilt every push.

import { h, render } from './ui/dom.js';
import { icon, openSignIn } from './ui/components.js';
import { prefs } from './core/store.js';
import { SCREENS, TABS } from './screens/index.js';
import css from './ui/theme.css';

const TAB_META = {
  attendance: ['Attendance', 'fact_check', 'fact_check_filled'],
  academics: ['Academics', 'school', 'school_filled'],
  subjects: ['Subjects', 'menu_book', 'menu_book_filled'],
  me: ['Me', 'person', 'person_filled'],
};

export function mountApp({ startTab = 'attendance', push } = {}) {
  let host = document.getElementById('jportal-root');
  if (host) return host.__jp;
  host = h('div', { id: 'jportal-root' });
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  root.append(h('style', null, css));
  const app = h('div', { class: 'app' });
  globalThis.__jpApp = app;
  root.append(app);

  // theme follows the phone unless set in settings
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const applyTheme = () => {
    const t = prefs.get('theme');
    const dark = t === 'dark' || (t === 'system' && mq.matches);
    host.toggleAttribute('data-amoled', !!prefs.get('amoled'));
    if (dark) host.setAttribute('data-theme', 'dark'); else host.removeAttribute('data-theme');
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#191C20' : '#FFFFFF');
  };
  mq.addEventListener?.('change', applyTheme);
  prefs.onChange(applyTheme);
  applyTheme();

  const tabPages = {};
  const stack = []; // pushed pages, top last
  let current = null;

  const navBar = h('nav', { class: 'nav' });
  const drawNav = () => render(navBar, TABS.map((t) => {
    const [label, ic, icOn] = TAB_META[t];
    const on = t === current;
    return h('button', { 'aria-selected': String(on), onclick: () => nav.tab(t) },
      h('span', { class: 'ind' }, icon(on ? icOn : ic, 24)), label);
  }));

  const nav = {
    tab(name) {
      while (stack.length) stack.pop().remove();
      if (name === current && tabPages[name]) { tabPages[name].scrollTo({ top: 0, behavior: 'smooth' }); return; }
      current = name;
      for (const [k, p] of Object.entries(tabPages)) p.style.display = k === name ? '' : 'none';
      if (!tabPages[name]) {
        const page = h('main', { class: 'page fade-in' });
        tabPages[name] = page;
        app.insertBefore(page, navBar);
        page.append(build(name, {}, false));
      }
      navBar.style.display = '';
      drawNav();
      try { sessionStorage.setItem('jp:tab', name); } catch {}
    },
    push(name, params = {}) {
      const page = h('main', { class: 'page pushed enter', style: { position: 'absolute', inset: '0', background: 'var(--bg)', zIndex: 6 + stack.length } });
      stack.push(page);
      app.append(page);
      page.append(build(name, params, true));
      navBar.style.display = 'none';
      try { history.pushState({ jp: stack.length }, ''); } catch {}
    },
    back() {
      const top = stack.pop();
      if (top) top.remove();
      if (!stack.length) navBar.style.display = '';
    },
  };

  function build(name, params, pushed) {
    const fn = SCREENS[name];
    if (!fn) return h('div', { class: 'center' }, `Missing screen: ${name}`);
    try {
      return fn({ nav, params, pushed });
    } catch (e) {
      console.error('[jportal]', name, e);
      return h('div', { class: 'center' }, h('div', { class: 'title' }, 'Something broke on this screen'), h('div', { class: 'body-md muted' }, String(e?.message || e)));
    }
  }

  // ios edge-swipe and the back button pop our stack
  addEventListener('popstate', () => { if (stack.length) nav.back(); });

  // the session ran out and the portal wouldn't extend it: offer sign-in over the saved
  // data, once per visit. the screens keep a Sign in button for later
  let asked = false;
  addEventListener('jp:signin', () => { if (!asked) { asked = true; openSignIn(); } });

  app.append(navBar);
  let start = startTab;
  try { start = sessionStorage.getItem('jp:tab') || startTab; } catch {}
  nav.tab(TABS.includes(start) ? start : 'attendance');
  if (push) nav.push(push.name, push.params);

  const api = { nav, host, unmount: () => { host.remove(); document.documentElement.style.overflow = ''; } };
  host.__jp = api;
  document.documentElement.style.overflow = 'hidden';
  return api;
}

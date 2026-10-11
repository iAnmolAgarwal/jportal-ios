// userscript entry. runs at document-start in the portal page's own context:
// 1. hook the portal's google login so we keep the member id it only holds in memory
// 2. once the portal has a session, cover it with jportal
import { installLoginHook, signedIn } from './core/session.js';
import { mountApp } from './app.js';
import font from './assets/sans_flex.ttf';

installLoginHook(window);

const OFF = 'jp:off'; // set for this tab when you open the official portal from jportal

function setupPage() {
  // safe areas and no pinch-zoom wobble, like an app
  let vp = document.querySelector('meta[name=viewport]');
  if (!vp) { vp = document.createElement('meta'); vp.name = 'viewport'; document.head.append(vp); }
  vp.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
  if (!document.querySelector('meta[name=theme-color]')) {
    const m = document.createElement('meta'); m.name = 'theme-color'; document.head.append(m);
  }
  // fonts can't be declared inside a shadow root, so the face lives on the page
  const st = document.createElement('style');
  st.textContent = `@font-face{font-family:'JP Sans Flex';src:url(${font}) format('truetype');font-weight:100 1000;font-display:swap}`;
  document.head.append(st);
}

function launcher() {
  if (document.getElementById('jportal-launch')) return;
  const b = document.createElement('button');
  b.id = 'jportal-launch';
  b.textContent = 'Open JPortal';
  b.style.cssText = 'position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:2147483000;padding:12px 20px;border-radius:999px;border:0;background:#2563EB;color:#fff;font:600 15px -apple-system,system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25)';
  b.onclick = () => { try { sessionStorage.removeItem(OFF); } catch {} b.remove(); start(); };
  document.body.append(b);
}

let app = null;
function start() {
  if (app || !signedIn()) return;
  app = mountApp();
  app.openPortal = () => { try { sessionStorage.setItem(OFF, '1'); } catch {} app.unmount(); app = null; launcher(); };
  globalThis.__jpOpenPortal = app.openPortal;
}

function boot() {
  setupPage();
  let off = false;
  try { off = sessionStorage.getItem(OFF) === '1'; } catch {}
  if (off) { if (signedIn()) launcher(); return; }
  if (signedIn()) return start();
  // not signed in: leave the portal's google button alone, take over once it hands out a token
  const id = setInterval(() => { if (signedIn()) { clearInterval(id); setTimeout(start, 300); } }, 500);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

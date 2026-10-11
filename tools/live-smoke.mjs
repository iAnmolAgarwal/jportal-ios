// injects dist/jportal.user.js into the real portal page at document-start (no login).
// 1) signed out: the portal's sign-in page must still work, jportal must stay out of the way
// 2) a dummy token: jportal mounts, its api calls hit the real portal, get 401, and it offers sign-in
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const script = fs.readFileSync('dist/jportal.user.js', 'utf8');
const URL = 'https://webportal.jiit.ac.in:6011/studentportal/';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
const api = [];
page.on('response', (r) => { if (r.url().includes('StudentPortalAPI')) api.push(`${r.status()} ${r.url().split('StudentPortalAPI')[1]}`); });
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument(script);
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
const s1 = await page.evaluate(() => ({ hook: !!window.__jpHook, mounted: !!document.getElementById('jportal-root'), googleBtn: !!document.querySelector('iframe[src*="accounts.google.com"], div[id^="g_id"], .nsm7Bb-HzV7m-LgbsSe') }));
console.log('signed out:', JSON.stringify(s1));
await page.screenshot({ path: process.argv[2] || 'shots/live-signedout.png' });
// a previous login as our hook would have captured it, with a dummy jwt that hasn't expired
await page.evaluate(() => {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).replace(/=+$/, '');
  localStorage.setItem('jp:login', JSON.stringify({ token: 'eyJhbGciOiJIUzI1NiJ9.' + payload + '.x', value: 'DUMMY', Username: 'dummy', memberid: 'DUMMY' }));
  localStorage.setItem('jp:pref:theme', '"dark"');
  sessionStorage.clear();
});
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 6000));
const s2 = await page.evaluate(() => {
  const root = document.getElementById('jportal-root');
  return { mounted: !!root, keptPrefs: localStorage.getItem('jp:pref:theme'), portalToken: localStorage.getItem('Token'), text: root?.shadowRoot?.querySelector('main')?.innerText.slice(0, 200) };
});
console.log('dummy token:', JSON.stringify(s2));
await page.screenshot({ path: process.argv[3] || 'shots/live-expired.png' });
console.log('api calls:', api.slice(0, 8).join(' | '));
console.log(errs.length ? errs.join('\n') : 'no page errors');
await browser.close();

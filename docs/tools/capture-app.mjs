// captures the app screens used in the README from the fixture preview.
//   node build.mjs && node tools/serve.mjs 5179 &   (preview server)
//   node docs/tools/capture-app.mjs <outdir>        (default: $TMPDIR/jportal-readme/app)
// every screen is shot at 390x844 @2x, light and dark. names are scrubbed fixture data ("Test Name").
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const out = process.argv[2] || path.join(os.tmpdir(), 'jportal-readme', 'app');
fs.mkdirSync(out, { recursive: true });
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:5179/dist/preview.html?';
const SUBJ = encodeURIComponent(JSON.stringify({ semCode: '2026ODDSEM', subjectCode: '26B16CS315' }));

// pre-seeded what-if: two future semesters dragged up, so the chart shows dashed projections
const WHATIF = { 5: 8.9, 6: 9.1 };
// grades picked in the sgpa calculator, one per subject row in order
const PICKS = ['A', 'A+', 'A+', 'A', 'B+', 'B', 'B+', 'A', 'A', 'A+', 'A'];

const SHOTS = [
  { name: 'attendance', q: 'tab=attendance&now=2026-09-24' },
  { name: 'subject', q: `push=subject&params=${SUBJ}&now=2026-09-24` },
  { name: 'overview', q: 'tab=academics&now=2026-09-24', whatif: true },
  { name: 'calculator', q: 'tab=academics&now=2026-09-24', whatif: true, calc: true },
  { name: 'marks', q: 'tab=academics&now=2026-09-24', click: ['.seg button:nth-child(2)'] },
  { name: 'exams', q: 'tab=academics&now=2026-10-08', click: ['.seg button:nth-child(3)'] },
  { name: 'me', q: 'tab=me&now=2026-09-24' },
];

// demo attendance for the screenshots. the scrubbed fixtures have several subjects at a
// portal-reported 0%, which reads like a bug in a readme. these numbers are made up and
// only replace the fixture answers inside this capture run (src/ and fixtures/ are untouched).
const DEMO_ATT = {
  '26B14CS354': [17, 19], '26B14PH311': [15, 18], '26B12CS315': [16, 19], '26B16CS318': [6, 7],
  '24B11CS312': [14, 17], '24B15CS312': [7, 7], '24B15CS314': [6, 7], '24B11CS313': [18, 21],
  '24B15CS313': [6, 7], '24B17CS311': [3, 3],
};
function demoHooks(att) {
  const pct = (a, t) => Math.round((a / t) * 1000) / 10;
  globalThis.__README_DETAIL__ = (orig) => {
    const d = structuredClone(orig);
    for (const r of d.response.studentattendancelist) {
      const v = att[r.individualsubjectcode.trim()];
      if (!v) continue;
      const p = pct(...v);
      for (const k of ['Lpercentage', 'Tpercentage', 'Ppercentage']) if (r[k] != null) r[k] = p;
      r.LTpercantage = p;
    }
    return d;
  };
  globalThis.__README_DAILY__ = (payload, orig) => {
    const v = att[String(payload?.subjectcode || '').trim()];
    if (!v) return null;
    const [a, t] = v;
    const list = [];
    const absentAt = new Set(Array.from({ length: t - a }, (_, i) => Math.floor(((i + 1) * t) / (t - a + 1))));
    let day = Date.UTC(2026, 8, 23);
    for (let i = 0; i < t; i++) {
      const dt = new Date(day);
      const dd = String(dt.getUTCDate()).padStart(2, '0'), mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
      list.push({ ...orig.response.studentAttdsummarylist[0], datetime: `${dd}/${mm}/2026 (10:00:AM - 10:50 AM)`, present: absentAt.has(i) ? 'Absent' : 'Present' });
      day -= (i % 2 ? 4 : 3) * 86400000;
    }
    return { ...orig, response: { ...orig.response, studentAttdsummarylist: list } };
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
try {
  for (const theme of ['light', 'dark']) {
    for (const s of SHOTS) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await page.evaluateOnNewDocument(demoHooks, DEMO_ATT);
      await page.setRequestInterception(true);
      page.on('request', async (req) => {
        if (!req.url().includes('/dist/preview.js')) return req.continue();
        let js = await (await fetch(req.url())).text();
        js = js
          .replace(/\["getstudentattendancedetail", (\w+)\]/, '["getstudentattendancedetail", () => globalThis.__README_DETAIL__?.($1) || $1]')
          .replace(/\(p\) => daily\[p\?\.subjectcode\] \|\| (\w+)/, '(p) => daily[p?.subjectcode] || globalThis.__README_DAILY__?.(p, $1) || $1');
        req.respond({ status: 200, contentType: 'text/javascript', body: js });
      });
      await page.evaluateOnNewDocument((w) => {
        try { localStorage.clear(); if (w) localStorage.setItem('jp:whatif', JSON.stringify(w)); } catch {}
      }, s.whatif ? WHATIF : null);
      await page.goto(`${BASE}${s.q}&theme=${theme}`, { waitUntil: 'networkidle0', timeout: 20000 });
      await sleep(1300);
      for (const sel of s.click || []) {
        await page.evaluate((q) => document.getElementById('jportal-root').shadowRoot.querySelector(q).click(), sel);
        await sleep(1000);
      }
      if (s.calc) {
        await page.evaluate((picks) => {
          const root = document.getElementById('jportal-root').shadowRoot;
          picks.forEach((g, i) => {
            const rows = root.querySelectorAll('.gchips');
            const chip = [...(rows[i]?.children || [])].find((b) => b.textContent.trim() === g);
            chip?.click();
          });
        }, PICKS);
        await sleep(600);
        // scroll the page so the calculator's summary sits near the top
        await page.evaluate(() => {
          const root = document.getElementById('jportal-root').shadowRoot;
          const head = [...root.querySelectorAll('.section')].find((e) => /SGPA calculator/i.test(e.textContent));
          const pg = [...root.querySelectorAll('main, .page')].filter((m) => m.offsetParent !== null).at(-1);
          if (head && pg) pg.scrollTop = head.offsetTop - 70;
        });
        await sleep(700);
      }
      const file = path.join(out, `${s.name}-${theme}.png`);
      await page.screenshot({ path: file });
      console.log(file, errors.length ? 'ERRORS: ' + errors.join(' | ') : '');
      await page.close();
    }
  }
} finally {
  await browser.close();
}

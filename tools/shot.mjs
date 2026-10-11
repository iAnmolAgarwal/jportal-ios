// iphone-sized screenshots of the preview, via the installed chrome.
//   node tools/shot.mjs out.png 'tab=academics&theme=dark&now=2026-09-24' [--full] [--click=selector]...
// needs `node tools/serve.mjs` running (port 5179) and a fresh `node build.mjs`.
// --click: css selectors clicked in order inside the app's shadow root, 600ms apart.
import puppeteer from 'puppeteer-core';
const [out, q = ''] = process.argv.slice(2);
const full = process.argv.includes('--full');
const clicks = process.argv.filter((a) => a.startsWith('--click=')).map((a) => a.slice(8));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(`http://localhost:5179/dist/preview.html?${q}`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1200));
  for (const sel of clicks) {
    await page.evaluate((s) => {
      const el = document.getElementById('jportal-root').shadowRoot.querySelector(s);
      if (!el) throw new Error('no element for ' + s);
      el.click();
    }, sel);
    await new Promise((r) => setTimeout(r, 900));
  }
  if (full) {
    // grow the viewport to the top page's scroll height so the whole screen is captured
    const hgt = await page.evaluate(() => {
      const pages = [...document.getElementById('jportal-root').shadowRoot.querySelectorAll('main')].filter((m) => m.style.display !== 'none');
      return Math.max(844, pages.at(-1)?.scrollHeight || 844);
    });
    await page.setViewport({ width: 390, height: Math.min(hgt, 6000), deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await new Promise((r) => setTimeout(r, 600));
  }
  await page.screenshot({ path: out });
  console.log(out, errors.length ? '\nERRORS:\n' + errors.join('\n') : '(no console errors)');
} finally {
  await browser.close();
}

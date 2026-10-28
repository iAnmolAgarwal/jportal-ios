// renders every image in docs/images/ from html, in the JPortal look.
//
//   node build.mjs && (node tools/serve.mjs 5179 &)
//   node docs/tools/capture-app.mjs <tmp>/app           # app screens from the fixture preview
//   node docs/tools/make-images.mjs <tmp>/app <iphone-shots-dir>
//   python3 docs/tools/compress.py docs/images          # 256-colour png, keeps files small
//
// <iphone-shots-dir> holds the raw setup screenshots (IMG_7959.PNG ... IMG_7966.PNG, 1170x2532).
// They are not in the repo. Everything personal in them (other Safari extensions) is covered with
// opaque blocks before the png is written, and crops keep only the controls a step needs.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const OUT = path.join(REPO, 'docs', 'images');
const APP = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'jportal-readme', 'app'));
const IPHONE = path.resolve(process.argv[3] || path.join(os.homedir(), 'Downloads'));
const ONLY = process.argv.slice(4); // optional: render only these image names
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FONT = pathToFileURL(path.join(REPO, 'src', 'assets', 'sans_flex.ttf')).href;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jportal-img-'));
fs.mkdirSync(OUT, { recursive: true });

const app = (name, theme) => pathToFileURL(path.join(APP, `${name}-${theme}.png`)).href;
const shot = (n) => pathToFileURL(path.join(IPHONE, `IMG_${n}.PNG`)).href;

// ------------------------------------------------------------------ tokens (src/ui/theme.css)
const T = {
  light: {
    page: '#FFFFFF', card: '#F1F2F5', card2: '#E5E7EB', ink: '#111827', muted: '#4B5563', primary: '#2563EB',
    onPrimary: '#FFFFFF', good: '#15803D', goodC: '#DCFCE7', bad: '#DC2626', badC: '#FEE2E2', outline: '#D1D5DB',
    ringTrack: 'rgba(75,85,99,.25)', halo: 'rgba(37,99,235,.18)',
  },
  dark: {
    page: '#0D1117', card: '#191C20', card2: '#242A32', ink: '#FFFFFF', muted: '#95989C', primary: '#A3C9FE',
    onPrimary: '#0B1D33', good: '#4ADE80', goodC: '#14532D', bad: '#F87171', badC: '#7F1D1D', outline: '#2F3540',
    ringTrack: 'rgba(149,152,156,.25)', halo: 'rgba(163,201,254,.22)',
  },
};

// ------------------------------------------------------------------ the wavy ring (components.js ring())
function wavyPath(size, stroke, frac = 1, phase = 0) {
  const amp = stroke * 0.24, r = size / 2 - stroke / 2 - amp, c = size / 2, start = -Math.PI / 2;
  const waves = Math.max(8, Math.round((2 * Math.PI * r) / (stroke * 4.6)));
  const sweep = frac * 2 * Math.PI, steps = Math.max(48, Math.floor(frac * waves * 18));
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const a = start + (sweep * i) / steps;
    const edge = frac >= 0.999 ? 1 : Math.min(1, Math.min(i, steps - i) / (steps * 0.08 + 1));
    const rr = r + amp * edge * Math.sin(waves * (a - start) + phase);
    d += `${i ? 'L' : 'M'}${(c + rr * Math.cos(a)).toFixed(2)} ${(c + rr * Math.sin(a)).toFixed(2)}`;
  }
  return frac >= 0.999 ? d + 'Z' : d;
}
function trackPath(size, stroke, frac) {
  const amp = stroke * 0.24, r = size / 2 - stroke / 2 - amp, c = size / 2, start = -Math.PI / 2;
  const gap = Math.min(0.5, (stroke * 1.6) / r);
  const a0 = start + frac * 2 * Math.PI + gap, a1 = start + 2 * Math.PI - gap;
  if (a1 <= a0) return '';
  const p = (a) => `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
  return `M${p(a0)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`;
}
function ringSvg(size, stroke, frac, color, track, extra = '') {
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" ${extra}>
    <path d="${trackPath(size, stroke, frac)}" fill="none" stroke="${track}" stroke-width="${stroke}" stroke-linecap="round"/>
    <path d="${wavyPath(size, stroke, frac)}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

// ------------------------------------------------------------------ shared css
const BASE_CSS = `
@font-face{font-family:'JP Sans Flex';src:url(${FONT}) format('truetype');font-weight:100 1000}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:transparent}
body{font-family:'JP Sans Flex',-apple-system,system-ui,sans-serif;-webkit-font-smoothing:antialiased;font-variation-settings:'ROND' 0}
.rnd{font-variation-settings:'ROND' 100}
#root{display:inline-block}
`;

// iphone-ish frame around a 390x844 app screen: bezel, status bar, island, home indicator
function phone(src, theme, { w = 390 } = {}) {
  const k = w / 390;
  const bg = theme === 'dark' ? '#191C20' : '#FFFFFF';
  const ink = theme === 'dark' ? '#FFFFFF' : '#111827';
  const status = 44 * k, screenH = (844 + 44) * k, bez = 11 * k;
  return `<div class="phone" style="width:${w + bez * 2}px;padding:${bez}px;border-radius:${58 * k}px;background:#16181C;
      box-shadow:inset 0 0 0 ${1.5 * k}px #4A4E55, inset 0 0 0 ${4 * k}px #0E0F11">
    <div style="position:relative;width:${w}px;height:${screenH}px;border-radius:${47 * k}px;overflow:hidden;background:${bg}">
      <div style="height:${status}px;display:flex;align-items:center;justify-content:space-between;padding:0 ${30 * k}px 0 ${42 * k}px;color:${ink};font-size:${15.5 * k}px;font-weight:650">
        <span>9:41</span>
        <span style="display:flex;gap:${5 * k}px;align-items:center">
          <svg width="${17 * k}" height="${11 * k}" viewBox="0 0 17 11" fill="${ink}"><rect x="0" y="7" width="3" height="4" rx="1"/><rect x="4.6" y="5" width="3" height="6" rx="1"/><rect x="9.2" y="2.6" width="3" height="8.4" rx="1"/><rect x="13.8" y="0" width="3" height="11" rx="1"/></svg>
          <svg width="${16 * k}" height="${11 * k}" viewBox="0 0 16 11.5" fill="${ink}"><path d="M8 2.3c2.3 0 4.4.9 6 2.4l1.2-1.2C13.3 1.6 10.8.6 8 .6S2.7 1.6.8 3.5L2 4.7c1.6-1.5 3.7-2.4 6-2.4zm0 3.4c1.4 0 2.7.5 3.6 1.4l1.2-1.2C11.5 4.7 9.8 4 8 4s-3.5.7-4.8 1.9l1.2 1.2C5.3 6.2 6.6 5.7 8 5.7zm0 3.3c.6 0 1.1.2 1.5.6L8 11.1 6.5 9.6c.4-.4.9-.6 1.5-.6z"/></svg>
          <svg width="${26 * k}" height="${12 * k}" viewBox="0 0 26 12"><rect x=".5" y=".5" width="22" height="11" rx="3.2" fill="none" stroke="${ink}" stroke-opacity=".4"/><rect x="2" y="2" width="16" height="8" rx="2" fill="${ink}"/><path d="M24 4v4c.8-.3 1.3-1.1 1.3-2S24.8 4.3 24 4z" fill="${ink}" fill-opacity=".45"/></svg>
        </span>
      </div>
      <div style="position:absolute;left:50%;top:${11 * k}px;width:${120 * k}px;height:${35 * k}px;margin-left:${-60 * k}px;border-radius:${20 * k}px;background:#000"></div>
      <img src="${src}" style="display:block;width:${w}px;height:${844 * k}px">
      <div style="position:absolute;left:50%;bottom:${7 * k}px;width:${134 * k}px;height:${5 * k}px;margin-left:${-67 * k}px;border-radius:3px;background:${ink};opacity:.85"></div>
    </div>
  </div>`;
}

// ------------------------------------------------------------------ renderer
let browser;
async function render(name, html, { dpr = 2, width = 1600, height = 1200 } = {}) {
  if (ONLY.length && !ONLY.some((o) => name.startsWith(o))) return;
  const file = path.join(TMP, name + '.html');
  fs.writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body><div id="root">${html}</div></body></html>`);
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: dpr });
  await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  const bad = await page.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.src));
  if (bad.length) throw new Error(`${name}: missing images ${bad.join(', ')}`);
  const el = await page.$('#root');
  await el.screenshot({ path: path.join(OUT, name + '.png'), omitBackground: true });
  await page.close();
  console.log('wrote', name + '.png');
}

// ------------------------------------------------------------------ 1. hero banner
function hero(theme) {
  const t = T[theme];
  const big = ringSvg(620, 30, 1, t.primary, t.ringTrack, `style="position:absolute;left:600px;top:-70px;opacity:${theme === 'dark' ? 0.18 : 0.12}"`);
  const mark = ringSvg(92, 10, 0.86, t.primary, t.ringTrack);
  const pill = (txt, fg, bg) => `<span class="rnd" style="display:inline-flex;align-items:center;border-radius:999px;padding:9px 18px;font-weight:600;font-size:19px;color:${fg};background:${bg}">${txt}</span>`;
  return `<div style="position:relative;width:1200px;height:480px;border-radius:36px;overflow:hidden;background:${t.card};color:${t.ink}">
    ${big}
    <div style="position:absolute;left:68px;top:64px;width:600px">
      <div style="display:flex;align-items:center;gap:22px">
        <div style="position:relative;width:92px;height:92px;flex:none">${mark}
          <div class="rnd" style="position:absolute;inset:0;display:grid;place-items:center;font-weight:700;font-size:29px;letter-spacing:-.5px">86</div></div>
        <div class="rnd" style="font-size:92px;line-height:1;font-weight:650;letter-spacing:-2.5px">JPortal</div>
      </div>
      <div class="rnd" style="margin-top:14px;font-size:50px;line-height:1.05;font-weight:650;letter-spacing:-1px;color:${t.primary}">for iOS <span style="font-size:22px;letter-spacing:0;font-weight:600;color:${t.muted};vertical-align:middle;border:1.5px solid ${t.outline};border-radius:999px;padding:5px 14px;margin-left:8px">unofficial</span></div>
      <div style="margin-top:22px;font-size:23px;line-height:1.42;color:${t.muted};width:540px">Attendance, marks and exams from the JIIT webportal, on your iPhone. JPortal for Android's screens, in Safari.</div>
      <div style="margin-top:26px;display:flex;gap:10px;flex-wrap:wrap">
        ${pill('Can miss 3', t.good, t.goodC)}${pill('Attend the next 9', t.bad, t.badC)}${pill('no server', t.ink, t.card2)}
      </div>
    </div>
    <div style="position:absolute;left:890px;top:92px;transform:scale(.7);transform-origin:0 0">${phone(app('overview', theme), theme)}</div>
    <div style="position:absolute;left:690px;top:44px;transform:scale(.7);transform-origin:0 0">${phone(app('attendance', theme), theme)}</div>
  </div>`;
}

// the big "install" button the readme links to the raw script
function installButton(theme, label = 'Install JPortal for iOS') {
  const t = T[theme];
  const ring = ringSvg(34, 5, 1, t.onPrimary, 'transparent');
  return `<div style="padding:6px"><div class="rnd" style="display:inline-flex;align-items:center;gap:14px;height:64px;padding:0 30px 0 18px;border-radius:999px;background:${t.primary};color:${t.onPrimary};font-size:23px;font-weight:650;letter-spacing:-.2px">
    <span style="position:relative;width:34px;height:34px">${ring}
      <svg width="16" height="16" viewBox="0 0 16 16" style="position:absolute;left:9px;top:9px"><path d="M8 2v9M4 7.5 8 11.5l4-4" fill="none" stroke="${t.onPrimary}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    ${label}</div></div>`;
}

// the three "get started" guides are <details>; these cards are their <summary>, so they read as
// buttons. GitHub can't style a summary, an image is the only way to make it stand out.
const GUIDES = {
  'guide-1-install': { n: 1, title: 'Install it', sub: 'First time on this iPhone? About 5 minutes.', tag: 'Start here', accent: 'primary' },
  'guide-2-home': { n: 2, title: 'Open it like an app', sub: 'Add it to your Home Screen. One minute.', tag: 'One tap', accent: 'good' },
  'guide-3-fix': { n: 3, title: "Something's wrong?", sub: 'Update to the latest version, and quick fixes.', tag: 'Fixes', accent: 'bad' },
};
function guideCard(theme, { n, title, sub, tag, accent }) {
  const t = T[theme];
  const a = t[accent], aC = { primary: t.halo, good: t.goodC, bad: t.badC }[accent];
  const ring = ringSvg(58, 6, 1, a, 'transparent');
  return `<div style="padding:4px"><div style="display:flex;align-items:center;gap:18px;width:720px;height:112px;padding:0 26px 0 22px;border-radius:30px;background:${t.card};color:${t.ink};box-shadow:inset 0 0 0 2px ${a}">
    <div style="position:relative;flex:none;width:58px;height:58px">${ring}
      <div class="rnd" style="position:absolute;inset:0;display:grid;place-items:center;font-size:25px;font-weight:700;color:${a}">${n}</div></div>
    <div style="flex:1;min-width:0">
      <div class="rnd" style="font-size:27px;line-height:1.15;font-weight:650;letter-spacing:-.4px">${title}</div>
      <div style="margin-top:4px;font-size:17px;color:${t.muted}">${sub}</div>
    </div>
    <span class="rnd" style="flex:none;border-radius:999px;padding:7px 15px;font-size:15px;font-weight:650;color:${a};background:${aC}">${tag}</span>
    <svg width="22" height="22" viewBox="0 0 22 22" style="flex:none"><path d="M6 8.5l5 5 5-5" fill="none" stroke="${t.muted}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </div></div>`;
}

// ------------------------------------------------------------------ 2. framed app screens
const SCREENS = ['attendance', 'subject', 'overview', 'calculator', 'marks', 'exams', 'subjects', 'me'];

// ------------------------------------------------------------------ 3. tutorial step cards
// a panel crops a real 1170x2532 screenshot. all coordinates are in the screenshot's own pixels.
//   covers: opaque blocks over anything private, drawn before the png is written
//   rings:  highlight around the control to tap; callouts: bubble with a pointer
function panel(p, t, width) {
  const [cx, cy, cw, ch] = p.crop;
  const k = width / cw;
  const box = (x, y, w, h) => `left:${(x - cx) * k}px;top:${(y - cy) * k}px;width:${w * k}px;height:${h * k}px`;
  // opaque cover; draws `rows` skeleton rows so it reads as "hidden list items", not a glitch
  const covers = (p.covers || []).map((c) => {
    const rows = Array.from({ length: c.rows || 1 }, (_, i) => `<div style="flex:1;display:flex;align-items:center;gap:14px;padding:0 22px;${i ? `border-top:1px solid ${c.line || 'rgba(255,255,255,.08)'}` : ''}">
        <div style="width:30px;height:30px;border-radius:8px;background:${c.fg};opacity:.25"></div>
        <div style="width:${[46, 34, 40][i % 3]}%;height:12px;border-radius:6px;background:${c.fg};opacity:.2"></div></div>`).join('');
    return `<div style="position:absolute;${box(c.x, c.y, c.w, c.h)};background:${c.bg};border-radius:${c.rr || 0};display:flex;flex-direction:column">${rows}</div>`;
  }).join('');
  const label = p.coverLabel ? `<div class="rnd" style="position:absolute;${box(...p.coverLabel.at, 1, 1)};width:auto;height:auto;transform:translate(-50%,-50%);white-space:nowrap;font-size:13px;font-weight:600;color:${p.coverLabel.fg};background:${p.coverLabel.bg};padding:5px 12px;border-radius:999px">${p.coverLabel.text}</div>` : '';
  const rings = (p.rings || []).map((r) => {
    const pad = (r.pad ?? 14);
    return `<div style="position:absolute;${box(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2)};border-radius:${(r.r ?? 30) * k + 6}px;border:3.5px solid ${t.primary};box-shadow:0 0 0 7px ${t.halo}, 0 0 22px ${t.halo}"></div>`;
  }).join('');
  const callouts = (p.callouts || []).map((c) => {
    const x = (c.x - cx) * k, y = (c.y - cy) * k;
    const up = c.dir !== 'down';
    const tf = c.align === 'right' ? 'translateX(-100%)' : c.align === 'left' ? 'none' : 'translateX(-50%)';
    const arrowX = c.align === 'right' ? 'right:22px' : c.align === 'left' ? 'left:22px' : 'left:50%;margin-left:-8px';
    return `<div style="position:absolute;left:${x}px;top:${y}px;transform:${tf} ${up ? '' : 'translateY(-100%)'}">
      <div style="position:relative;background:${t.primary};color:${t.onPrimary};font-size:15.5px;font-weight:650;line-height:1.25;padding:10px 15px;border-radius:16px;white-space:nowrap;box-shadow:0 6px 18px rgba(0,0,0,.25)" class="rnd">${c.text}
        <div style="position:absolute;${arrowX};${up ? 'top:-7px' : 'bottom:-7px'};width:16px;height:16px;background:${t.primary};transform:rotate(45deg);border-radius:3px"></div>
      </div></div>`;
  }).join('');
  return `<div style="position:relative;width:${width}px;height:${ch * k}px;overflow:hidden;border-radius:${p.radius ?? 22}px;outline:1px solid ${t.outline}">
    <img src="${p.src}" style="position:absolute;left:${-cx * k}px;top:${-cy * k}px;width:${1170 * k}px;height:${2532 * k}px">
    ${covers}${label}${rings}${callouts}
  </div>`;
}

function stepCard(theme, { n, title, sub, panels, note, width = 440, tag }) {
  const t = T[theme];
  const inner = width - 40;
  const body = panels.map((p) => {
    if (p.gap) return `<div style="text-align:center;color:${t.muted};font-size:14px;font-weight:600;margin:10px 0" class="rnd">${p.gap}</div>`;
    if (p.html) return p.html(t, inner);
    return panel(p, t, inner);
  }).join('');
  return `<div style="width:${width}px;padding:22px 20px 20px;border-radius:32px;background:${t.card};color:${t.ink}">
    <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:16px">
      ${n != null ? `<div class="rnd" style="flex:none;width:42px;height:42px;border-radius:50%;background:${t.primary};color:${t.onPrimary};display:grid;place-items:center;font-size:22px;font-weight:700">${n}</div>` : ''}
      <div style="padding-top:${n != null ? 1 : 0}px">
        <div class="rnd" style="font-size:21px;line-height:1.2;font-weight:650">${title}</div>
        ${sub ? `<div style="margin-top:3px;font-size:14.5px;line-height:1.35;color:${t.muted}">${sub}</div>` : ''}
      </div>
    </div>
    ${body}
    ${note || tag ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:12px">
      <div style="font-size:14px;line-height:1.35;color:${t.muted}">${note || ''}</div>
      ${tag ? `<div style="flex:none;font-size:12px;font-weight:600;color:${t.muted};border:1px solid ${t.outline};border-radius:999px;padding:3px 10px">${tag}</div>` : ''}
    </div>` : ''}
  </div>`;
}

// iOS dark grouped-list colours, for covering rows in the dark Settings screenshots
const IOS_ROW = '#1C1C1E';

// ---- step 1: App Store (illustration; icon cropped from the user's real Userscripts screenshot)
const iconCrop = (size) => `<div style="width:${size}px;height:${size}px;border-radius:${size * 0.225}px;overflow:hidden;position:relative;flex:none;box-shadow:0 0 0 1px rgba(0,0,0,.08)">
  <img src="${shot(7959)}" style="position:absolute;width:${1170 * (size / 304)}px;left:${-433 * (size / 304)}px;top:${-783 * (size / 304)}px"></div>`;
function appStore(t, w) {
  // light iOS look regardless of card theme: it's an illustration of the App Store page
  const d = t === T.dark;
  const bg = d ? '#000' : '#FFF', ink = d ? '#FFF' : '#000', sub = d ? '#98989F' : '#6E6E73', blue = '#0A84FF';
  return `<div style="width:${w}px;border-radius:22px;overflow:hidden;background:${bg};color:${ink};outline:1px solid ${t.outline};font-family:-apple-system,'SF Pro Text','JP Sans Flex',sans-serif">
    <div style="display:flex;align-items:center;gap:8px;padding:14px 16px 10px;font-size:15px;color:${blue}">
      <svg width="11" height="18" viewBox="0 0 11 18"><path d="M9.5 1.5 2 9l7.5 7.5" fill="none" stroke="${blue}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg> Search</div>
    <div style="display:flex;gap:16px;padding:6px 18px 20px">
      ${iconCrop(112)}
      <div style="flex:1;display:flex;flex-direction:column;justify-content:space-between;padding:2px 0">
        <div><div style="font-size:22px;font-weight:700;letter-spacing:-.3px">Userscripts</div>
        <div style="font-size:14.5px;color:${sub};margin-top:2px">Safari extension</div></div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span id="get" style="position:relative;background:${blue};color:#fff;font-weight:700;font-size:15px;border-radius:999px;padding:6px 22px">Get
            <span style="position:absolute;inset:-9px;border-radius:999px;border:3.5px solid ${t.primary};box-shadow:0 0 0 7px ${t.halo}"></span></span>
        </div>
      </div>
    </div>
    <div style="display:flex;border-top:1px solid ${d ? '#2C2C2E' : '#E5E5EA'};padding:12px 8px 14px;text-align:center;font-size:12px;color:${sub}">
      <div style="flex:1"><div style="font-weight:700;font-size:16px;color:${sub}">Free</div>price</div>
      <div style="flex:1;border-left:1px solid ${d ? '#2C2C2E' : '#E5E5EA'}"><div style="font-weight:700;font-size:16px;color:${sub}">Open</div>source</div>
      <div style="flex:1;border-left:1px solid ${d ? '#2C2C2E' : '#E5E5EA'}"><div style="font-weight:700;font-size:16px;color:${sub}">Safari</div>extension</div>
    </div>
  </div>`;
}

// ---- install step: the Userscripts popup on the raw script page (illustration).
// wording from the Userscripts source (v4.8.6 App.svelte / InstallView.svelte), colours sampled from
// the user's real popup screenshot. not a screenshot: we haven't seen this screen on a phone yet.
function popupInstall(t, w) {
  const sheet = '#2F3236', line = '#45484E', sub = '#A1A4AA', blue = '#74B1EB';
  const font = "font-family:-apple-system,'SF Pro Text','JP Sans Flex',sans-serif";
  const ring = `<span style="position:absolute;inset:-8px;border-radius:16px;border:3.5px solid ${t.primary};box-shadow:0 0 0 7px ${t.halo}"></span>`;
  const head = `<div style="text-align:center;font-weight:700;font-size:17px;padding:16px 0 12px">Userscripts</div>`;
  const a = `<div style="width:${w}px;border-radius:22px;background:${sheet};color:#fff;${font};outline:1px solid ${t.outline};padding:0 0 18px">
      ${head}
      <div style="margin:4px 18px 0;position:relative;border-radius:10px;background:${blue};color:#14212F;font-weight:650;font-size:15px;padding:11px 14px;text-align:center">Userscript Detected: Tap to install${ring}</div>
    </div>`;
  const b = `<div style="width:${w}px;border-radius:22px;background:${sheet};color:#fff;${font};outline:1px solid ${t.outline};padding:0 18px 18px">
      <div style="text-align:center;font-weight:700;font-size:17px;padding:16px 0 12px">Install Userscript</div>
      <div style="font-weight:650;font-size:16px">JPortal for iOS (unofficial)</div>
      <div style="font-size:13px;color:${sub};margin-top:4px;line-height:1.4">@match https://webportal.jiit.ac.in/*</div>
      <div style="font-size:13px;color:${sub};margin-top:10px;line-height:1.4;border-top:1px solid ${line};padding-top:10px">Be sure you trust the author before installing…</div>
      <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:14px">
        <span style="padding:8px 16px;font-weight:600;font-size:15px;color:${sub}">Cancel</span>
        <span style="position:relative;padding:8px 22px;border-radius:10px;background:${blue};color:#14212F;font-weight:700;font-size:15px">Install${ring}</span>
      </div>
    </div>`;
  return a + `<div class="rnd" style="text-align:center;color:${t.muted};font-size:14px;font-weight:600;margin:10px 0">then</div>` + b;
}

function framed(theme, name, w) { return () => `<div style="display:flex;justify-content:center">${phone(app(name, theme), theme, { w })}</div>`; }

const STEPS = (theme) => {
  const t = T[theme];
  return {
    'step-1-get-userscripts': {
      n: 1, title: 'Get Userscripts', sub: 'Free and open source, from the App Store.',
      panels: [{ html: (tt, w) => appStore(tt, w) }],
      note: 'It runs little scripts like this one inside Safari.', tag: 'illustration',
    },
    'step-2-pick-folder': {
      n: 2, title: 'Open it once, pick a folder', sub: 'Userscripts keeps your scripts in a folder you choose.',
      panels: [
        { src: shot(7959), crop: [40, 1120, 1090, 700], rings: [{ x: 227, y: 1523, w: 719, h: 119, r: 8, pad: 10 }] },
        { gap: 'pick any folder (the suggested one is fine), then' },
        { src: shot(7960), crop: [40, 150, 1090, 380], rings: [{ x: 900, y: 222, w: 224, h: 127, r: 63, pad: 8 }] },
      ],
    },
    'step-3-turn-it-on': {
      n: 3, title: 'Turn it on in Safari', sub: 'Settings › Apps › Safari › Extensions<br>(older iOS: Settings › Safari › Extensions)',
      panels: [{
        src: shot(7961), crop: [40, 360, 1090, 970],
        covers: [{ x: 50, y: 470, w: 1074, h: 674, bg: IOS_ROW, fg: '#8E8E93', rr: '50px 50px 0 0', rows: 3 }],
        coverLabel: { at: [840, 807], text: 'your other extensions', fg: '#C7C7CC', bg: '#2C2C2E' },
        rings: [{ x: 60, y: 1150, w: 1054, h: 160, r: 30, pad: 6 }],
      }],
      note: 'Tap <b>Userscripts</b>, then switch on <b>Allow Extension</b>.',
    },
    'step-4-allow-websites': {
      n: 4, title: 'Let it run on websites', sub: 'Same screen, Userscripts settings.',
      panels: [
        { src: shot(7962), crop: [40, 680, 1090, 350], rings: [{ x: 890, y: 722, w: 196, h: 92, r: 46, pad: 10 }] },
        { gap: 'further down, under Permissions' },
        { src: shot(7962), crop: [40, 2120, 1090, 330], rings: [{ x: 70, y: 2160, w: 1030, h: 150, r: 24, pad: 4 }],
          callouts: [{ x: 1060, y: 2330, text: 'tap, set to Allow', align: 'right' }] },
      ],
      note: 'This one still says <b>Ask</b>. Change it to <b>Allow</b>, or JPortal can\'t run.',
    },
    'step-5-install': {
      n: 5, title: 'Install JPortal', sub: 'Open the install link in Safari, then the Userscripts menu.',
      panels: [
        { src: shot(7964), crop: [70, 1800, 1030, 500],
          covers: [{ x: 72, y: 2125, w: 1026, h: 165, bg: '#464646', fg: '#C7C7CC', rr: '0 0 40px 40px' }],
          rings: [{ x: 90, y: 1980, w: 990, h: 125, r: 20, pad: 6 }] },
        { gap: 'page icon (left of the address) › Userscripts' },
        { html: (tt, w) => popupInstall(tt, w) },
      ],
      tag: 'popup: illustration',
    },
    'step-file': {
      n: null, title: 'Or: save the file yourself', sub: 'Put jportal.user.js in the folder from step 2.',
      panels: [{ src: shot(7960), crop: [40, 150, 1090, 1110],
        rings: [{ x: 440, y: 590, w: 300, h: 480, r: 26, pad: 12 }],
        callouts: [{ x: 590, y: 1110, text: 'jportal.user.js', align: 'center' }] }],
      note: 'Download it, Share › Save to Files, pick that folder.',
    },
    'step-6-sign-in': {
      n: 6, title: 'Sign in to the portal', sub: 'In Safari, with Google, like always.',
      panels: [
        { src: shot(7963), crop: [40, 240, 1090, 820], rings: [{ x: 202, y: 756, w: 582, h: 118, r: 10, pad: 10 }],
          callouts: [{ x: 495, y: 905, text: 'Student, then tap', align: 'center' }] },
        { gap: 'webportal.jiit.ac.in:6011/studentportal' },
        { src: shot(7963), crop: [70, 2270, 1030, 180], radius: 40 },
      ],
    },
    'step-7-jportal': {
      n: 7, title: 'JPortal takes over', sub: 'Right after the portal signs you in.',
      panels: [{ html: framed(theme, 'attendance', 300) }],
      tag: 'preview, demo data',
    },
    // home screen icon. 8284/8285 are taken over the user's real attendance: crops keep only the
    // menus, and the share sheet's own app rows are cut off below Add to Home Screen.
    'home-1-share': {
      n: 1, title: 'Open ••• and tap Share', sub: 'On the portal in Safari, signed in.',
      panels: [
        { src: shot(8272), crop: [70, 2270, 1030, 180], radius: 40, rings: [{ x: 935, y: 2300, w: 130, h: 130, r: 65, pad: 8 }] },
        { gap: 'then' },
        { src: shot(8284), crop: [330, 1450, 760, 990], rings: [{ x: 380, y: 1492, w: 670, h: 96, r: 30, pad: 6 }] },
      ],
    },
    'home-2-add': {
      n: 2, title: 'Tap Add to Home Screen', sub: 'Scroll down the share sheet to find it.',
      panels: [{ src: shot(8285), crop: [48, 875, 1076, 860], rings: [{ x: 60, y: 1566, w: 1052, h: 146, r: 30, pad: 4 }] }],
    },
    'home-3-name': {
      n: 3, title: 'Web App off, name it, Add', sub: 'Then open JPortal from your Home Screen.',
      panels: [{
        src: shot(8286), crop: [0, 170, 1170, 980],
        rings: [
          { x: 272, y: 462, w: 864, h: 92, r: 16, pad: 6 },
          { x: 935, y: 886, w: 186, h: 82, r: 41, pad: 8 },
          { x: 934, y: 224, w: 186, h: 124, r: 62, pad: 6 },
        ],
        callouts: [
          { x: 640, y: 590, text: 'rename it JPortal', align: 'center' },
          { x: 1120, y: 1000, text: 'switch this off', align: 'right' },
        ],
      }],
      note: 'With it off, the icon opens in Safari, where JPortal runs.',
    },
    'help-check-script': {
      n: null, title: 'Is the script running?', sub: 'If you still see the portal\'s own menu after signing in:',
      panels: [
        { src: shot(7966), crop: [0, 140, 900, 560], callouts: [{ x: 450, y: 600, text: 'this means JPortal didn\'t load', align: 'center', dir: 'down' }] },
        { gap: '1 · tap the page icon, left of the address' },
        { src: shot(7963), crop: [70, 2270, 1030, 180], radius: 40, rings: [{ x: 300, y: 2318, w: 80, h: 90, r: 24, pad: 14 }] },
        { gap: '2 · tap Userscripts' },
        { src: shot(7964), crop: [70, 1800, 1030, 500],
          covers: [{ x: 72, y: 2125, w: 1026, h: 165, bg: '#464646', fg: '#C7C7CC', rr: '0 0 40px 40px' }],
          rings: [{ x: 90, y: 1980, w: 990, h: 125, r: 20, pad: 6 }] },
        { gap: '3 · JPortal for iOS should be in the list' },
        { src: shot(7965), crop: [25, 1210, 1120, 610],
          rings: [{ x: 65, y: 1680, w: 1000, h: 110, r: 20, pad: 8 }] },
      ],
      note: 'This is the “All Userscripts” list (everything installed). Tap ← for the scripts that ran on this page. Not there? Recheck steps 3 and 4.',
    },
  };
};

// ------------------------------------------------------------------ main
browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
  for (const theme of ['light', 'dark']) {
    await render(`hero-${theme}`, hero(theme), { width: 1300, height: 600 });
    await render(`install-button-${theme}`, installButton(theme), { width: 600, height: 200 });
    await render(`get-started-button-${theme}`, installButton(theme, 'Get started'), { width: 600, height: 200 });
    for (const [name, g] of Object.entries(GUIDES)) await render(`${name}-${theme}`, guideCard(theme, g), { width: 800, height: 200 });
    for (const s of SCREENS) {
      await render(`screen-${s}-${theme}`, `<div style="padding:4px">${phone(app(s, theme), theme, { w: 390 })}</div>`, { dpr: 1.25, width: 500, height: 1000 });
    }
    const steps = STEPS(theme);
    for (const [name, def] of Object.entries(steps)) {
      await render(`${name}-${theme}`, stepCard(theme, def), { dpr: 2, width: 600, height: 1800 });
    }
  }
} finally {
  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
}

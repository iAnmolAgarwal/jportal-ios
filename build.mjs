// builds dist/jportal.user.js (install on the iphone) and dist/preview.js (desktop preview on fixtures)
import * as esbuild from 'esbuild';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const header = `// ==UserScript==
// @name         JPortal for iOS (unofficial)
// @namespace    jportal-ios.unofficial
// @version      ${pkg.version}
// @description  JPortal for the JIIT webportal on iPhone: attendance, skip calculator, exams, SGPA/CGPA, marks. Unofficial.
// @match        https://webportal.jiit.ac.in/*
// @include      https://webportal.jiit.ac.in:6011/*
// @run-at       document-start
// @inject-into  page
// @grant        none
// @noframes
// ==/UserScript==
`;
const common = { bundle: true, loader: { '.css': 'text', '.ttf': 'dataurl', '.json': 'json' }, target: ['safari15'], logLevel: 'warning' };
const watch = process.argv.includes('--watch');

const jobs = [
  { ...common, entryPoints: ['src/main.js'], outfile: 'dist/jportal.user.js', format: 'iife', banner: { js: header }, minify: false },
  { ...common, entryPoints: ['src/preview.js'], outfile: 'dist/preview.js', format: 'esm' },
];
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/preview.html', `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>JPortal preview</title><link rel="icon" href="data:,">
<style>@font-face{font-family:'JP Sans Flex';src:url(../src/assets/sans_flex.ttf) format('truetype');font-weight:100 1000}body{margin:0}</style></head><body><script type="module" src="preview.js"></script></body></html>`);
fs.writeFileSync('dist/frame.html', `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#888}iframe{border:0;width:390px;display:block}</style></head><body><script>const f=document.createElement('iframe');f.style.height=(new URLSearchParams(location.search).get('h')||844)+'px';f.src='preview.html'+location.search;document.body.append(f)</script></body></html>`);
if (watch) {
  for (const j of jobs) await (await esbuild.context(j)).watch();
  console.log('watching');
} else {
  await Promise.all(jobs.map((j) => esbuild.build(j)));
  console.log('built', fs.statSync('dist/jportal.user.js').size, 'bytes');
}

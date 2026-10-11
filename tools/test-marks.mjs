// parses every fixtures/marks/*.pdf and deep-compares with the matching *.json
// (ktjiit's MarksParserTest goldens: kotlinx json, defaults left out).
// run: node tools/test-marks.mjs
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { parseMarks, parseScore, MarksParseError } from '../src/core/marks/parser.js';

const dir = new URL('../fixtures/marks/', import.meta.url).pathname;

// fill in what kotlinx.serialization leaves out (encodeDefaults = false)
const STUDENT = ['name', 'enrollmentNo', 'program', 'branch', 'semester', 'registrationCode'];
function normalize(r) {
  return {
    student: Object.fromEntries(STUDENT.map((k) => [k, r.student?.[k] ?? ''])),
    events: r.events,
    subjects: r.subjects.map((s) => ({
      code: s.code,
      name: s.name,
      scores: s.scores.map((e) => ({ event: e.event, marks: e.marks ?? null, weighted: e.weighted ?? null })),
    })),
    generated: r.generated ?? '',
  };
}

let failed = 0;
let passed = 0;
const check = async (name, fn) => {
  try { await fn(); passed++; console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n', e.message.slice(0, 2000)); }
};

const names = fs.readdirSync(dir).filter((f) => f.endsWith('.pdf')).map((f) => path.basename(f, '.pdf')).sort();
for (const name of names) {
  await check(`golden ${name}`, async () => {
    const expected = normalize(JSON.parse(fs.readFileSync(path.join(dir, name + '.json'), 'utf8')));
    const got = await parseMarks(new Uint8Array(fs.readFileSync(path.join(dir, name + '.pdf'))));
    // must survive a localStorage round trip unchanged
    assert.deepStrictEqual(JSON.parse(JSON.stringify(got)), got);
    assert.deepStrictEqual(got, expected);
  });
}

const read = (n) => new Uint8Array(fs.readFileSync(path.join(dir, n + '.pdf')));

await check('absent keeps the zero weightage', async () => {
  const r = await parseMarks(read('ece8-absent'));
  const s = r.subjects.find((x) => x.code === '15B1NHS832').scores.find((x) => x.event === 'T2-2026EVEN-20MARKS');
  assert.deepStrictEqual(s.marks, { type: 'absent' });
  assert.deepStrictEqual(s.weighted, { type: 'value', obtained: 0, max: 20 });
});

await check('wrapped header and first row survive', async () => {
  const r = await parseMarks(read('cse3-nine-events-wrapped'));
  assert.equal(r.events.length, 9);
  assert.ok(r.events.includes('MIDTR-25ODD-30 MARKS'));
  assert.equal(r.subjects[0].code, '15B11CI311');
});

await check('no data pdf is an empty report', async () => {
  const r = await parseMarks(read('empty'));
  assert.ok(r.subjects.length === 0 && r.events.length === 0);
});

await check('garbage is rejected', async () => {
  await assert.rejects(parseMarks(new TextEncoder().encode('not a pdf at all')), MarksParseError);
});

await check('score formats', () => {
  assert.deepStrictEqual(parseScore('15/ 40'), { type: 'value', obtained: 15, max: 40 });
  assert.deepStrictEqual(parseScore(' 15.5/20.0 '), { type: 'value', obtained: 15.5, max: 20 });
  assert.deepStrictEqual(parseScore('-'), { type: 'na' });
  assert.deepStrictEqual(parseScore('A'), { type: 'absent' });
  assert.equal(parseScore('  '), null);
  assert.deepStrictEqual(parseScore('W'), { type: 'other', raw: 'W' });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

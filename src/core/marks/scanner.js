// a port of ktjiit's marks/ContentScanner.kt. walks a content stream keeping
// just the ctm, text matrices and rectangles. fonts are all standard 14 with
// WinAnsi here so glyph widths never matter: runs are placed by their start
// point and cells come from the drawn rects.

import { Lexer, NULL, isKw } from './pdf.js';

/** a run of text drawn from one text position, in page space: { x, y, text, size } */
/** a stroked or filled rectangle, normalized so w and h are positive: { x, y, w, h } */

// [a b c d e f]
const IDENTITY = [1, 0, 0, 1, 0, 0];
const translate = (x, y) => [1, 0, 0, 1, x, y];
const times = (p, m) => [
  p[0] * m[0] + p[1] * m[2], p[0] * m[1] + p[1] * m[3],
  p[2] * m[0] + p[3] * m[2], p[2] * m[1] + p[3] * m[3],
  p[4] * m[0] + p[5] * m[2] + m[4], p[4] * m[1] + p[5] * m[3] + m[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

// 0x80..0x9f, the only range that differs from latin-1
const HIGH = [
  '€', '�', '‚', 'ƒ', '„', '…', '†', '‡',
  'ˆ', '‰', 'Š', '‹', 'Œ', '�', 'Ž', '�',
  '�', '‘', '’', '“', '”', '•', '–', '—',
  '˜', '™', 'š', '›', 'œ', '�', 'ž', 'Ÿ',
];

export function winAnsi(bytes) {
  let s = '';
  for (const v of bytes) {
    if (v >= 0x80 && v <= 0x9f) s += HIGH[v - 0x80];
    else if (v === 0xa0) s += ' ';
    else s += String.fromCharCode(v);
  }
  return s;
}

/** content stream bytes -> { runs, rects } */
export function scan(content) {
  const runs = [];
  const rects = [];
  const lx = new Lexer(content);
  const operands = [];
  const stack = [];
  let ctm = IDENTITY;
  let tm = IDENTITY;
  let tlm = IDENTITY;
  let leading = 0;
  let fontSize = 0;
  // set when a positioning op ran, so back to back Tj calls glue together
  let fresh = true;

  const n = (i) => (operands[i] && operands[i].t === 'num' ? operands[i].v : 0);
  const last = () => operands[operands.length - 1];

  const moveLine = (tx, ty) => {
    tlm = times(translate(tx, ty), tlm);
    tm = tlm;
    fresh = true;
  };

  const show = (bytes) => {
    const s = winAnsi(bytes);
    if (!fresh && runs.length) {
      const prev = runs.pop();
      runs.push({ ...prev, text: prev.text + s });
    } else {
      const [x, y] = apply(times(tm, ctm), 0, 0);
      runs.push({ x, y, text: s, size: fontSize * Math.abs(tm[3]) });
    }
    fresh = false;
  };

  for (;;) {
    const t = lx.next();
    if (!t) break;
    if (t.t !== 'kw') { operands.push(t); continue; }
    switch (t.v) {
      case '[': {
        const items = [];
        for (;;) {
          const x = lx.next();
          if (!x || isKw(x, ']')) break;
          items.push(x);
        }
        operands.push({ t: 'array', items });
        continue;
      }
      case '<<': { // inline dict operand (BDC props), not needed
        let depth = 1;
        while (depth > 0) {
          const x = lx.next();
          if (!x) break;
          if (isKw(x, '<<')) depth++;
          if (isKw(x, '>>')) depth--;
        }
        operands.push(NULL);
        continue;
      }
      case 'q': stack.push(ctm); break;
      case 'Q': ctm = stack.length ? stack.pop() : IDENTITY; break;
      case 'cm': ctm = times([n(0), n(1), n(2), n(3), n(4), n(5)], ctm); break;
      case 're': {
        const [x0, y0] = apply(ctm, n(0), n(1));
        const [x1, y1] = apply(ctm, n(0) + n(2), n(1) + n(3));
        rects.push({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
        break;
      }
      case 'BT': tm = IDENTITY; tlm = IDENTITY; fresh = true; break;
      case 'ET': fresh = true; break;
      case 'Tf': fontSize = n(1); break;
      case 'TL': leading = n(0); break;
      case 'Tm':
        tlm = [n(0), n(1), n(2), n(3), n(4), n(5)];
        tm = tlm;
        fresh = true;
        break;
      case 'Td': moveLine(n(0), n(1)); break;
      case 'TD': leading = -n(1); moveLine(n(0), n(1)); break;
      case 'T*': moveLine(0, -leading); break;
      case 'Tj': { const s = last(); if (s && s.t === 'str') show(s.bytes); break; }
      case "'":
      case '"': { moveLine(0, -leading); const s = last(); if (s && s.t === 'str') show(s.bytes); break; }
      case 'TJ': {
        const arr = last();
        if (arr && arr.t === 'array') {
          const out = [];
          for (const item of arr.items) {
            if (item.t === 'str') out.push(...item.bytes);
            // a big negative kern is how some writers fake a space
            else if (item.t === 'num' && item.v < -200) out.push(32);
          }
          show(out);
        }
        break;
      }
      case 'BI': skipInlineImage(lx); break;
      default: break;
    }
    operands.length = 0;
  }
  return { runs, rects };
}

function skipInlineImage(lx) {
  for (;;) {
    const t = lx.next();
    if (!t) return;
    if (isKw(t, 'ID')) break;
  }
  for (;;) {
    const t = lx.next();
    if (!t) return;
    if (isKw(t, 'EI')) return;
  }
}

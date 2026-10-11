// a port of ktjiit's marks/PdfReader.kt: just enough pdf to pull page content
// streams out of iText output. classic xref-less object scan, no object
// streams, no encryption, flate only (via DecompressionStream).
//
// objects are plain tagged values:
//   { t: 'num', v } { t: 'name', v } { t: 'str', bytes } { t: 'array', items }
//   { t: 'dict', map: Map } { t: 'ref', num, gen } { t: 'bool', v } { t: 'null' }
//   { t: 'kw', v } { t: 'stream', dict, raw }

export class MarksParseError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'MarksParseError';
    if (cause) this.cause = cause;
  }
}

export const NULL = Object.freeze({ t: 'null' });
const num = (v) => ({ t: 'num', v });
const kw = (v) => ({ t: 'kw', v });
export const isKw = (o, v) => !!o && o.t === 'kw' && (v === undefined || o.v === v);
export const dictGet = (d, k) => (d && d.t === 'dict' ? d.map.get(k) : undefined);

const latin1 = (d, start, end) => {
  let s = '';
  for (let i = start; i < end; i++) s += String.fromCharCode(d[i]);
  return s;
};

const OBJ = /(\d+)\s+\d+\s+obj\b/g;
const ENDSTREAM = Uint8Array.from('endstream', (c) => c.charCodeAt(0));
// kotlin's Char.isWhitespace over latin-1
const isWs = (c) => /[\t\n\x0B\f\r\x1C-\x20\x85\xA0]/.test(c);

export class PdfReader {
  constructor(data) {
    this.data = data;
    this.offsets = new Map();
    this.cache = new Map();
    // last definition wins, same as incremental updates
    const text = latin1(data, 0, data.length);
    OBJ.lastIndex = 0;
    let m;
    while ((m = OBJ.exec(text))) {
      const before = m.index === 0 ? '\n' : text[m.index - 1];
      if (isWs(before) || before === '>' || before === ')' || before === ']') {
        this.offsets.set(parseInt(m[1], 10), m.index + m[0].length);
      }
    }
  }

  resolve(o) {
    return o && o.t === 'ref' ? this.obj(o.num) : o;
  }

  obj(n) {
    if (this.cache.has(n)) return this.cache.get(n);
    const at = this.offsets.get(n);
    if (at === undefined) return undefined;
    const data = this.data;
    const lx = new Lexer(data, at);
    const value = lx.readObject();
    if (!value) return undefined;
    let result = value;
    if (value.t === 'dict' && lx.peekKeyword() === 'stream') {
      lx.readKeyword();
      let start = lx.pos;
      if (start < data.length && data[start] === 13) start++;
      if (start < data.length && data[start] === 10) start++;
      const len = this.resolve(dictGet(value, 'Length'));
      const declared = len && len.t === 'num' ? Math.trunc(len.v) : null;
      let end;
      if (declared != null && start + declared <= data.length && this.#looksLikeEnd(start + declared)) {
        end = start + declared;
      } else {
        const i = this.#indexOf(ENDSTREAM, start);
        end = i < 0 ? data.length : this.#trimEol(start, i);
      }
      result = { t: 'stream', dict: value, raw: data.slice(start, end) };
    }
    this.cache.set(n, result);
    return result;
  }

  #looksLikeEnd(at) {
    const d = this.data;
    let i = at;
    while (i < d.length && (d[i] === 13 || d[i] === 10 || d[i] === 32)) i++;
    return this.#startsWith(ENDSTREAM, i);
  }

  #trimEol(start, end) {
    let e = end;
    if (e > start && this.data[e - 1] === 10) e--;
    if (e > start && this.data[e - 1] === 13) e--;
    return e;
  }

  #startsWith(needle, at) {
    const d = this.data;
    if (at + needle.length > d.length) return false;
    for (let k = 0; k < needle.length; k++) if (d[at + k] !== needle[k]) return false;
    return true;
  }

  #indexOf(needle, from) {
    for (let i = from; i <= this.data.length - needle.length; i++) if (this.#startsWith(needle, i)) return i;
    return -1;
  }

  async decode(stream) {
    const f = this.resolve(dictGet(stream.dict, 'Filter'));
    let filters = [];
    if (f && f.t === 'name') filters = [f.v];
    else if (f && f.t === 'array') filters = f.items.map((it) => this.resolve(it)).filter((x) => x && x.t === 'name').map((x) => x.v);
    let bytes = stream.raw;
    for (const name of filters) {
      if (name === 'FlateDecode' || name === 'Fl') bytes = await inflate(bytes);
      else throw new MarksParseError(`unsupported filter ${name}`);
    }
    return bytes;
  }

  /** page dicts in reading order */
  pages() {
    let catalog = null;
    for (const n of [...this.offsets.keys()].sort((a, b) => a - b)) {
      const o = this.obj(n);
      const type = dictGet(o, 'Type');
      if (o && o.t === 'dict' && type && type.t === 'name' && type.v === 'Catalog') { catalog = o; break; }
    }
    if (!catalog) throw new MarksParseError('no catalog');
    const out = [];
    const walk = (node, depth) => {
      if (depth > 32) return;
      const type = dictGet(node, 'Type');
      if (type && type.t === 'name' && type.v === 'Pages') {
        const kids = this.resolve(dictGet(node, 'Kids'));
        if (kids && kids.t === 'array') {
          for (const k of kids.items) {
            const kid = this.resolve(k);
            if (kid && kid.t === 'dict') walk(kid, depth + 1);
          }
        }
      } else out.push(node);
    };
    const root = this.resolve(dictGet(catalog, 'Pages'));
    if (root && root.t === 'dict') walk(root, 0);
    return out;
  }

  async contents(page) {
    const c = this.resolve(dictGet(page, 'Contents'));
    let parts = [];
    if (c && c.t === 'stream') parts = [c];
    else if (c && c.t === 'array') parts = c.items.map((it) => this.resolve(it)).filter((x) => x && x.t === 'stream');
    const chunks = [];
    for (const p of parts) { chunks.push(await this.decode(p)); chunks.push(Uint8Array.of(10)); }
    return concat(chunks);
  }
}

function concat(chunks) {
  let n = 0;
  for (const c of chunks) n += c.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/** zlib inflate. truncated streams still carry usable text, keep what we got */
export async function inflate(input) {
  if (typeof DecompressionStream === 'undefined') throw new MarksParseError('this browser cannot read the marks pdf (needs iOS 16.4+)');
  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  writer.write(input).catch(() => {});
  writer.close().catch(() => {});
  const reader = ds.readable.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
  } catch (e) {
    if (size === 0) throw new MarksParseError('bad flate stream', e);
  }
  return concat(chunks);
}

const isWhite = (c) => c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32;
// ( ) < > [ ] { } / %
const isDelim = (c) => c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37;
const isDigit = (c) => c >= 48 && c <= 57;

/** tokenizer shared by object syntax and content streams */
export class Lexer {
  constructor(d, pos = 0) {
    this.d = d;
    this.pos = pos;
  }

  #ch(i = this.pos) {
    return i < this.d.length ? this.d[i] : -1;
  }

  #skipSpace() {
    const d = this.d;
    while (this.pos < d.length) {
      const c = this.#ch();
      if (isWhite(c)) this.pos++;
      else if (c === 37) { while (this.pos < d.length && this.#ch() !== 10 && this.#ch() !== 13) this.pos++; }
      else break;
    }
  }

  get atEnd() {
    this.#skipSpace();
    return this.pos >= this.d.length;
  }

  peekKeyword() {
    const save = this.pos;
    const t = this.next();
    this.pos = save;
    return t && t.t === 'kw' ? t.v : null;
  }

  readKeyword() {
    const t = this.next();
    return t && t.t === 'kw' ? t.v : null;
  }

  /** one full object, refs folded in */
  readObject() {
    const t = this.next();
    if (!t) return null;
    if (t.t === 'kw') {
      if (t.v === '<<') return this.#readDict();
      if (t.v === '[') return this.#readArray();
      return t;
    }
    if (t.t === 'num') {
      const save = this.pos;
      const g = this.next();
      const r = this.next();
      if (g && g.t === 'num' && r && r.t === 'kw' && r.v === 'R') return { t: 'ref', num: Math.trunc(t.v), gen: Math.trunc(g.v) };
      this.pos = save;
      return t;
    }
    return t;
  }

  #readDict() {
    const m = new Map();
    for (;;) {
      const k = this.readObject();
      if (!k) break;
      if (isKw(k, '>>')) break;
      if (k.t !== 'name') continue;
      const v = this.readObject();
      if (!v) break;
      if (isKw(v, '>>')) break;
      m.set(k.v, v);
    }
    return { t: 'dict', map: m };
  }

  #readArray() {
    const items = [];
    for (;;) {
      const o = this.readObject();
      if (!o) break;
      if (isKw(o, ']')) break;
      items.push(o);
    }
    return { t: 'array', items };
  }

  /** raw token, dict/array brackets come back as keywords */
  next() {
    this.#skipSpace();
    const d = this.d;
    if (this.pos >= d.length) return null;
    const c = this.#ch();
    if (c === 47) { // '/'
      this.pos++;
      let s = '';
      while (this.pos < d.length && !isWhite(this.#ch()) && !isDelim(this.#ch())) {
        if (this.#ch() === 35 && this.pos + 2 < d.length) { // '#'
          const hex = String.fromCharCode(d[this.pos + 1], d[this.pos + 2]);
          if (/^[+-]?[0-9a-fA-F]+$/.test(hex)) { s += String.fromCharCode(parseInt(hex, 16) & 0xffff); this.pos += 3; continue; }
        }
        s += String.fromCharCode(this.#ch());
        this.pos++;
      }
      return { t: 'name', v: s };
    }
    if (c === 40) return { t: 'str', bytes: this.#literal() };
    if (c === 60 && this.#ch(this.pos + 1) === 60) { this.pos += 2; return kw('<<'); }
    if (c === 62 && this.#ch(this.pos + 1) === 62) { this.pos += 2; return kw('>>'); }
    if (c === 60) return { t: 'str', bytes: this.#hex() };
    if (c === 91 || c === 93 || c === 123 || c === 125) { this.pos++; return kw(String.fromCharCode(c)); }
    if (c === 43 || c === 45 || c === 46 || isDigit(c)) return this.#number();
    const start = this.pos;
    while (this.pos < d.length && !isWhite(this.#ch()) && !isDelim(this.#ch())) this.pos++;
    if (this.pos === start) this.pos++;
    const word = latin1(d, start, this.pos);
    if (word === 'true') return { t: 'bool', v: true };
    if (word === 'false') return { t: 'bool', v: false };
    if (word === 'null') return NULL;
    return kw(word);
  }

  #number() {
    const start = this.pos;
    this.pos++;
    while (this.pos < this.d.length && (isDigit(this.#ch()) || this.#ch() === 46)) this.pos++;
    const s = latin1(this.d, start, this.pos);
    // java's parseDouble: optional sign, digits with at most one dot, at least one digit
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return num(Number(s));
    return kw(s);
  }

  #literal() {
    const d = this.d;
    this.pos++;
    const out = [];
    let depth = 1;
    while (this.pos < d.length) {
      const c = this.#ch();
      this.pos++;
      if (c === 40) { depth++; out.push(c); }
      else if (c === 41) { depth--; if (depth === 0) break; out.push(c); }
      else if (c === 92) { // backslash
        const e = this.#ch();
        this.pos++;
        if (e === 110) out.push(10);
        else if (e === 114) out.push(13);
        else if (e === 116) out.push(9);
        else if (e === 98) out.push(8);
        else if (e === 102) out.push(12);
        else if (e === 13) { if (this.#ch() === 10) this.pos++; }
        else if (e === 10) { /* line continuation */ }
        else if (e >= 48 && e <= 55) {
          let v = e - 48;
          for (let k = 0; k < 2; k++) {
            const o = this.#ch();
            if (o >= 48 && o <= 55) { v = v * 8 + (o - 48); this.pos++; }
          }
          out.push(v & 0xff);
        } else if (e >= 0) out.push(e);
      } else out.push(c);
    }
    return Uint8Array.from(out);
  }

  #hex() {
    const d = this.d;
    this.pos++;
    let digits = '';
    while (this.pos < d.length && this.#ch() !== 62) {
      const ch = String.fromCharCode(this.#ch());
      if (/[0-9A-Za-z\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\xFF]/.test(ch)) digits += ch;
      this.pos++;
    }
    this.pos++;
    if (digits.length % 2 === 1) digits += '0';
    const out = new Uint8Array(digits.length / 2);
    for (let i = 0; i < out.length; i++) {
      const v = parseInt(digits.substr(i * 2, 2), 16);
      if (Number.isNaN(v) || !/^[0-9a-fA-F]{2}$/.test(digits.substr(i * 2, 2))) throw new MarksParseError('bad hex string');
      out[i] = v;
    }
    return out;
  }
}

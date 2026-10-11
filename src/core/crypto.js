// the portal's request crypto, ported from ktjiit. aes-128-cbc, a key that
// rotates daily, and an iv that never changes (yes really).

const IV = new TextEncoder().encode('dcek9wb8frty1pnm');
const IST_MS = 330 * 60 * 1000;

/**
 * the 7 char date fingerprint baked into every key and LocalName header:
 * d0 m0 y0 weekday d1 m1 y1, weekday js style (sunday = 0), always in IST.
 */
export function dateSeq(ms) {
  const d = new Date(ms + IST_MS);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(d.getUTCFullYear() % 100).padStart(2, '0');
  return `${dd[0]}${mm[0]}${yy[0]}${d.getUTCDay()}${dd[1]}${mm[1]}${yy[1]}`;
}

const keys = new Map();
function key(ms) {
  const seq = dateSeq(ms);
  if (!keys.has(seq)) {
    const raw = new TextEncoder().encode(`qa8y${seq}ty1pn`);
    keys.set(seq, crypto.subtle.importKey('raw', raw, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']));
  }
  return keys.get(seq);
}

const b64 = (bytes) => {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
};
const unb64 = (s) => Uint8Array.from(atob(s.trim()), (c) => c.charCodeAt(0));

export async function encrypt(plain, ms) {
  const out = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: IV }, await key(ms), new TextEncoder().encode(plain));
  return b64(out);
}

export async function decrypt(encoded, ms) {
  const out = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: IV }, await key(ms), unb64(encoded));
  return new TextDecoder().decode(out);
}

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const noise = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => ALNUM[b % ALNUM.length]).join('');

/** without it the server answers 200 with an empty body */
export const localName = (ms) => encrypt(noise(4) + dateSeq(ms) + noise(5), ms);

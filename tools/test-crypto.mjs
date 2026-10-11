// vectors from ktjiit's CryptoTest (an independent python implementation)
import { dateSeq, encrypt, decrypt, localName } from '../src/core/crypto.js';

const vectors = [
  ['2026-09-23T20:44:33+05:30', '2023396', '0OE33AqLdJLsiqun/b7P0ebzcZlU9Zex+WARnofRJmk='],
  ['2026-09-20T23:59:59+05:30', '2020096', '6OcujOtkGhS78wcGcPqDz/SQLWnIHprl1x2aIuWVdq8='],
  ['2026-09-20T18:30:00+00:00', '2021196', 'NFduuMZDQ4pnjC6rENqxPC3BIz9Ss0uI1lxVmttCoNg='],
  ['2027-01-01T00:00:00+05:30', '0025117', 'QaE6RaKmOSXveL+WS5Yjun1r6o39jDJ10IwjB69Hk2Q='],
];
let fail = 0;
for (const [at, seq, cipher] of vectors) {
  const ms = Date.parse(at);
  const got = [dateSeq(ms), await encrypt('{"instituteid":"TEST"}', ms), await decrypt(cipher, ms)];
  const ok = got[0] === seq && got[1] === cipher && got[2] === '{"instituteid":"TEST"}';
  if (!ok) fail++;
  console.log(ok ? 'ok  ' : 'FAIL', at, got.join(' '));
}
const t = Date.now();
const ln = await decrypt(await localName(t), t);
console.log(ln.length === 16 && ln.slice(4, 11) === dateSeq(t) ? 'ok   localName' : (fail++, 'FAIL localName'));
process.exit(fail ? 1 : 0);

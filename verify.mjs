// Headless check of sizing.js against the measured benchmark values and a few sanity cases.
import { readFileSync } from 'node:fs';

const els = {};
function el(id) {
  if (!els[id]) els[id] = { innerHTML: '', textContent: '', value: '', addEventListener() {} };
  return els[id];
}
globalThis.document = { getElementById: el };

el('n').value = '50';
el('engine').value = 'oracle';
el('headroom').value = '1.5';
el('family').value = 'any';

const src = readFileSync(new URL('./sizing.js', import.meta.url), 'utf8');
const run = new Function('document', src + '\n;return { update, MODEL, shortlist, AWS, AZURE };');
const api = run(globalThis.document);

let fails = 0;
const check = (label, actual, expected) => {
  const ok = Math.abs(actual - expected) < 0.51;
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: ${actual} (expected ${expected})`);
};

console.log('model reproduces the measured runs');
for (const n of [50, 200]) {
  check(`N=${n} peak CPU mc`, api.MODEL.peakCpuMc(n), api.MODEL.measured[n].peakCpuMc);
  check(`N=${n} peak RSS MiB`, api.MODEL.peakRssMiB(n), api.MODEL.measured[n].peakRssMiB);
}

console.log('\nshortlist picks the smallest instance that fits');
const pick = (cat, vcpu, gib) => api.shortlist(cat, vcpu, gib, 'any')[0];
const p1 = pick(api.AWS, 3, 2.28);
console.log(`  N=100 -> AWS ${p1.name} (${p1.vcpu} vCPU / ${p1.gib} GiB)`);
check('covers vCPU', p1.vcpu >= 3 ? 1 : 0, 1);
check('covers memory', p1.gib >= 2.28 ? 1 : 0, 1);
const p2 = pick(api.AZURE, 3, 2.28);
console.log(`  N=100 -> Azure ${p2.name} (${p2.vcpu} vCPU / ${p2.gib} GiB)`);
check('covers vCPU', p2.vcpu >= 3 ? 1 : 0, 1);

console.log('\nrendered output at N=100, 1.5x headroom');
el('n').value = '100';
api.update();
const req = els['req'].innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
console.log('  ' + req);
check('shows 1651 mc', /1651/.test(req) ? 1 : 0, 1);
check('shows 1555 MiB', /1555/.test(req) ? 1 : 0, 1);

console.log('\nvalidity notes fire outside the fitted range');
for (const [n, expect] of [[10, 'stop'], [100, ''], [500, 'warn']]) {
  el('n').value = String(n);
  api.update();
  const html = els['validity'].innerHTML;
  const got = /note stop/.test(html) ? 'stop' : /note warn/.test(html) ? 'warn' : '';
  const ok = got === expect;
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  N=${n}: "${got}" (expected "${expect}")`);
}

console.log('\nbinding dimension flips at low receiver counts');
for (const n of [1, 13, 50, 200]) {
  el('n').value = String(n);
  api.update();
  const t = els['binding'].textContent;
  console.log(`  N=${String(n).padStart(3)}: ${t.replace(/^Needs /, '')}`);
}

console.log('\nengine selector warns when the engine is unmeasured');
el('n').value = '100';
for (const [engine, expectStop] of [['oracle', false], ['sqlserver', true], ['postgresql', true], ['mysql', true]]) {
  el('engine').value = engine;
  api.update();
  const html = els['validity'].innerHTML;
  const hasStop = /note stop/.test(html) && /has not been measured/.test(html);
  const hint = els['engine-hint'].textContent;
  const ok = hasStop === expectStop &&
    (expectStop ? /Not measured/.test(hint) : /^Measured$/.test(hint));
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${engine}: warn=${hasStop} hint="${hint}"`);
}

console.log('\nunmeasured engine still produces usable numbers (proxy, not blank)');
el('engine').value = 'mysql';
api.update();
const mreq = els['req'].innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
check('proxy still shows 1651 mc', /1651/.test(mreq) ? 1 : 0, 1);
check('AWS shortlist non-empty', /c6i|c5|m5|m6i|t3/.test(els['aws'].innerHTML) ? 1 : 0, 1);

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);

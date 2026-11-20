'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { frontier, fit } = require('./matsuri-hint-pt-experiment.cjs');
const discount = [0, 10, 20, 30, 35, 40];
const effects = { none: 0, small: 4, full: 10 };
const cost = (pt, lv, cut) => Math.floor(pt * (100 - discount[lv] - effects[cut]) / 100);

function demo() {
  let seed = 20261120;
  const rand = n => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296 * n | 0;
  const rows = [];
  for (let d = 0; d < 6; d++) {
    const catalog = Array.from({ length: 42 + 4 * d }, (_, i) => ({ i,
      white: 90 + 10 * rand(11), gold: rand(10) < 4 ? 90 + 10 * rand(14) : 0,
      ws: [129, 174, 217, 239, 288][rand(5)], gs: [334, 394, 461, 508, 559, 633][rand(6)],
    }));
    for (let r = 0; r < 90; r++) {
      const cut = Object.keys(effects)[r % 3];
      const pool = catalog.filter(s => s.i < 7 || rand(100) < 85);
      const levels = pool.map(s => s.gold ? [s.i < 7 ? 3 : 0, 0] : [s.i < 7 ? 3 : 0]);
      const targets = levels.flatMap((ls, i) => ls.map((_, j) => [i, j]));
      let H = 21;
      function hit() {
        const [i, j] = targets[rand(targets.length)];
        const n = 1 + rand(3);
        H += n;
        levels[i][j] = Math.min(5, levels[i][j] + n);
      }
      const groups = () => pool.map((s, i) => {
        const white = cost(s.white, levels[i][0], cut);
        return s.gold ? [[white, s.ws], [white + cost(s.gold, levels[i][1], cut), s.gs]] : [[white, s.ws]];
      });
      const count = 8 + rand(65);
      for (let j = 0; j < count; j++) hit();
      const P = 1000 + rand(4301);
      const row = { run: `${d}/${r}`, deck: `toy-${d}`, cut, H, P, groups: groups() };
      hit();
      row.after = { H, groups: groups() };
      rows.push(row);
    }
  }
  return rows;
}

function compare(input, solver = false) {
  assert(Array.isArray(input) && input.length);
  const ids = new Set();
  for (const r of input) {
    assert(typeof r.run === 'string' && r.run && !ids.has(r.run), 'unique run required');
    ids.add(r.run);
    assert(typeof r.deck === 'string' && r.deck && Object.hasOwn(effects, r.cut));
    assert(Number.isSafeInteger(r.P) && r.P > 0 && r.P <= 10000);
    assert([r.H, r.after.H].every(h => Number.isSafeInteger(h) && h >= 0) && r.after.H >= r.H);
    assert(r.after.P == null || r.after.P === r.P, 'expected fixed budget within pair');
  }
  const cap = Math.max(...input.map(r => r.P)) + 12;
  const decks = [...new Set(input.map(r => r.deck))];
  assert(decks.length > 1, 'need at least two decks');
  const rows = input.map(r => {
    if (!solver) return { ...r, curve: frontier(r.groups, cap), hit: frontier(r.after.groups, r.P)[r.P] };
    assert(Array.isArray(r.curve) && r.curve.length > cap && Number.isSafeInteger(r.after.score));
    for (let p = 0; p <= cap; p++) assert(Number.isSafeInteger(r.curve[p]) && r.curve[p] >= (p ? r.curve[p-1] : 0));
    assert(r.after.score >= r.curve[r.P], 'isolated hit must not remove legal options');
    return { ...r, hit: r.after.score };
  });
  const totals = {};
  for (const deck of decks) {
    const train = rows.filter(r => r.deck !== deck);
    const models = { old: fit(train, cap).old,
      pt: (h,p,c) => mean(h,p,c,0,false),
      rateH: (h,p,c) => p * mean(h,p,c,24,true),
      scoreHP: (h,p,c) => mean(h,p,c,24,false),
      shrunkHP: (h,p,c) => (3 * mean(h,p,c,0,false) + mean(h,p,c,24,false)) / 4,
    };
    function mean(h, p, cut, band, ratio) {
      const matches = train.filter(r => r.cut === cut);
      const cohort = matches.length ? matches : train;
      let sum = 0, support = 0, prior = 0;
      for (const r of cohort) {
        const w = band ? Math.max(0, 1 - Math.abs(h - r.H) / band) : 0;
        const x = ratio ? r.curve[r.P] / r.P : r.curve[p];
        sum += w*x; support += w; prior += x;
      }
      return (sum + 8 * prior / cohort.length) / (support + 8);
    }
    for (const r of rows.filter(r => r.deck === deck)) {
      const { H, P, cut, curve } = r;
      const hit = r.hit - curve[P];
      for (const [name, fn] of Object.entries(models)) {
        const m = totals[name] ??= { n: 0, score: 0, hit: 0, regret: 0, wrong: 0 };
        const base = fn(H,P,cut), predHit = fn(r.after.H,P,cut) - base;
        m.n++; m.score += Math.abs(base - curve[P]); m.hit += Math.abs(predHit - hit);
        for (const extra of [4, 8, 12]) {
          const gap = 5/6 * hit - (curve[P+extra] - curve[P]);
          const takeHit = 5/6 * predHit > fn(H,P+extra,cut) - base;
          if ((takeHit && gap < 0) || (!takeHit && gap > 0)) { m.regret += Math.abs(gap); m.wrong++; }
        }
      }
    }
  }
  const round = x => +x.toFixed(2);
  return Object.fromEntries(Object.entries(totals).map(([k,m]) => [k, { scoreMAE:round(m.score/m.n),
    hitMAE:round(m.hit/m.n), actionRegret:round(m.regret/(3*m.n)), wrongPct:round(100*m.wrong/(3*m.n)) }]));
}

function test() {
  assert.deepEqual(discount.map((_,i) => cost(180,i,'none')), [180,162,144,126,117,108]);
  assert.equal(cost(180,5,'full'),90);
  assert.equal(cost(113,4,'small'),68);
  assert.equal(cost(180,3,'none') * 2,252);
  assert.equal(frontier([[[108,217]],[[100,129]]],110)[110],217);
  assert.equal(frontier([[[180,217]],[[60,129]]],110)[110],129);
  const rows = demo().filter((_,i) => i % 89 === 0);
  const cap = Math.max(...rows.map(r => r.P)) + 12;
  const labels = rows.map(r => ({ ...r, curve: Array.from(frontier(r.groups,cap)),
    after: { H:r.after.H, score:frontier(r.after.groups,r.P)[r.P] } }));
  assert.deepEqual(compare(rows),compare(labels,true));
  assert.throws(() => compare([rows[0],rows[0]]), /unique/);
}

const [mode, file] = process.argv.slice(2);
test();
if (mode === '--test') console.log('OK: costs, equal-H counterexample, deck holdout and solver import');
else if (mode === '--solver' && file) console.table(compare(JSON.parse(fs.readFileSync(file,'utf8')), true));
else if (!mode || mode === '--synthetic') console.table(compare(demo()));
else throw new Error('Usage: node compare.cjs [--test | --synthetic | --solver labels.json]');
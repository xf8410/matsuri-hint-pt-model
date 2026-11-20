#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');

// Each group lists mutually exclusive legal final states as [total incremental cost, incremental score].
// Distinct groups must be independent. Combine related chains into one group before exporting.
function frontier(groups, limit) {
  let dp = new Int32Array(limit + 1);
  for (const group of groups) {
    const next = dp.slice();
    for (const [cost, score] of group) {
      for (let p = cost; p <= limit; p++) next[p] = Math.max(next[p], dp[p - cost] + score);
    }
    dp = next;
  }
  return dp;
}

function rng(seed) {
  let state = seed >>> 0;
  return (n) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor(state / 4294967296 * n);
  };
}

function synthetic() {
  const rows = [];
  for (let d = 0; d < 6; d++) {
    const deck = `synthetic-${d}`;
    const random = rng(20261120 + 1009 * d);
    const catalog = Array.from({ length: 42 + d * 4 }, (_, i) => {
      const cost = 90 + 10 * random(11);
      const score = [129, 174, 217, 239, 288][random(5)];
      const type = random(10);
      if (type < 4) return { i, type, cost, score, extra: 90 + 10 * random(14), final: 360 + 30 * random(8) };
      return { i, type, cost, score };
    });
    for (let r = 0; r < 90; r++) {
      const pool = catalog.filter((s) => s.i < 7 || random(100) < 85);
      const levels = pool.map((s) => s.i < 7 ? 3 : 0);
      const cut = ['none', 'none', 'small', 'full'][random(4)];
      const cost = (base, lv) => Math.floor(base * (100 - 10 * lv - (cut === 'full' ? 10 : cut === 'small' ? 4 : 0)) / 100);
      const groups = () => pool.map((s, i) => {
        const c = cost(s.cost, levels[i]);
        if (s.type < 3) return [[c, s.score], [c + cost(s.extra, 0), s.final]];
        if (s.type === 3) return [[c, s.score], [cost(s.extra, 0), s.final]];
        return [[c, s.score]];
      });
      let H = 21;
      const applyHit = () => {
        // Use a toy hit distribution; failed or saturated rolls need not reduce any cost.
        const idx = random(pool.length);
        const delta = 1 + random(3);
        const old = levels[idx];
        levels[idx] = Math.min(5, old + delta);
        H += delta;
      };
      const hits = 8 + random(65);
      for (let j = 0; j < hits; j++) applyHit();
      const P = 1000 + random(4301);
      const row = { run: `${deck}/${r}`, deck, H, P, cut, groups: groups() };
      if (random(1000) < 167) {
        // Attribute outcome: no skill-score delta; stats are outside this experiment.
        row.after = { H, P, groups: row.groups };
      } else {
        applyHit();
        row.after = { H, P, groups: groups() };
      }
      rows.push(row);
    }
  }
  return rows;
}

function checkState(s) {
  assert(Number.isSafeInteger(s.H) && s.H >= 0, 'invalid H');
  assert(Number.isSafeInteger(s.P) && s.P >= 0 && s.P <= 50000, 'invalid P');
  assert(Array.isArray(s.groups), 'groups must be an array');
  for (const group of s.groups) {
    assert(Array.isArray(group), 'invalid group');
    for (const option of group) {
      assert(Array.isArray(option) && option.length === 2 && option.every(Number.isSafeInteger), 'invalid option');
      assert(option[0] >= 0 && option[1] >= 0 && option[1] <= 1000000, 'invalid cost/score');
    }
  }
}

function old(h, p, cut) {
  const f = Math.fround;
  return Math.trunc(f(f(Math.floor(f(f(p) + f(f(h) * 6.5))) * f(1.88)) * f(cut === 'full' ? 1.1 : cut === 'small' ? 1.04 : 1)));
}

function fit(train, cap) {
  const all = new Float64Array(cap + 1);
  const bins = new Map();
  let residual = 0;
  for (const row of train) {
    const { H, P, curve } = row;
    if (!bins.has(H)) bins.set(H, { n: 0, residual: 0, sum: new Float64Array(cap + 1) });
    const b = bins.get(H);
    b.n++;
    const diff = curve[P] - 1.88 * P;
    b.residual += diff;
    residual += diff;
    for (let p = 0; p <= cap; p++) {
      all[p] += curve[p];
      b.sum[p] += curve[p];
    }
  }
  const cached = new Map();
  function neighbors(h) {
    if (!cached.has(h)) {
      cached.set(h, Array.from(bins, ([k, b]) => [Math.max(0, 1 - Math.abs(h - k) / 12), b]).filter(([w]) => w > 0));
    }
    return cached.get(h);
  }
  return {
    old,
    fixedRatePlusH(h, p) {
      let sum = 8 * residual / train.length, n = 8;
      for (const [w, b] of neighbors(h)) { sum += w * b.residual; n += w * b.n; }
      return Math.max(0, 1.88 * p + sum / n);
    },
    pOnly(_h, p) { return all[p] / train.length; },
    hpCurve(h, p) {
      let sum = 8 * all[p] / train.length, n = 8;
      for (const [w, b] of neighbors(h)) { sum += w * b.sum[p]; n += w * b.n; }
      return sum / n;
    },
  };
}

function evaluate(rows) {
  assert(Array.isArray(rows) && rows.length, 'expected nonempty JSON array');
  let cap = 0;
  const runs = new Set();
  for (const row of rows) {
    assert(typeof row.run === 'string' && !runs.has(row.run), 'one terminal snapshot per unique run required');
    assert(typeof row.deck === 'string' && row.deck.length, 'deck required');
    assert(['none', 'small', 'full'].includes(row.cut), 'cut must be none, small or full');
    runs.add(row.run);
    for (const s of [row, row.after].filter(Boolean)) {
      checkState(s);
      cap = Math.max(cap, s.P);
    }
  }
  const decks = [...new Set(rows.map((r) => r.deck))].sort();
  assert(decks.length >= 2, 'need at least two decks for holdout');
  for (const row of rows) row.curve = frontier(row.groups, cap);
  const metrics = {};
  for (const deck of decks) {
    const train = rows.filter((r) => r.deck !== deck);
    const test = rows.filter((r) => r.deck === deck);
    const models = fit(train, cap);
    for (const row of test) {
      const truth = row.curve[row.P];
      const afterTruth = row.after ? frontier(row.after.groups, row.after.P)[row.after.P] : null;
      for (const [name, predict] of Object.entries(models)) {
        const m = metrics[name] ??= { n: 0, err: 0, abs: 0, pairs: 0, delta: 0, deltaAbs: 0, strata: {} };
        const base = predict(row.H, row.P, row.cut);
        const err = base - truth;
        m.n++; m.err += err; m.abs += Math.abs(err);
        const key = `${row.cut}:${Math.floor(row.P / 1000) * 1000}+`;
        const s = m.strata[key] ??= { n: 0, sum: 0 };
        s.n++; s.sum += err;
        if (row.after) {
          const delta = predict(row.after.H, row.after.P, row.cut) - base - (afterTruth - truth);
          m.pairs++; m.delta += delta; m.deltaAbs += Math.abs(delta);
        }
      }
    }
  }
  const round = (x) => Number(x.toFixed(2));
  return Object.fromEntries(Object.entries(metrics).map(([name, m]) => [name, {
    n: m.n, pairs: m.pairs, scoreMAE: round(m.abs / m.n), scoreBias: round(m.err / m.n),
    hitMAE: m.pairs ? round(m.deltaAbs / m.pairs) : null,
    hitBias: m.pairs ? round(m.delta / m.pairs) : null,
    biasByCutAndPT: Object.fromEntries(Object.entries(m.strata).sort().map(([k, s]) => [k, { n: s.n, bias: round(s.sum / s.n) }])),
  }]));
}

function selfTest() {
  assert.deepEqual(Array.from(frontier([[[0, 4], [2, 7]], [[1, 8]]], 3)), [4, 12, 12, 15]);
  const random = rng(42);
  for (let t = 0; t < 100; t++) {
    const groups = Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => [random(11), random(30)]));
    function brute(i, p) {
      if (i === groups.length) return 0;
      return Math.max(brute(i + 1, p), ...groups[i].filter(([c]) => c <= p).map(([c, s]) => s + brute(i + 1, p - c)));
    }
    const got = frontier(groups, 20);
    got.forEach((score, p) => assert.equal(score, brute(0, p)));
  }
  assert.equal(old(21, 0, 'none'), 255);
  assert.equal(old(0, 100, 'full'), 206);
}

if (require.main === module) {
  const [arg] = process.argv.slice(2);
  selfTest();
  if (arg === '--test') {
    console.log('OK: 100 randomized exhaustive fixtures plus regression checks');
  } else if (arg === '--help') {
    console.log('node matsuri-hint-pt-experiment.cjs [--test | snapshots.json | --synthetic]\n' +
      'Input: [{run, deck, H, P, cut:"none"|"small"|"full", groups:[[[cost,score],...],...], after?:{H,P,groups}}]\n' +
      'Costs are actual discounted PT. Scores are incremental vs already owned skills. Each group offers legal exclusive alternatives plus skip. Combine interdependent skills into one group upstream. after is an optional paired selection effect on the same starting snapshot.');
  } else {
    const useDemo = !arg || arg === '--synthetic';
    const data = useDemo ? synthetic() : JSON.parse(fs.readFileSync(arg, 'utf8'));
    console.log(JSON.stringify({ source: useDemo ? 'synthetic only; not game calibration' : 'supplied snapshots',
      decks: new Set(data.map((r) => r.deck)).size, minGroups: Math.min(...data.map((r) => r.groups.length)),
      maxGroups: Math.max(...data.map((r) => r.groups.length)), evaluation: evaluate(data) }, null, 2));
  }
}
module.exports = { frontier, fit, evaluate, synthetic };
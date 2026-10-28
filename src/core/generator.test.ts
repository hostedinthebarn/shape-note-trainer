import { test } from "node:test";
import assert from "node:assert/strict";
import { generateMelody } from "./generator.ts";
import { LEVELS } from "../types.ts";
import type { LevelSettings, Melody } from "../types.ts";
import { mulberry32 } from "./prng.ts";

// ── The checker: every rule an exercise must obey. Returns a list of broken rules (empty = valid).

const CHORD = [0, 2, 4, 7];
const sameArr = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Split the rhythm of bars 1-3 into three patterns from the level's set, or null if impossible. */
function splitBars(rhythm: number[], patterns: LevelSettings["rhythms"], bars = 3): number[][] | null {
  if (bars === 0) return rhythm.length === 0 ? [] : null;
  for (const p of patterns) {
    if (sameArr(rhythm.slice(0, p.length), p)) {
      const rest = splitBars(rhythm.slice(p.length), patterns, bars - 1);
      if (rest) return [[...p], ...rest];
    }
  }
  return null;
}

function check(s: LevelSettings, ex: Melody): string[] {
  const errs: string[] = [];
  const { degrees: d, rhythm: r } = ex;
  if (!Array.isArray(d) || !Array.isArray(r)) return ["degrees and rhythm must be arrays"];
  if (d.length !== r.length) return [`degrees has ${d.length} notes but rhythm has ${r.length}: they must be parallel lists`];
  if (d.length < 4) return [`only ${d.length} notes`];
  d.forEach((x, i) => {
    if (!s.allowed.includes(x)) errs.push(`note ${i}: degree ${x} is not in the level's allowed degrees [${s.allowed}]`);
    if (s.chord && !CHORD.includes(x)) errs.push(`note ${i}: chord level, degree ${x} is not one of 0, 2, 4, 7`);
  });
  for (let i = 1; i < d.length; i++) {
    if (d[i] === d[i - 1]) errs.push(`notes ${i - 1}-${i}: repeated degree ${d[i]} (consecutive notes must differ)`);
    if (Math.abs(d[i] - d[i - 1]) > s.maxLeap) errs.push(`notes ${i - 1}-${i}: leap ${d[i - 1]} -> ${d[i]} is ${Math.abs(d[i] - d[i - 1])} steps, more than maxLeap ${s.maxLeap}`);
  }
  if (![0, 2, 4].includes(d[0])) errs.push(`first degree ${d[0]} must be 0, 2 or 4`);
  if (r[r.length - 1] !== 4) errs.push(`last note must be a whole note (4), got ${r[r.length - 1]}`);
  if (!splitBars(r.slice(0, -1), s.rhythms)) errs.push(`rhythm before the last note [${r.slice(0, -1)}] is not exactly three bars, each one of the level's patterns ${JSON.stringify(s.rhythms)}`);
  const last = d[d.length - 2];
  const fin = s.allowed.includes(7) && Math.abs(last - 7) < Math.abs(last - 0) ? 7 : 0;
  if (d[d.length - 1] !== fin) errs.push(`final degree must be ${fin} after ${last} (7 only if allowed and nearer than 0), got ${d[d.length - 1]}`);
  const distinct = new Set(d.slice(0, -1)).size;
  const need = Math.min(s.allowed.length, 3);
  if (distinct < need) errs.push(`bars 1-3 use ${distinct} distinct degrees; need at least ${need}`);
  return errs;
}

// ── Real exercises from the existing drills generator (must pass the checker).

const Q = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4];
const REAL: Array<[level: number, degrees: number[], rhythm: number[]]> = [
  [1, [0, 1, 2, 1, 2, 1, 0, 1, 0, 1, 2, 1, 0], Q],
  [1, [2, 1, 2, 1, 0, 1, 2, 1, 2, 1, 0, 1, 0], Q],
  [1, [2, 1, 2, 1, 0, 1, 0, 1, 2, 1, 2, 1, 0], Q],
  [2, [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 0, 1, 0], Q],
  [2, [2, 3, 4, 3, 4, 3, 2, 1, 0, 1, 0, 1, 0], Q],
  [2, [2, 3, 4, 3, 2, 3, 4, 3, 2, 1, 0, 1, 0], Q],
  [3, [4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 2, 1, 0], Q],
  [3, [4, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0], Q],
  [3, [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 0], Q],
  [4, [0, 2, 0, 4, 0, 2, 4, 2, 0, 2, 0, 4, 7], Q],
  [4, [0, 2, 4, 0, 2, 4, 2, 0, 2, 4, 0, 2, 0], Q],
  [4, [0, 4, 7, 4, 0, 2, 4, 7, 4, 0, 2, 4, 7], Q],
  [5, [4, 6, 7, 5, 3, 4, 5, 6, 4, 6, 7, 5, 7], Q],
  [5, [2, 0, 1, 0, 1, 3, 5, 7, 5, 3, 1, 2, 0], Q],
  [5, [0, 2, 3, 1, 0, 1, 2, 3, 1, 2, 0, 2, 0], Q],
  [6, [0, 3, 4, 2, 1, 4, 3, 2, 0], [2, 1, 1, 2, 1, 1, 2, 2, 4]],
  [6, [0, 3, 4, 2, 1, -1, 0, -2, -1, -2, -3, 0], [1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 4]],
  [6, [0, -2, -3, -1, -2, 0, -3, -2, -1, 0], [1, 1, 2, 2, 1, 1, 1, 1, 2, 4]],
  [7, [4, 0, -1, 2, -2, -3, 1, -3, 0], [1, 1, 2, 2, 2, 2, 1, 1, 4]],
  [7, [0, 3, -1, 0, 1, 4, 7, 3, 6, 4, 7], [1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 4]],
  [7, [4, 0, 2, 5, 1, 4, 7, 3, 0, 4, 7], [1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 4]],
  [8, [0, 1, 4, 7, 6, 4, 3, 7, 2, -2, 0], [1, 1, 1.5, 0.5, 2, 2, 1.5, 0.5, 1, 1, 4]],
  [8, [4, 3, 0, 1, 2, 4, 3, 5, 4, 2, 6, 7], [1.5, 0.5, 1, 1, 1.5, 0.5, 2, 1, 1, 1.5, 0.5, 4]],
  [8, [4, 6, 1, 0, -2, 0, -3, 1, -1, -3, 0, 4, 7], [1, 1, 1.5, 0.5, 1, 1, 1, 1, 1, 1, 1, 1, 4]],
];

const lvl = (n: number) => LEVELS[n - 1];

test("checker accepts all 24 real exercises from the drills", () => {
  for (const [level, degrees, rhythm] of REAL) {
    assert.deepEqual(check(lvl(level), { degrees, rhythm }), [], `level ${level}: ${degrees}`);
  }
});

test("checker rejects broken exercises", () => {
  const bad: Array<[number, number[], number[]]> = [
    [1, [0, 1, 2, 1, 2, 2, 0, 1, 0, 1, 2, 1, 0], Q], // repeated note
    [1, [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 1, 0], Q], // degree 3 not allowed
    [3, [0, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 2, 1], Q], // leap of 2, ends on 1
    [2, [1, 2, 3, 4, 3, 2, 1, 2, 3, 2, 1, 2, 1], Q], // starts on re, ends on re
    [3, [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 0], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3]], // bad bars
    [5, [4, 6, 7, 5, 3, 4, 5, 6, 4, 6, 7, 5, 3], Q], // must end on 7 from 5
    [6, [0, 3, 4, 2, 1, 4, 3, 2, 0], [2, 1, 1, 2, 1, 1, 2, 2]], // lengths differ
    [8, [0, 1, 4, 7, 6, 4, 3, 7, 2, -2, 0], [1, 1, 1.5, 0.5, 2, 2, 1.5, 0.5, 1, 1, 2]], // last not whole
  ];
  for (const [level, degrees, rhythm] of bad) {
    assert.ok(check(lvl(level), { degrees, rhythm }).length > 0, `level ${level} should be rejected: ${degrees} / ${rhythm}`);
  }
});

// ── The generator.

test("every generated exercise obeys every rule (8 levels x 300 seeds)", () => {
  for (const s of LEVELS) {
    for (let seed = 1; seed <= 300; seed++) {
      const ex = generateMelody(s, mulberry32(seed));
      const errs = check(s, ex);
      assert.deepEqual(errs, [], `level ${s.level}, seed ${seed}: ${JSON.stringify(ex)}`);
    }
  }
});

test("same seed gives the same exercise; the PRNG passed in is the only randomness", () => {
  const real = Math.random;
  Math.random = () => { throw new Error("generateMelody must use the rand() passed in, not Math.random"); };
  try {
    for (const s of LEVELS) {
      for (const seed of [7, 42, 2026]) {
        assert.deepEqual(generateMelody(s, mulberry32(seed)), generateMelody(s, mulberry32(seed)), `level ${s.level} seed ${seed}`);
      }
    }
  } finally {
    Math.random = real;
  }
});

test("different seeds give varied exercises", () => {
  for (const level of [3, 6, 8]) {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 100; seed++) seen.add(JSON.stringify(generateMelody(lvl(level), mulberry32(seed))));
    assert.ok(seen.size >= 60, `level ${level}: only ${seen.size} distinct exercises from 100 seeds`);
  }
  const starts = new Set<number>();
  for (let seed = 1; seed <= 200; seed++) starts.add(generateMelody(lvl(3), mulberry32(seed)).degrees[0]);
  assert.deepEqual([...starts].sort(), [0, 2, 4], "level 3 should start on each of 0, 2 and 4 over 200 seeds");
  const rhythms = new Set<string>();
  for (let seed = 1; seed <= 200; seed++) rhythms.add(JSON.stringify(generateMelody(lvl(8), mulberry32(seed)).rhythm));
  assert.ok(rhythms.size >= 50, `level 8: only ${rhythms.size} distinct rhythms from 200 seeds`);
});

/** Over many seeds, the fraction of moves in bars 1-3 for which pred(prev, cur, next) holds. */
function moveFraction(s: LevelSettings, pred: (prev: number | undefined, cur: number, next: number) => boolean, seeds = 400): number {
  let hit = 0, all = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const d = generateMelody(s, mulberry32(seed)).degrees.slice(0, -1);
    for (let i = 1; i < d.length; i++) {
      all++;
      if (pred(d[i - 2], d[i - 1], d[i])) hit++;
    }
  }
  return hit / all;
}

test("weights: level 5 prefers thirds (x3) over steps (x1.5)", () => {
  const f = moveFraction(lvl(5), (_p, c, n) => Math.abs(n - c) >= 2);
  assert.ok(f > 0.5, `level 5: only ${(f * 100).toFixed(1)}% of moves are thirds; with weights x3 against x1.5 expect about 59%`);
});

test("weights: going straight back to the previous note is discouraged (x0.4)", () => {
  const f = moveFraction(lvl(3), (p, _c, n) => p !== undefined && n === p);
  assert.ok(f < 0.45, `level 3: ${(f * 100).toFixed(1)}% of moves go straight back; with the x0.4 weight expect about 38% (55% without it)`);
});

test("impossible settings throw an Error instead of looping forever", () => {
  const impossible: LevelSettings = { level: 99, allowed: [0, 4], maxLeap: 1, rhythms: [[1, 1, 1, 1]] };
  assert.throws(() => generateMelody(impossible, mulberry32(1)), Error);
});

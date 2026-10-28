# Packet: level-generator

## Task

Write `generator.ts` for a shape-note sight-singing trainer: one function that generates a random **exercise** (a short melody of scale degrees plus a rhythm) from a **level's settings**, using only the seeded random-number function passed in. All eight levels use the same algorithm; a level is just a `LevelSettings` value (see `level-types.ts`, which also holds the eight levels as `LEVELS`).

Degrees are integers relative to do: 0 = do, 1 = re … 6 = ti, 7 = do above, −1 = ti below, −2 = la below, −3 = sol below.

## Interface

```ts
import type { LevelSettings, Exercise } from "./level-types.ts";

/** Generate one exercise for the given level settings.
 *  `rand` returns floats in [0, 1); it is the ONLY source of randomness (never Math.random),
 *  so the same rand sequence must always give the same exercise.
 *  Throws an Error if no valid exercise is found in 1000 attempts. */
export function generateExercise(settings: LevelSettings, rand: () => number): Exercise;
```

## The algorithm

Each **attempt**:

1. **Rhythm.** Pick a rhythm pattern for each of bars 1, 2 and 3, independently and uniformly at random from `settings.rhythms`. Let `n` = the total number of notes in those three patterns.
2. **Start.** The first degree is chosen uniformly from {0, 2, 4} ∩ `settings.allowed`.
3. **Walk.** Add degrees until there are `n`. From the current degree `cur`, the candidates are every `d` in `settings.allowed` with `d ≠ cur` (no repeated notes) and `|d − cur| ≤ settings.maxLeap`; if `settings.chord` is true, `d` must also be in {0, 2, 4, 7}. Each candidate has weight 1, multiplied by:
   - 3 if `settings.prefer` is set and `|d − cur| ≥ settings.prefer`;
   - 1.5 if `|d − cur| = 1` (a step);
   - 0.4 if `d` equals the degree *before* `cur` (discourages going straight back).

   Choose one candidate with probability proportional to its weight. If there are no candidates, the attempt fails.
4. **Final note.** Let `last` = the last degree of the walk. `final` = 7 if 7 is in `settings.allowed` and `|last − 7| < |last − 0|`; otherwise 0. The attempt fails if `final === last` or `|final − last| > settings.maxLeap`.
5. **Variety.** The attempt fails if the walk's `n` degrees contain fewer than `min(settings.allowed.length, 3)` distinct values.
6. **Result.** `degrees` = the walk followed by `final`; `rhythm` = the three bar patterns concatenated, followed by 4 (a whole note). So `degrees.length === rhythm.length === n + 1`.

A failed attempt starts again from step 1 (new rhythms too). After 1000 failed attempts, throw an `Error`.

## Test vectors

The output for a seed can't be predicted, so the tests are a **checker**: they generate exercises for all 8 levels over 300 seeds and assert every rule above (allowed degrees, no repeats, max leap, chord degrees, start in {0, 2, 4}, three valid bars plus a final 4, the final-degree rule, variety). The checker is first run on 24 real exercises from an older generator, for example:

| Level | Degrees | Rhythm |
|---|---|---|
| 1 | 0 1 2 1 2 1 0 1 0 1 2 1 0 | 1 ×12, then 4 |
| 4 | 0 2 0 4 0 2 4 2 0 2 0 4 7 | 1 ×12, then 4 |
| 6 | 0 3 4 2 1 4 3 2 0 | 2 1 1 2 1 1 2 2 4 |
| 8 | 0 1 4 7 6 4 3 7 2 −2 0 | 1 1 1.5 0.5 2 2 1.5 0.5 1 1 4 |

The tests also check that the same seed gives the same exercise, that `Math.random` is never called, that different seeds give varied exercises, the weights statistically (level 5: about 59% of moves are thirds; level 3: about 38% of moves go straight back), and that impossible settings throw.

## Constraints

- Pure function apart from calling `rand`: no I/O, no globals, no console output, no `Math.random`.
- No imports except the type import from `./level-types.ts` shown above. (`prng.ts` is used by the tests; you don't need it.)
- Export exactly `generateExercise` with the signature above.

## Neighbours

`level-types.ts` and `prng.ts` are already written; they are included below. Import from them, don't redefine `LevelSettings`, `Exercise` or `LEVELS`.

## Rules that always apply

- The file runs under Node's built-in TypeScript type stripping, so use erasable syntax only: no `enum`, no `namespace`, no constructor parameter properties, no decorators.
- Relative imports must include the `.ts` extension (e.g. `./note-types.ts`).
- No npm packages and no Node built-in modules unless the packet's constraints allow them.
- Do not change the exported names or signatures given in the interface.

## Neighbour file `level-types.ts` (already exists; do not rewrite it)

```ts
// Neighbour module (written by Claude). Level settings and the exercise shape.
// Degrees are integers relative to do: 0 = do, 1 = re … 6 = ti, 7 = do above,
// -1 = ti below, -2 = la below, -3 = sol below.

/** The parameters that define one level. Every level uses the same algorithm. */
export interface LevelSettings {
  level: number;
  /** Degrees the melody may use, ascending. */
  allowed: readonly number[];
  /** Largest allowed |next - current|, counted in scale steps (1 = step, 2 = third …). */
  maxLeap: number;
  /** Rhythm patterns for bars 1-3; each pattern is note lengths in quarter notes summing to 4. */
  rhythms: readonly (readonly number[])[];
  /** If true, every degree must be one of 0, 2, 4, 7 (do, mi, sol, high do). */
  chord?: boolean;
  /** If set, moves with |d - current| >= prefer get weight x3. */
  prefer?: number;
}

/** One exercise: parallel lists of degrees and note lengths (quarter notes). */
export interface Exercise {
  degrees: number[];
  rhythm: number[];
}

const QUARTERS = [[1, 1, 1, 1]];
const HALVES = [[1, 1, 1, 1], [1, 1, 2], [2, 1, 1], [2, 2]];
const DOTTED = [...HALVES, [1.5, 0.5, 1, 1], [1, 1, 1.5, 0.5], [1.5, 0.5, 2]];
const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

export const LEVELS: readonly LevelSettings[] = [
  { level: 1, allowed: [0, 1, 2], maxLeap: 1, rhythms: QUARTERS },
  { level: 2, allowed: range(0, 4), maxLeap: 1, rhythms: QUARTERS },
  { level: 3, allowed: range(0, 7), maxLeap: 1, rhythms: QUARTERS },
  { level: 4, allowed: [0, 2, 4, 7], maxLeap: 4, rhythms: QUARTERS, chord: true },
  { level: 5, allowed: range(0, 7), maxLeap: 2, rhythms: QUARTERS, prefer: 2 },
  { level: 6, allowed: range(-3, 4), maxLeap: 3, rhythms: HALVES },
  { level: 7, allowed: range(-3, 7), maxLeap: 4, rhythms: HALVES, prefer: 3 },
  { level: 8, allowed: range(-3, 7), maxLeap: 5, rhythms: DOTTED },
];
```

## Neighbour file `prng.ts` (already exists; do not rewrite it)

```ts
// Neighbour module (written by Claude). A small seeded PRNG so exercises are reproducible.

/** mulberry32: returns a function giving floats in [0, 1), deterministic for a given 32-bit seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

## Tests `generator.test.ts` (run with `node --test`; your file must make these pass)

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateExercise } from "./generator.ts";
import { LEVELS } from "./level-types.ts";
import type { LevelSettings, Exercise } from "./level-types.ts";
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

function check(s: LevelSettings, ex: Exercise): string[] {
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
      const ex = generateExercise(s, mulberry32(seed));
      const errs = check(s, ex);
      assert.deepEqual(errs, [], `level ${s.level}, seed ${seed}: ${JSON.stringify(ex)}`);
    }
  }
});

test("same seed gives the same exercise; the PRNG passed in is the only randomness", () => {
  const real = Math.random;
  Math.random = () => { throw new Error("generateExercise must use the rand() passed in, not Math.random"); };
  try {
    for (const s of LEVELS) {
      for (const seed of [7, 42, 2026]) {
        assert.deepEqual(generateExercise(s, mulberry32(seed)), generateExercise(s, mulberry32(seed)), `level ${s.level} seed ${seed}`);
      }
    }
  } finally {
    Math.random = real;
  }
});

test("different seeds give varied exercises", () => {
  for (const level of [3, 6, 8]) {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 100; seed++) seen.add(JSON.stringify(generateExercise(lvl(level), mulberry32(seed))));
    assert.ok(seen.size >= 60, `level ${level}: only ${seen.size} distinct exercises from 100 seeds`);
  }
  const starts = new Set<number>();
  for (let seed = 1; seed <= 200; seed++) starts.add(generateExercise(lvl(3), mulberry32(seed)).degrees[0]);
  assert.deepEqual([...starts].sort(), [0, 2, 4], "level 3 should start on each of 0, 2 and 4 over 200 seeds");
  const rhythms = new Set<string>();
  for (let seed = 1; seed <= 200; seed++) rhythms.add(JSON.stringify(generateExercise(lvl(8), mulberry32(seed)).rhythm));
  assert.ok(rhythms.size >= 50, `level 8: only ${rhythms.size} distinct rhythms from 200 seeds`);
});

/** Over many seeds, the fraction of moves in bars 1-3 for which pred(prev, cur, next) holds. */
function moveFraction(s: LevelSettings, pred: (prev: number | undefined, cur: number, next: number) => boolean, seeds = 400): number {
  let hit = 0, all = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const d = generateExercise(s, mulberry32(seed)).degrees.slice(0, -1);
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
  assert.throws(() => generateExercise(impossible, mulberry32(1)), Error);
});
```

Write `generator.ts` now. Reply with exactly one ```ts block containing the whole file.
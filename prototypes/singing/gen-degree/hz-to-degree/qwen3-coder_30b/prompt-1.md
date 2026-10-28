# Packet: hz-to-degree

## Task

Write `degree.ts` for a shape-note singing trainer. The singer is given a frequency for **do** (the tonic of a major key). The app detects the frequency the singer is singing and needs to know which movable-do degree of the major scale (do, re, mi, fa, sol, la, ti) it is nearest to, how many cents sharp or flat it is, and in which octave relative to do. Judging is octave-forgiving, so the octave is reported separately rather than folded into the cents. Also write the inverse: the frequency of a degree in a given octave.

## Interface

```ts
import type { Degree, DegreeReading } from "./degree-types.ts";
import { DEGREES, MAJOR_SEMITONES } from "./degree-types.ts";

/** The nearest major-scale degree to `hz`, given the frequency of do.
 *
 *  Method (twelve-tone equal temperament):
 *  1. s = 12 * log2(hz / doHz), the signed distance from do in (fractional) semitones.
 *  2. Every scale tone has a semitone position p = 12 * octave + MAJOR_SEMITONES[index],
 *     for any integer octave (negative too). Pick the scale tone with the smallest |s - p|.
 *     If two are exactly equally near (a chromatic note between two whole-tone degrees),
 *     pick the lower one.
 *  3. cents = 100 * (s - p). It is always within [-100, +100], and within [-50, +50]
 *     when the nearest neighbours are a semitone apart (mi/fa, ti/do).
 *
 *  Throws RangeError if hz or doHz is not a finite number > 0. */
export function hzToDegree(hz: number, doHz: number): DegreeReading;

/** Frequency of `degree` in `octave` (0 = the octave starting on do), given do's frequency.
 *  hz = doHz * 2 ** ((12 * octave + MAJOR_SEMITONES[index]) / 12).
 *  Throws RangeError if doHz is not a finite number > 0, octave is not an integer,
 *  or degree is not one of the seven degrees. */
export function degreeToHz(degree: Degree, octave: number, doHz: number): number;
```

## Test vectors

do = 261.6255653005986 Hz (middle C) unless stated. Cents compared with a tolerance of 1e-6.

| Call | Expected |
|---|---|
| `hzToDegree(261.6255653005986, 261.6255653005986)` | `{ degree: "do", index: 0, octave: 0, cents: 0 }` |
| `hzToDegree(440, do)` | `{ degree: "la", index: 5, octave: 0, cents: 0 }` |
| `hzToDegree(445, do)` | la, octave 0, cents 19.56217479492075 |
| `hzToDegree(246.94165062806206, do)` (B3) | `{ degree: "ti", index: 6, octave: -1, cents: 0 }` |
| `hzToDegree(523.2511306011972, do)` (C5) | do, octave 1, cents 0 |
| `hzToDegree(255, do)` | do, octave 0, cents -44.407531998961844 (flat do, not sharp ti) |
| `hzToDegree(277.0, do)` (C♯4 is 277.18) | do, octave 0, cents 98.85894302943463 (lower neighbour, under the midpoint) |
| `hzToDegree(278.0, do)` | re, octave 0, cents -94.90236896138269 |
| `hzToDegree(0, do)` | throws RangeError |
| `degreeToHz("sol", 0, do)` | 391.99543598174927 |
| `degreeToHz("re", -1, do)` | 146.8323839587038 |

## Constraints

- Pure functions: no I/O, no globals, no randomness, no console output.
- No imports except from `./degree-types.ts` as shown above.
- Export exactly the two functions with the signatures above.

## Neighbours

`degree-types.ts` is already written; it is included below. Import from it, don't redefine `Degree`, `DegreeReading`, `DEGREES` or `MAJOR_SEMITONES`.

## Rules that always apply

- The file runs under Node's built-in TypeScript type stripping, so use erasable syntax only: no `enum`, no `namespace`, no constructor parameter properties, no decorators.
- Relative imports must include the `.ts` extension (e.g. `./note-types.ts`).
- No npm packages and no Node built-in modules unless the packet's constraints allow them.
- Do not change the exported names or signatures given in the interface.

## Neighbour file `degree-types.ts` (already exists; do not rewrite it)

```ts
// Neighbour module (written by Claude). Shared degree types for the shape-note trainer.

/** A movable-do degree of the major scale, in scale order. */
export type Degree = "do" | "re" | "mi" | "fa" | "sol" | "la" | "ti";

/** The seven degrees in scale order; DEGREES[i] is scale index i. */
export const DEGREES: readonly Degree[] = ["do", "re", "mi", "fa", "sol", "la", "ti"];

/** Semitones above do for each scale index (major scale). */
export const MAJOR_SEMITONES: readonly number[] = [0, 2, 4, 5, 7, 9, 11];

/** Where a sung frequency sits relative to the movable-do scale. */
export interface DegreeReading {
  /** The nearest degree of the major scale. */
  degree: Degree;
  /** Its scale index, 0 (do) to 6 (ti). */
  index: number;
  /** Octave of that degree relative to the given do: 0 = the octave starting on do,
   *  -1 = the octave below, 1 = the octave above. */
  octave: number;
  /** Signed offset from that degree in cents; positive = sharp. */
  cents: number;
}
```

## Tests `degree.test.ts` (run with `node --test`; your file must make these pass)

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { hzToDegree, degreeToHz } from "./degree.ts";

const C4 = 261.6255653005986;
const G3 = 195.99771799087463;

const close = (actual: number, expected: number, what: string, eps = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${what}: expected ${expected}, got ${actual}`);

type Row = [hz: number, doHz: number, degree: string, index: number, octave: number, cents: number];

const check = (rows: Row[]) => {
  for (const [hz, doHz, degree, index, octave, cents] of rows) {
    const r = hzToDegree(hz, doHz);
    const where = `hzToDegree(${hz}, ${doHz})`;
    assert.equal(r.degree, degree, `${where}.degree`);
    assert.equal(r.index, index, `${where}.index`);
    assert.equal(r.octave, octave, `${where}.octave`);
    close(r.cents, cents, `${where}.cents`);
  }
};

test("in-tune degrees of C major, octave 0", () => {
  check([
    [C4, C4, "do", 0, 0, 0],
    [293.6647679174076, C4, "re", 1, 0, 0],
    [329.6275569128699, C4, "mi", 2, 0, 0],
    [349.2282314330039, C4, "fa", 3, 0, 0],
    [391.99543598174927, C4, "sol", 4, 0, 0],
    [440, C4, "la", 5, 0, 0],
    [493.8833012561241, C4, "ti", 6, 0, 0],
  ]);
});

test("octaves above and below do", () => {
  check([
    [246.94165062806206, C4, "ti", 6, -1, 0],
    [523.2511306011972, C4, "do", 0, 1, 0],
    [130, C4, "do", 0, -1, -10.790280595445978],
    [1000, C4, "ti", 6, 1, 21.309485364913172],
    [70, C4, "re", 1, -2, -82.49203589563159],
    [1100, C4, "do", 0, 2, 86.31371386483515],
  ]);
});

test("sharp and flat readings", () => {
  check([
    [445, C4, "la", 5, 0, 19.56217479492075],
    [255, C4, "do", 0, 0, -44.407531998961844],
    [329, C4, "mi", 2, 0, -3.299127747301611],
    [340, C4, "fa", 3, 0, -46.362532864349504],
    [500, C4, "ti", 6, 0, 21.309485364912817],
  ]);
});

test("chromatic notes go to the nearer whole-tone neighbour", () => {
  check([
    [277, C4, "do", 0, 0, 98.85894302943463],
    [278, C4, "re", 1, 0, -94.90236896138269],
    [233.08, C4, "la", 5, -1, 99.98603045752516],
    [236, C4, "ti", 6, -1, -78.459996995382],
  ]);
});

test("another key: do = G3", () => {
  check([
    [185, G3, "ti", 6, -1, 0.02609638998322117],
    [98, G3, "do", 0, -1, 0.020156708658447542],
    [440, G3, "re", 1, 1, 0],
    [293.66476791740763, G3, "sol", 4, 0, 0],
    [175, G3, "ti", 6, -1, -96.17832203079698],
  ]);
});

test("hzToDegree rejects bad input", () => {
  assert.throws(() => hzToDegree(0, C4), RangeError);
  assert.throws(() => hzToDegree(-440, C4), RangeError);
  assert.throws(() => hzToDegree(440, 0), RangeError);
  assert.throws(() => hzToDegree(Number.NaN, C4), RangeError);
  assert.throws(() => hzToDegree(Number.POSITIVE_INFINITY, C4), RangeError);
});

test("degreeToHz", () => {
  close(degreeToHz("do", 0, C4), C4, "do 0");
  close(degreeToHz("sol", 0, C4), 391.99543598174927, "sol 0");
  close(degreeToHz("re", -1, C4), 146.8323839587038, "re -1");
  close(degreeToHz("ti", -1, C4), 246.94165062806206, "ti -1");
  close(degreeToHz("fa", 1, C4), 698.4564628660078, "fa 1");
  close(degreeToHz("re", 1, G3), 440, "G3 re 1");
});

test("degreeToHz and hzToDegree round-trip", () => {
  const degrees = ["do", "re", "mi", "fa", "sol", "la", "ti"] as const;
  for (let octave = -2; octave <= 2; octave++) {
    degrees.forEach((d, i) => {
      const r = hzToDegree(degreeToHz(d, octave, G3), G3);
      assert.equal(r.degree, d, `${d} ${octave}`);
      assert.equal(r.index, i);
      assert.equal(r.octave, octave, `${d} ${octave} octave`);
      close(r.cents, 0, `${d} ${octave} cents`);
    });
  }
});

test("degreeToHz rejects bad input", () => {
  assert.throws(() => degreeToHz("do", 0, 0), RangeError);
  assert.throws(() => degreeToHz("do", 0.5, C4), RangeError);
  assert.throws(() => degreeToHz("so" as never, 0, C4), RangeError);
});
```

Write `degree.ts` now. Reply with exactly one ```ts block containing the whole file.
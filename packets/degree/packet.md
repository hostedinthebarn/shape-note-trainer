---
component: degree
root: ../..
target: src/core/degree.ts
tests: src/core/degree.test.ts
neighbours: src/types.ts
---

# Packet: hz-to-degree

## Task

Write `src/core/degree.ts` for a shape-note singing trainer. The singer is given a frequency for **do** (the tonic of a major key). The app detects the frequency the singer is singing and needs to know which movable-do degree of the major scale (do, re, mi, fa, sol, la, ti) it is nearest to, how many cents sharp or flat it is, and in which octave relative to do. Judging is octave-forgiving, so the octave is reported separately rather than folded into the cents. Also write the inverse (the frequency of a degree in a given octave) and `scalePosition`, which places any sung pitch on the scale as a fractional number of scale steps from do, for drawing it on the staff or the shape ladder.

## Interface

```ts
import type { Degree, DegreeReading } from "../types.ts";
import { DEGREES, MAJOR_SEMITONES } from "../types.ts";

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

/** Where `hz` sits on the scale, in scale steps from do (0 = do, 1 = re … 7 = do above,
 *  -1 = ti below, -3 = sol below), as a real number for drawing.
 *
 *  Method:
 *  1. s = 12 * log2(hz / doHz), as in hzToDegree.
 *  2. octave = Math.floor(s / 12); r = s - 12 * octave, so 0 <= r < 12.
 *  3. Find the scale index i (0..6) with MAJOR_SEMITONES[i] <= r < next, where next is
 *     MAJOR_SEMITONES[i + 1], or 12 when i is 6.
 *  4. Return 7 * octave + i + (r - MAJOR_SEMITONES[i]) / (next - MAJOR_SEMITONES[i]).
 *  So scale tones land on whole numbers and a pitch between two scale tones is placed linearly
 *  between them (C sharp with do = C is 0.5; F sharp is 3.5, because fa to sol is a whole tone).
 *
 *  Throws RangeError if hz or doHz is not a finite number > 0. */
export function scalePosition(hz: number, doHz: number): number;
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
| `scalePosition(do, do)` | 0 |
| `scalePosition(329.6275569128699, do)` (E4, mi) | 2 |
| `scalePosition(277.1826309768721, do)` (C♯4) | 0.5 |
| `scalePosition(369.99442271163446, do)` (F♯4) | 3.5 |
| `scalePosition(246.94165062806206, do)` (B3) | -1 |
| `scalePosition(233.08188075904496, do)` (B♭3) | -1.5 |
| `scalePosition(195.99771799087463, do)` (G3) | -3 |
| `scalePosition(523.2511306011972, do)` (C5) | 7 |
| `scalePosition(0, do)` | throws RangeError |

## Constraints

- Pure functions: no I/O, no globals, no randomness, no console output.
- No imports except from `../types.ts` as shown above.
- Export exactly the three functions with the signatures above.

## Neighbours

`src/types.ts` is already written; it is included below. Import from it, don't redefine `Degree`, `DegreeReading`, `DEGREES` or `MAJOR_SEMITONES`.

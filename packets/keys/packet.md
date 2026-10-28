---
component: keys
root: ../..
target: src/core/keys.ts
tests: src/core/keys.test.ts
neighbours: src/types.ts
---

# Packet: keys (the range fitter)

## Task

Write `src/core/keys.ts` for a shape-note sight-singing trainer. Each exercise is a melody of scale steps from do (0 = do, 1 = re … 7 = do above, -1 = ti below, -3 = sol below). The app chooses a **key** (a major key, shown as a key signature) for the melody near the singer's own pitch of do, so the key signature varies from exercise to exercise while the notes stay in the singer's range. This module spells keys, turns a scale step into a MIDI note, lists the keys a melody fits, and picks one.

Pitches are MIDI note numbers: 60 = C4 (middle C), one per semitone.

## Interface

```ts
import type { Key, Letter, Melody } from "../types.ts";
import { MAJOR_SEMITONES } from "../types.ts";

/** Keys with more sharps or flats than this are never offered as candidates. */
export const MAX_ACCIDENTALS = 5;

/** How far (in semitones) a candidate key's do may be from the singer's do. */
export const KEY_SPREAD = 3;

/** The major key whose do sounds at MIDI note `doMidi`, spelled from this table by pitch class
 *  (doMidi mod 12):
 *
 *  | pc | tonic | accidental | sharps | flats |
 *  |----|-------|------------|--------|-------|
 *  | 0  | C     | 0          | 0      | 0     |
 *  | 1  | D     | -1 (D♭)    | 0      | 5     |
 *  | 2  | D     | 0          | 2      | 0     |
 *  | 3  | E     | -1 (E♭)    | 0      | 3     |
 *  | 4  | E     | 0          | 4      | 0     |
 *  | 5  | F     | 0          | 0      | 1     |
 *  | 6  | F     | 1 (F♯)     | 6      | 0     |
 *  | 7  | G     | 0          | 1      | 0     |
 *  | 8  | A     | -1 (A♭)    | 0      | 4     |
 *  | 9  | A     | 0          | 3      | 0     |
 *  | 10 | B     | -1 (B♭)    | 0      | 2     |
 *  | 11 | B     | 0          | 5      | 0     |
 *
 *  Returns a new object every call: { tonic, accidental, sharps, flats, doMidi }.
 *  Throws RangeError if doMidi is not an integer from 0 to 127. */
export function keyForDo(doMidi: number): Key;

/** The MIDI note of scale step `step` when do is `doMidi`:
 *  doMidi + 12 * Math.floor(step / 7) + MAJOR_SEMITONES[((step % 7) + 7) % 7].
 *  So with do = 60: step 0 is 60, 4 (sol) is 67, 7 is 72, -1 (ti below) is 59, -3 (sol below) is 55.
 *  Throws RangeError if step or doMidi is not an integer. */
export function noteMidi(step: number, doMidi: number): number;

/** The keys `melody` can be sung in by a singer whose do is `singerDo`. A key qualifies when:
 *  1. its do is within KEY_SPREAD semitones of singerDo (singerDo - 3 … singerDo + 3);
 *  2. keyForDo gives it at most MAX_ACCIDENTALS sharps and at most MAX_ACCIDENTALS flats;
 *  3. every note of the melody, noteMidi(step, key.doMidi), lies in the singer's range
 *     singerDo - 5 … singerDo + 12 inclusive (sol below to do above).
 *  Returned in ascending doMidi order, as new objects. May be empty.
 *  Throws RangeError if singerDo is not an integer from 5 to 115. */
export function fittingKeys(melody: Melody, singerDo: number): Key[];

/** Choose the key for an exercise.
 *  - If alwaysMyDo is true: keyForDo(singerDo), whatever its accidentals; rand is not called.
 *  - Otherwise let keys = fittingKeys(melody, singerDo). If keys is empty: keyForDo(singerDo),
 *    rand not called. Otherwise call rand() exactly once and return
 *    keys[Math.floor(rand() * keys.length)].
 *  rand returns floats in [0, 1) and is the only randomness (never Math.random). */
export function pickKey(melody: Melody, singerDo: number, alwaysMyDo: boolean, rand: () => number): Key;
```

## Test vectors

| Call | Expected |
|---|---|
| `keyForDo(60)` | `{ tonic: "C", accidental: 0, sharps: 0, flats: 0, doMidi: 60 }` |
| `keyForDo(70)` | `{ tonic: "B", accidental: -1, sharps: 0, flats: 2, doMidi: 70 }` |
| `keyForDo(54)` | `{ tonic: "F", accidental: 1, sharps: 6, flats: 0, doMidi: 54 }` |
| `keyForDo(60.5)` | throws RangeError |
| `noteMidi(-3, 60)` | 55 |
| `noteMidi(9, 60)` | 76 (mi in the octave above) |
| `noteMidi(-8, 60)` | 47 (ti, an octave below ti below) |
| `fittingKeys({ degrees: [0, 1, 2, 1, 0], rhythm: [1, 1, 1, 1, 4] }, 60)` | keys with doMidi 57 … 63 (A, B♭, B, C, D♭, D, E♭) |
| same melody with degrees -3 … 7 used, singer 60 | only C (doMidi 60): the melody fills the whole range |
| degrees 0 … 7, singer 60 | doMidi 57, 58, 59, 60 |
| degrees -3 … 4, singer 60 | doMidi 60, 61, 62, 63 |
| degrees -3 … 7, singer 66 | `[]` (only F♯ fits, and it has 6 sharps) |
| `pickKey(m, 66, false, rand)` with degrees -3 … 7 | `keyForDo(66)` (F♯), rand not called |
| `pickKey(m, 66, true, rand)` | `keyForDo(66)`, rand not called |
| `pickKey(m, 60, false, () => 0.5)` with the first melody (7 keys) | doMidi 60 (index 3) |

## Constraints

- Pure functions apart from calling `rand`: no I/O, no module-level mutable state, no console output, no `Math.random`.
- No imports except from `../types.ts` as shown above.
- Export exactly the four functions and two constants above.

## Neighbours

`src/types.ts` is already written; it is included below. Import from it, don't redefine `Key`, `Letter`, `Melody` or `MAJOR_SEMITONES`. (It also defines many types this packet doesn't need; ignore them.)

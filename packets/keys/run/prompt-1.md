# Packet: keys (the range fitter)

## Task

Write `src/core/keys.ts` for a shape-note sight-singing trainer. Each exercise is a melody of scale steps from do (0 = do, 1 = re … 7 = do above, -1 = ti below, -3 = sol below). The app chooses a **key** (a major key, shown as a key signature) for the melody near the singer's own pitch of do, so the key signature varies from exercise to exercise while the notes stay in the singer's range. This module spells keys, turns a scale step into a MIDI note, lists the keys a melody fits, and picks one.

Pitches are MIDI note numbers: 60 = C4 (middle C), one per semitone.

## Interface

```ts
import type { Key, Letter, Melody } from "../types.ts";
import { MAJOR_SEMITONES } from "../types.ts";

/** Keys with more sharps or flats than this are never offered as candidates. */
export const MAX_ACCIDENTALS = 4;

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
| `fittingKeys({ degrees: [0, 1, 2, 1, 0], rhythm: [1, 1, 1, 1, 4] }, 60)` | keys with doMidi 57 (A), 58 (B♭), 60 (C), 62 (D), 63 (E♭): 59 (B, 5 sharps) and 61 (D♭, 5 flats) are excluded |
| same melody with degrees -3 … 7 used, singer 60 | only C (doMidi 60): the melody fills the whole range |
| degrees 0 … 7, singer 60 | doMidi 57, 58, 60 |
| degrees -3 … 4, singer 60 | doMidi 60, 62, 63 |
| degrees -3 … 7, singer 61 | `[]` (only D♭ fits, and it has 5 flats) |
| `pickKey(m, 61, false, rand)` with degrees -3 … 7 | `keyForDo(61)` (D♭), rand not called |
| `pickKey(m, 61, true, rand)` | `keyForDo(61)`, rand not called |
| `pickKey(m, 60, false, () => 0.5)` with the first melody (5 keys) | doMidi 60 (index 2) |

## Constraints

- Pure functions apart from calling `rand`: no I/O, no module-level mutable state, no console output, no `Math.random`.
- No imports except from `../types.ts` as shown above.
- Export exactly the four functions and two constants above.

## Neighbours

`src/types.ts` is already written; it is included below. Import from it, don't redefine `Key`, `Letter`, `Melody` or `MAJOR_SEMITONES`. (It also defines many types this packet doesn't need; ignore them.)

## Rules that always apply

- The file runs under Node's built-in TypeScript type stripping, so use erasable syntax only: no `enum`, no `namespace`, no constructor parameter properties, no decorators.
- Relative imports must include the `.ts` extension (e.g. `./note-types.ts`).
- No npm packages and no Node built-in modules unless the packet's constraints allow them.
- Do not change the exported names or signatures given in the interface.
- No module-level mutable state: no top-level `let` or `var`. Exported functions must give the same result for the same arguments however often or in whatever order they are called. Passing a test by remembering earlier calls is a failure.

## Neighbour file `src/types.ts` (already exists; do not rewrite it)

```ts
// Shared types and constants for the shape-note trainer (SW-44, written by Claude).
// Every core packet imports from this file and nothing else of ours; terms follow CONTEXT.md.
// Erasable TypeScript only: Node and the build strip the types, nothing is compiled.

// ── degrees ──────────────────────────────────────────────────────────────────

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
  /** Octave of that degree relative to do: 0 = the octave starting on do, -1 below, 1 above. */
  octave: number;
  /** Signed offset from that degree in cents; positive = sharp. */
  cents: number;
}

// ── voice parts, keys ────────────────────────────────────────────────────────

export type Clef = "treble" | "bass";
export type VoicePartId = "S" | "A" | "T" | "B";

/** The line a singer sings. Clefs as in Songs of Faith and Praise: tenor reads the bass clef. */
export interface VoicePart {
  id: VoicePartId;
  name: string;
  clef: Clef;
  /** Default pitch of do as a MIDI note number (60 = C4). Tenor C4 is Gary's ear (SW-38); the rest are guesses (SW-57). */
  defaultDoMidi: number;
  /** Clarity cut-off for the pitch detector (SW-37: 0.8 is borderline at G2). */
  clarityGate: number;
}

export const VOICE_PARTS: Readonly<Record<VoicePartId, VoicePart>> = {
  S: { id: "S", name: "Soprano", clef: "treble", defaultDoMidi: 62, clarityGate: 0.8 },
  A: { id: "A", name: "Alto", clef: "treble", defaultDoMidi: 58, clarityGate: 0.8 },
  T: { id: "T", name: "Tenor", clef: "bass", defaultDoMidi: 60, clarityGate: 0.8 },
  B: { id: "B", name: "Bass", clef: "bass", defaultDoMidi: 48, clarityGate: 0.7 },
};

export type Letter = "C" | "D" | "E" | "F" | "G" | "A" | "B";

/** A major key: what the key signature shows and where do sounds. */
export interface Key {
  /** Letter name of the tonic (do). */
  tonic: Letter;
  /** -1 flat, 0 natural, 1 sharp, applied to the tonic letter (B♭ = { tonic: "B", accidental: -1 }). */
  accidental: -1 | 0 | 1;
  /** Number of sharps in the key signature (0 if flats are used). */
  sharps: number;
  /** Number of flats in the key signature (0 if sharps are used). */
  flats: number;
  /** Sounding pitch of do as a MIDI note number. */
  doMidi: number;
}

// ── levels, melodies, exercises ──────────────────────────────────────────────

/** The parameters of one level (SW-34). Degrees are scale steps from do: 0 do … 7 do above, -3 sol below. */
export interface LevelSettings {
  level: number;
  /** Degrees the melody may use, ascending. */
  allowed: readonly number[];
  /** Largest allowed |next - current| in scale steps. */
  maxLeap: number;
  /** Rhythm patterns for bars 1-3; each is note lengths in quarter notes summing to 4. */
  rhythms: readonly (readonly number[])[];
  /** If true, every degree must be one of 0, 2, 4, 7. */
  chord?: boolean;
  /** If set, moves with |d - current| >= prefer get weight x3. */
  prefer?: number;
}

/** What the generator produces: parallel lists of scale steps from do and durations in quarter notes. */
export interface Melody {
  degrees: number[];
  rhythm: number[];
}

/** One short phrase to sing: a melody in a key, on a clef, belonging to a level. */
export interface Exercise {
  level: number;
  key: Key;
  clef: Clef;
  melody: Melody;
}

const QUARTERS = [[1, 1, 1, 1]];
const HALVES = [[1, 1, 1, 1], [1, 1, 2], [2, 1, 1], [2, 2]];
const DOTTED = [...HALVES, [1.5, 0.5, 1, 1], [1, 1, 1.5, 0.5], [1.5, 0.5, 2]];
const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

/** The eight levels, unchanged from the October drills (SW-34, kept in SW-40). */
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

// ── settings ─────────────────────────────────────────────────────────────────

export interface Settings {
  voicePart: VoicePartId;
  /** The singer's pitch of do (MIDI). Their range is sol below to do above: doMidi - 5 … doMidi + 12. */
  doMidi: number;
  /** If true, every exercise uses the singer's own do instead of a key chosen near it. */
  alwaysMyDo: boolean;
  /** Strict mode: ±25 cents instead of ±50. Applies from the next attempt. */
  strict: boolean;
}

// ── scoring (SW-39) ──────────────────────────────────────────────────────────

/** Everything scoring reacts to. Each event carries its own time in milliseconds; scoring never reads a clock. */
export type ScoringEvent =
  | { type: "reading"; t: number; hz: number | null }
  | { type: "toneStart"; t: number }
  | { type: "toneEnd"; t: number }
  | { type: "hint"; t: number }
  | { type: "skip"; t: number };

export type NoteOutcome = "unaided" | "helped" | "skipped";

/** The judgement on one note of an attempt. */
export interface NoteResult {
  outcome: NoteOutcome;
  /** Median signed error over the accepted hold, in cents; null when skipped. */
  cents: number | null;
  /** From the note becoming current to the start of the accepted hold, tone time excluded; null when skipped. */
  settleMs: number | null;
}

export type LiveStatus = "listening" | "sharp" | "flat" | "holding";

/** What the exercise screen shows at this moment. */
export interface LiveView {
  /** Index of the current note; equals the note count once the attempt is finished. */
  noteIndex: number;
  status: LiveStatus;
  /** Smoothed signed error against the current note, in cents (octave-folded); null when listening. */
  cents: number | null;
  /** The degree actually being sung, only when it isn't the target and is outside the band. */
  singing: Degree | null;
  /** True once "play this note" should be offered (8 s without acceptance, tone time excluded). */
  hintOffered: boolean;
  /** Results so far, one per finished note. */
  results: NoteResult[];
  done: boolean;
}

// ── history ──────────────────────────────────────────────────────────────────

/** One singing of an exercise, as stored on the device. */
export interface Attempt {
  exercise: Exercise;
  results: NoteResult[];
  strict: boolean;
  /** ISO 8601 time the attempt finished. */
  finishedAt: string;
}
```

## Tests `src/core/keys.test.ts` (run with `node --test`; your file must make these pass)

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { keyForDo, noteMidi, fittingKeys, pickKey, MAX_ACCIDENTALS, KEY_SPREAD } from "./keys.ts";
import type { Melody } from "../types.ts";

// [pitch class, tonic, accidental, sharps, flats]
const SPELLING: Array<[number, string, number, number, number]> = [
  [0, "C", 0, 0, 0], [1, "D", -1, 0, 5], [2, "D", 0, 2, 0], [3, "E", -1, 0, 3],
  [4, "E", 0, 4, 0], [5, "F", 0, 0, 1], [6, "F", 1, 6, 0], [7, "G", 0, 1, 0],
  [8, "A", -1, 0, 4], [9, "A", 0, 3, 0], [10, "B", -1, 0, 2], [11, "B", 0, 5, 0],
];

const mel = (degrees: number[]): Melody => ({ degrees, rhythm: degrees.map((_, i) => (i === degrees.length - 1 ? 4 : 1)) });
const SMALL = mel([0, 1, 2, 1, 0]);
const FULL = mel([0, -1, -3, 0, 4, 7, 6, 4, 2, 0]);    // sol below to do above: -5 … +12 semitones
const UP = mel([0, 2, 4, 7, 6, 4, 2, 0]);              // do to do above: 0 … +12
const LOW = mel([0, -1, -3, -1, 0, 2, 4, 2, 0]);       // sol below to sol: -5 … +7
const dos = (keys: { doMidi: number }[]) => keys.map((k) => k.doMidi);

test("constants", () => {
  assert.equal(MAX_ACCIDENTALS, 4);
  assert.equal(KEY_SPREAD, 3);
});

test("keyForDo spells every pitch class from the table, in every octave", () => {
  for (const base of [36, 48, 60, 72]) for (const [pc, tonic, accidental, sharps, flats] of SPELLING) {
    const doMidi = base + pc;
    assert.deepEqual(keyForDo(doMidi), { tonic, accidental, sharps, flats, doMidi },
      `keyForDo(${doMidi}): RULE: spell by pitch class doMidi mod 12 = ${pc} from the table, and carry doMidi through unchanged`);
  }
});

test("keyForDo returns a new object each time", () => {
  const a = keyForDo(60);
  a.sharps = 99;
  assert.equal(keyForDo(60).sharps, 0, "RULE: changing a returned key must not change later results (no shared objects)");
});

test("keyForDo rejects bad input", () => {
  for (const x of [60.5, -1, 128, NaN, Infinity]) assert.throws(() => keyForDo(x), RangeError, `RULE: keyForDo(${x}): doMidi must be an integer from 0 to 127`);
  assert.equal(keyForDo(0).tonic, "C");
  assert.equal(keyForDo(127).tonic, "G");
});

test("noteMidi: scale steps to MIDI notes", () => {
  const rows: Array<[number, number, number]> = [
    [0, 60, 60], [1, 60, 62], [2, 60, 64], [3, 60, 65], [4, 60, 67], [5, 60, 69], [6, 60, 71],
    [7, 60, 72], [9, 60, 76], [14, 60, 84], [-1, 60, 59], [-2, 60, 57], [-3, 60, 55], [-7, 60, 48], [-8, 60, 47],
    [0, 58, 58], [4, 58, 65], [-3, 63, 58],
  ];
  for (const [step, doMidi, want] of rows) assert.equal(noteMidi(step, doMidi), want,
    `noteMidi(${step}, ${doMidi}). RULE: doMidi + 12 * floor(step / 7) + MAJOR_SEMITONES[((step % 7) + 7) % 7]`);
  assert.throws(() => noteMidi(0.5, 60), RangeError, "RULE: step must be an integer");
  assert.throws(() => noteMidi(0, 60.5), RangeError, "RULE: doMidi must be an integer");
});

test("fittingKeys: candidates within 3 semitones, at most 4 sharps or flats, melody in range", () => {
  assert.deepEqual(dos(fittingKeys(SMALL, 60)), [57, 58, 60, 62, 63],
    "small melody, singer do 60: every do from 57 to 63 fits the range; 59 (B, 5 sharps) and 61 (D flat, 5 flats) are dropped for too many accidentals");
  assert.deepEqual(dos(fittingKeys(FULL, 60)), [60],
    "melody from sol below to do above fills the singer's whole range (55 … 72), so only the singer's own do fits");
  assert.deepEqual(dos(fittingKeys(UP, 60)), [57, 58, 60],
    "melody do … do above: the top note doMidi + 12 must be <= 72, so do <= 60");
  assert.deepEqual(dos(fittingKeys(LOW, 60)), [60, 62, 63],
    "melody sol below … sol: the bottom note doMidi - 5 must be >= 55, so do >= 60");
  assert.deepEqual(dos(fittingKeys(UP, 61)), [58, 60],
    "singer do 61: do 58 … 61 keep the top note <= 73; 59 and 61 have 5 accidentals");
  assert.deepEqual(fittingKeys(FULL, 61), [], "singer do 61, full-range melody: only 61 fits the range, and D flat has 5 flats");
});

test("fittingKeys returns complete keys in ascending order", () => {
  const keys = fittingKeys(SMALL, 60);
  assert.deepEqual(keys[0], { tonic: "A", accidental: 0, sharps: 3, flats: 0, doMidi: 57 });
  assert.deepEqual(keys[1], { tonic: "B", accidental: -1, sharps: 0, flats: 2, doMidi: 58 });
  assert.deepEqual(keys[4], { tonic: "E", accidental: -1, sharps: 0, flats: 3, doMidi: 63 });
  for (const singerDo of [43, 48, 55, 58, 60, 62, 66, 70]) {
    const got = fittingKeys(SMALL, singerDo);
    for (const k of got) {
      assert.ok(Math.abs(k.doMidi - singerDo) <= 3, `singer ${singerDo}: key do ${k.doMidi} is more than 3 semitones away`);
      assert.ok(k.sharps <= 4 && k.flats <= 4, `singer ${singerDo}: key do ${k.doMidi} has too many accidentals`);
      assert.deepEqual(k, keyForDo(k.doMidi), "RULE: each key is spelled exactly as keyForDo spells it");
    }
    assert.deepEqual(dos(got), [...dos(got)].sort((a, b) => a - b), `singer ${singerDo}: RULE: ascending doMidi`);
  }
  assert.throws(() => fittingKeys(SMALL, 60.5), RangeError);
  assert.throws(() => fittingKeys(SMALL, 200), RangeError);
});

test("pickKey: always-my-do and the empty-list fallback use the singer's do without calling rand", () => {
  let calls = 0;
  const rand = () => { calls++; return 0.5; };
  assert.deepEqual(pickKey(SMALL, 61, true, rand), keyForDo(61), "RULE: alwaysMyDo gives keyForDo(singerDo) even with 5 flats");
  assert.deepEqual(pickKey(SMALL, 60, true, rand), keyForDo(60));
  assert.deepEqual(pickKey(FULL, 61, false, rand), keyForDo(61), "RULE: when no key fits, fall back to keyForDo(singerDo)");
  assert.equal(calls, 0, "RULE: rand must not be called for alwaysMyDo or the fallback");
});

test("pickKey: one rand() call indexes the fitting keys", () => {
  const seq = (v: number) => { let calls = 0; return { rand: () => { calls++; return v; }, calls: () => calls }; };
  const cases: Array<[number, number]> = [[0, 57], [0.2, 58], [0.5, 60], [0.7, 62], [0.999, 63]];
  for (const [v, want] of cases) {
    const r = seq(v);
    assert.equal(pickKey(SMALL, 60, false, r.rand).doMidi, want, `rand ${v} over 5 keys: RULE: keys[Math.floor(rand() * keys.length)]`);
    assert.equal(r.calls(), 1, "RULE: rand is called exactly once when choosing");
  }
  const one = seq(0.9);
  assert.equal(pickKey(FULL, 60, false, one.rand).doMidi, 60, "one fitting key: that key");
  assert.equal(one.calls(), 1);
});

test("pickKey never calls Math.random and gives the same key for the same rand", () => {
  const real = Math.random;
  Math.random = () => { throw new Error("pickKey must use the rand() passed in, not Math.random"); };
  try {
    for (const v of [0.1, 0.9, 0.4, 0.1]) assert.deepEqual(pickKey(SMALL, 60, false, () => v), pickKey(SMALL, 60, false, () => v));
  } finally {
    Math.random = real;
  }
});
```

Write `src/core/keys.ts` now. Reply with exactly one ```ts block containing the whole file.
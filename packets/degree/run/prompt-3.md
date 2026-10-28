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

## Tests `src/core/degree.test.ts` (run with `node --test`; your file must make these pass)

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { hzToDegree, degreeToHz, scalePosition } from "./degree.ts";

const C4 = 261.6255653005986;
const G3 = 195.99771799087463;

const close = (actual: number, expected: number, what: string, eps = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${what}: expected ${expected}, got ${actual}`);

type Row = [hz: number, doHz: number, degree: string, index: number, octave: number, cents: number];

const SCALE = [0, 2, 4, 5, 7, 9, 11];

/** Explains the rule for one row, so a failure says what the right reasoning is. */
const why = (hz: number, doHz: number, octave: number, index: number) => {
  const s = 12 * Math.log2(hz / doHz);
  const p = 12 * octave + SCALE[index];
  return `RULE: s = 12 * log2(hz / doHz) = ${s.toFixed(4)} semitones from do. ` +
    `Compare the ABSOLUTE distance |s - p| for scale positions p = 12 * octave + MAJOR_SEMITONES[index] across neighbouring octaves (octave can be -1, 0, +1 relative to floor(s / 12), and negative), ` +
    `and pick the smallest. Here the nearest is p = ${p} (index ${index}, octave ${octave}), |s - p| = ${Math.abs(s - p).toFixed(4)}. ` +
    `octave is the octave of that scale tone (so a slightly flat do is octave 0, not -1), and cents = 100 * (s - p) = ${(100 * (s - p)).toFixed(4)}.`;
};

const check = (rows: Row[]) => {
  for (const [hz, doHz, degree, index, octave, cents] of rows) {
    const r = hzToDegree(hz, doHz);
    const where = `hzToDegree(${hz}, ${doHz})`;
    const rule = why(hz, doHz, octave, index);
    assert.equal(r.degree, degree, `${where}.degree should be "${degree}", got "${r.degree}". ${rule}`);
    assert.equal(r.index, index, `${where}.index should be ${index}, got ${r.index}. ${rule}`);
    assert.equal(r.octave, octave, `${where}.octave should be ${octave}, got ${r.octave}. ${rule}`);
    close(r.cents, cents, `${where}.cents (${rule})`);
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
      const rule = `RULE: degreeToHz(d, octave, doHz) = doHz * 2 ** ((12 * octave + MAJOR_SEMITONES[index]) / 12), and hzToDegree must invert it exactly: same degree, same octave, cents 0.`;
      assert.equal(r.degree, d, `round trip ${d} octave ${octave}: degree. ${rule}`);
      assert.equal(r.index, i, `round trip ${d} octave ${octave}: index. ${rule}`);
      assert.equal(r.octave, octave, `round trip ${d} octave ${octave}: octave. ${rule}`);
      close(r.cents, 0, `${d} ${octave} cents`);
    });
  }
});

test("degreeToHz rejects bad input", () => {
  assert.throws(() => degreeToHz("do", 0, 0), RangeError);
  assert.throws(() => degreeToHz("do", 0.5, C4), RangeError);
  assert.throws(() => degreeToHz("so" as never, 0, C4), RangeError);
});

const hzAt = (semitones: number, doHz: number) => doHz * 2 ** (semitones / 12);

test("scalePosition: scale tones land on whole steps from do", () => {
  // [semitones from do, expected position]
  const rows: Array<[number, number]> = [
    [0, 0], [2, 1], [4, 2], [5, 3], [7, 4], [9, 5], [11, 6], [12, 7], [14, 8], [24, 14],
    [-1, -1], [-3, -2], [-5, -3], [-7, -4], [-12, -7], [-13, -8],
  ];
  for (const doHz of [C4, G3]) for (const [semi, pos] of rows) {
    close(scalePosition(hzAt(semi, doHz), doHz), pos,
      `scalePosition ${semi} semitones from do. RULE: octave = floor(s / 12), r = s - 12 * octave; a scale tone with MAJOR_SEMITONES[i] = r is at 7 * octave + i`, 1e-9);
  }
});

test("scalePosition: between scale tones, linear in semitones", () => {
  const rows: Array<[number, number, string]> = [
    [1, 0.5, "C sharp: halfway from do (0) to re (1), a whole tone"],
    [3, 1.5, "E flat: halfway from re to mi"],
    [4.5, 2.5, "a quarter tone above mi: halfway to fa, which is only a semitone away"],
    [6, 3.5, "F sharp: halfway from fa (5) to sol (7)"],
    [10, 5.5, "B flat: halfway from la to ti"],
    [11.5, 6.5, "a quarter tone above ti: halfway to do above (next = 12)"],
    [-2, -1.5, "B flat below: octave -1, r = 10, between la (-2) and ti (-1)"],
    [-0.5, -0.5, "a quarter tone below do: octave -1, r = 11.5, between ti below (-1) and do (0)"],
    [0.5, 0.25, "a quarter tone above do: a quarter of the way to re"],
    [7.2, 4.1, "20 cents sharp of sol: a tenth of the way from sol to la"],
  ];
  for (const [semi, pos, why] of rows) close(scalePosition(hzAt(semi, C4), C4), pos, `scalePosition ${semi} semitones (${why}). RULE: 7 * octave + i + (r - MAJOR_SEMITONES[i]) / (next - MAJOR_SEMITONES[i])`, 1e-9);
});

test("scalePosition is continuous and increasing", () => {
  let prev = -Infinity;
  for (let c = -2400; c <= 2400; c += 7) {
    const p = scalePosition(hzAt(c / 100, G3), G3);
    assert.ok(p > prev, `RULE: a higher pitch is always higher on the scale; ${c} cents gave ${p} after ${prev}`);
    assert.ok(p - prev < 0.08 || prev === -Infinity, `RULE: no jumps; ${c} cents gave ${p} after ${prev}`);
    prev = p;
  }
});

test("scalePosition agrees with hzToDegree on scale tones, in any call order", () => {
  for (let octave = 1; octave >= -2; octave--) for (let i = 6; i >= 0; i--) {
    const hz = degreeToHz(["do", "re", "mi", "fa", "sol", "la", "ti"][i] as never, octave, G3);
    close(scalePosition(hz, G3), 7 * octave + i, `scalePosition of degree ${i} octave ${octave}`, 1e-9);
    assert.equal(hzToDegree(hz, G3).index, i);
    close(scalePosition(hz, G3), 7 * octave + i, "same answer when called again", 1e-9);
  }
});

test("scalePosition rejects bad input", () => {
  for (const [hz, d] of [[0, C4], [-1, C4], [NaN, C4], [Infinity, C4], [C4, 0], [C4, NaN]]) {
    assert.throws(() => scalePosition(hz, d), RangeError, `RULE: hz ${hz}, doHz ${d}: both must be finite numbers > 0`);
  }
});
```

## Your previous attempt at `src/core/degree.ts`

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
export function hzToDegree(hz: number, doHz: number): DegreeReading {
  if (!Number.isFinite(hz) || hz <= 0) throw new RangeError("hz must be a finite number > 0");
  if (!Number.isFinite(doHz) || doHz <= 0) throw new RangeError("doHz must be a finite number > 0");

  const s = 12 * Math.log2(hz / doHz);
  let bestIndex = -1;
  let bestOctave = 0;
  let bestDistance = Infinity;

  // Check a few octaves around the natural octave
  for (let octave = Math.floor(s / 12) - 1; octave <= Math.floor(s / 12) + 1; octave++) {
    for (let i = 0; i < 7; i++) {
      const p = 12 * octave + MAJOR_SEMITONES[i];
      const distance = Math.abs(s - p);
      if (distance < bestDistance || (distance === bestDistance && (bestIndex === -1 || i < bestIndex))) {
        bestDistance = distance;
        bestIndex = i;
        bestOctave = octave;
      }
    }
  }

  const p = 12 * bestOctave + MAJOR_SEMITONES[bestIndex];
  const cents = 100 * (s - p);

  return {
    degree: DEGREES[bestIndex],
    index: bestIndex,
    octave: bestOctave,
    cents
  };
}

/** Frequency of `degree` in `octave` (0 = the octave starting on do), given do's frequency.
 *  hz = doHz * 2 ** ((12 * octave + MAJOR_SEMITONES[index]) / 12).
 *  Throws RangeError if doHz is not a finite number > 0, octave is not an integer,
 *  or degree is not one of the seven degrees. */
export function degreeToHz(degree: Degree, octave: number, doHz: number): number {
  if (!Number.isFinite(doHz) || doHz <= 0) throw new RangeError("doHz must be a finite number > 0");
  if (!Number.isInteger(octave)) throw new RangeError("octave must be an integer");
  const index = DEGREES.indexOf(degree);
  if (index === -1) throw new RangeError("degree must be one of the seven degrees");

  return doHz * 2 ** ((12 * octave + MAJOR_SEMITONES[index]) / 12);
}

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
export function scalePosition(hz: number, doHz: number): number {
  if (!Number.isFinite(hz) || hz <= 0) throw new RangeError("hz must be a finite number > 0");
  if (!Number.isFinite(doHz) || doHz <= 0) throw new RangeError("doHz must be a finite number > 0");

  const s = 12 * Math.log2(hz / doHz);
  const octave = Math.floor(s / 12);
  const r = s - 12 * octave;

  let i;
  for (i = 0; i < 6; i++) {
    if (MAJOR_SEMITONES[i] <= r && r < MAJOR_SEMITONES[i + 1]) break;
  }
  // If we didn't find it, it's the last one
  if (i === 6 || r >= MAJOR_SEMITONES[6]) i = 5;

  const next = i === 6 ? 12 : MAJOR_SEMITONES[i + 1];
  const position = 7 * octave + i + (r - MAJOR_SEMITONES[i]) / (next - MAJOR_SEMITONES[i]);

  return position;
}
```

## It failed the tests. Test output (tail)

```
✔ in-tune degrees of C major, octave 0 (0.765375ms)
✔ octaves above and below do (0.086ms)
✔ sharp and flat readings (0.050958ms)
✔ chromatic notes go to the nearer whole-tone neighbour (0.043417ms)
✔ another key: do = G3 (0.041334ms)
✔ hzToDegree rejects bad input (0.161917ms)
✔ degreeToHz (0.051709ms)
✔ degreeToHz and hzToDegree round-trip (0.107916ms)
✔ degreeToHz rejects bad input (0.055042ms)
✔ scalePosition: scale tones land on whole steps from do (0.121959ms)
✖ scalePosition: between scale tones, linear in semitones (0.277166ms)
✖ scalePosition is continuous and increasing (0.125709ms)
✔ scalePosition agrees with hzToDegree on scale tones, in any call order (0.082542ms)
✔ scalePosition rejects bad input (0.058667ms)
ℹ tests 14
ℹ suites 0
ℹ pass 12
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 83.927583

✖ failing tests:

test at src/core/degree.test.ts:140:1
✖ scalePosition: between scale tones, linear in semitones (0.277166ms)
  AssertionError [ERR_ASSERTION]: scalePosition 11.5 semitones (a quarter tone above ti: halfway to do above (next = 12)). RULE: 7 * octave + i + (r - MAJOR_SEMITONES[i]) / (next - MAJOR_SEMITONES[i]): expected 6.5, got 6.25
      at close (file:///Users/gary/Library/Caches/packet-driver/sw46/degree/qwen3-coder_30b/src/core/degree.test.ts:9:10)
      at TestContext.<anonymous> (file:///Users/gary/Library/Caches/packet-driver/sw46/degree/qwen3-coder_30b/src/core/degree.test.ts:153:40)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
  }

test at src/core/degree.test.ts:156:1
✖ scalePosition is continuous and increasing (0.125709ms)
  AssertionError [ERR_ASSERTION]: RULE: no jumps; -1196 cents gave -6.98 after -7.515
      at TestContext.<anonymous> (file:///Users/gary/Library/Caches/packet-driver/sw46/degree/qwen3-coder_30b/src/core/degree.test.ts:161:12)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
  }
```

Fix the problem. Reply with the complete corrected `src/core/degree.ts` in one ```ts block.
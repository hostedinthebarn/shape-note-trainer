# Packet: summary (summary + progression)

## Task

Write `src/core/summary.ts` for a shape-note sight-singing trainer. A singer sings an exercise one note at a time; each note gets a **note result**: `"unaided"` (in tune with no help), `"helped"` (in tune after the app played the note) or `"skipped"`. In-tune notes also carry `cents`, the median error (positive = sharp). This module does two things:

1. **Summary** of one attempt: the counts, which notes were trouble, and whether the singer leans sharp or flat.
2. **Progression** across attempts: a **clean attempt** is one where every note is unaided. Three clean attempts in a row at a level suggest moving up a level. Levels are never locked; this is only a suggestion.

## Interface

```ts
import type { NoteResult, Attempt } from "../types.ts";

/** A mean error beyond this many cents (strictly greater) is reported as a lean. */
export const LEAN_CENTS = 15;
/** Clean attempts in a row at a level before moving up is suggested. */
export const CLEAN_TO_SUGGEST = 3;
/** The highest level; there is nothing to move up to from here. */
export const TOP_LEVEL = 8;

export interface Summary {
  /** Number of notes (results.length). */
  total: number;
  unaided: number;
  helped: number;
  skipped: number;
  /** Indices (into results) of the notes that were helped or skipped, ascending. */
  trouble: number[];
  /** Mean of `cents` over the notes whose cents is a number (unaided and helped); null if there are none. */
  meanCents: number | null;
  /** "sharp" if meanCents > LEAN_CENTS, "flat" if meanCents < -LEAN_CENTS, otherwise null. */
  lean: "sharp" | "flat" | null;
  /** True when there is at least one note and every note is unaided. */
  clean: boolean;
}

/** Summarise one attempt's results. Does not modify `results`. */
export function summarize(results: readonly NoteResult[]): Summary;

export interface Progress {
  level: number;
  /** How many of the most recent attempts at this level were clean, counting back from the
   *  latest and stopping at the first one that wasn't. Attempts at other levels are ignored
   *  (they neither count nor break the streak). */
  cleanStreak: number;
  /** cleanStreak >= CLEAN_TO_SUGGEST and level < TOP_LEVEL. */
  suggestUp: boolean;
}

/** Progress at `level`, from the singer's attempts in the order they were sung (oldest first).
 *  An attempt is at a level when attempt.exercise.level equals it; it is clean when
 *  summarize(attempt.results).clean. Does not modify `attempts`.
 *  Throws RangeError if level is not an integer from 1 to TOP_LEVEL. */
export function progress(attempts: readonly Attempt[], level: number): Progress;
```

## Test vectors

`U(c)` is `{ outcome: "unaided", cents: c, settleMs: 400 }`, `H(c)` is helped, `S` is `{ outcome: "skipped", cents: null, settleMs: null }`.

| Call | Expected |
|---|---|
| `summarize([U(5), U(-3), U(10)])` | total 3, unaided 3, trouble [], meanCents 4, lean null, clean true |
| `summarize([U(20), H(30), S, U(10)])` | unaided 2, helped 1, skipped 1, trouble [1, 2], meanCents 20, lean "sharp", clean false |
| `summarize([U(-16)])` | meanCents -16, lean "flat" |
| `summarize([U(15)])` | lean null (15 is not beyond 15) |
| `summarize([S, S])` | meanCents null, lean null, trouble [0, 1] |
| `summarize([])` | total 0, meanCents null, clean false |
| `progress([clean@2, clean@2, clean@2], 2)` | cleanStreak 3, suggestUp true |
| `progress([clean@2, clean@2, messy@2], 2)` | cleanStreak 0 |
| `progress([messy@2, clean@2, clean@5, clean@2, clean@2], 2)` | cleanStreak 3 (the level-5 attempt is ignored) |
| `progress([clean@8 ×4], 8)` | cleanStreak 4, suggestUp false |
| `progress([], 3)` | cleanStreak 0, suggestUp false |
| `progress([], 0)` | throws RangeError |

## Constraints

- Pure functions: no I/O, no module-level mutable state, no console output, no randomness, no clock.
- No imports except the type import from `../types.ts` shown above.
- Export exactly the two functions, two interfaces and three constants above.

## Neighbours

`src/types.ts` is already written; it is included below. Import from it, don't redefine `NoteResult` or `Attempt`. (It also defines many types this packet doesn't need; ignore them.)

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

## Tests `src/core/summary.test.ts` (run with `node --test`; your file must make these pass)

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, progress, LEAN_CENTS, CLEAN_TO_SUGGEST, TOP_LEVEL } from "./summary.ts";
import type { NoteResult, Attempt } from "../types.ts";

const U = (cents: number): NoteResult => ({ outcome: "unaided", cents, settleMs: 400 });
const H = (cents: number): NoteResult => ({ outcome: "helped", cents, settleMs: 9000 });
const S: NoteResult = { outcome: "skipped", cents: null, settleMs: null };

const attempt = (level: number, results: NoteResult[], i = 0): Attempt => ({
  exercise: {
    level,
    key: { tonic: "C", accidental: 0, sharps: 0, flats: 0, doMidi: 60 },
    clef: "bass",
    melody: { degrees: results.map(() => 0), rhythm: results.map(() => 1) },
  },
  results,
  strict: false,
  finishedAt: new Date(Date.UTC(2026, 9, 28, 12, i)).toISOString(),
});
const clean = (level: number, i = 0) => attempt(level, [U(3), U(-8), U(1)], i);
const messy = (level: number, i = 0) => attempt(level, [U(3), H(12), U(1)], i);
const skippy = (level: number, i = 0) => attempt(level, [U(3), S, U(1)], i);

const close = (a: number | null, b: number, what: string) =>
  assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${what}: expected ${b}, got ${a}`);

test("constants", () => {
  assert.equal(LEAN_CENTS, 15);
  assert.equal(CLEAN_TO_SUGGEST, 3);
  assert.equal(TOP_LEVEL, 8);
});

test("summarize: all unaided is clean", () => {
  const s = summarize([U(5), U(-3), U(10)]);
  assert.equal(s.total, 3);
  assert.equal(s.unaided, 3);
  assert.equal(s.helped, 0);
  assert.equal(s.skipped, 0);
  assert.deepEqual(s.trouble, [], "RULE: trouble lists only helped or skipped notes");
  close(s.meanCents, 4, "meanCents");
  assert.equal(s.lean, null, "RULE: |4| is within 15 cents, no lean");
  assert.equal(s.clean, true, "RULE: clean when there is at least one note and every note is unaided");
});

test("summarize: counts, trouble notes and a sharp lean", () => {
  const s = summarize([U(20), H(30), S, U(10)]);
  assert.deepEqual([s.total, s.unaided, s.helped, s.skipped], [4, 2, 1, 1]);
  assert.deepEqual(s.trouble, [1, 2], "RULE: trouble is the ascending indices of helped and skipped notes");
  close(s.meanCents, 20, "RULE: meanCents averages unaided AND helped cents (20, 30, 10), skipping the skipped note");
  assert.equal(s.lean, "sharp", "RULE: meanCents 20 > 15 is a sharp lean");
  assert.equal(s.clean, false, "RULE: any helped or skipped note makes the attempt not clean");
});

test("summarize: lean thresholds are strict", () => {
  assert.equal(summarize([U(-16)]).lean, "flat", "RULE: -16 < -15 is a flat lean");
  assert.equal(summarize([U(15)]).lean, null, "RULE: 15 is not beyond 15");
  assert.equal(summarize([U(-15)]).lean, null, "RULE: -15 is not beyond -15");
  assert.equal(summarize([U(15.5)]).lean, "sharp");
  assert.equal(summarize([U(40), U(-40)]).lean, null, "RULE: sharp and flat notes cancel in the mean");
  assert.equal(summarize([H(-30), S, U(-10)]).lean, "flat", "RULE: helped notes count toward the lean (mean -20)");
});

test("summarize: no cents, no notes", () => {
  const s = summarize([S, S]);
  assert.equal(s.meanCents, null, "RULE: no unaided or helped notes means meanCents is null");
  assert.equal(s.lean, null);
  assert.deepEqual(s.trouble, [0, 1]);
  assert.equal(s.clean, false);
  const e = summarize([]);
  assert.deepEqual(e, { total: 0, unaided: 0, helped: 0, skipped: 0, trouble: [], meanCents: null, lean: null, clean: false },
    "RULE: an empty attempt has no notes and is not clean");
});

test("summarize does not modify its input and gives the same answer every time", () => {
  const results = [U(20), H(30), S, U(10)];
  const copy = structuredClone(results);
  const a = summarize(results);
  summarize([U(1)]);
  assert.deepEqual(summarize(results), a, "RULE: same input, same summary, whatever was called in between");
  assert.deepEqual(results, copy, "RULE: summarize must not change the results array");
  a.trouble.push(99);
  assert.deepEqual(summarize(results).trouble, [1, 2], "RULE: each summary is a new object");
});

test("progress: three clean in a row suggests moving up", () => {
  const p = progress([clean(2, 0), clean(2, 1), clean(2, 2)], 2);
  assert.deepEqual(p, { level: 2, cleanStreak: 3, suggestUp: true });
  assert.equal(progress([clean(2, 0), clean(2, 1)], 2).suggestUp, false, "RULE: two is not enough");
  assert.equal(progress([clean(2, 0), clean(2, 1), clean(2, 2), clean(2, 3)], 2).cleanStreak, 4);
});

test("progress: the streak counts back from the latest attempt at the level", () => {
  assert.equal(progress([clean(2, 0), clean(2, 1), messy(2, 2)], 2).cleanStreak, 0,
    "RULE: the latest attempt at the level was not clean, so the streak is 0");
  assert.equal(progress([clean(2, 0), skippy(2, 1), clean(2, 2), clean(2, 3)], 2).cleanStreak, 2,
    "RULE: count back from the latest, stop at the first attempt that wasn't clean");
  assert.equal(progress([messy(2, 0), clean(2, 1), clean(5, 2), clean(2, 3), clean(2, 4)], 2).cleanStreak, 3,
    "RULE: attempts at other levels are ignored; they neither count nor break the streak");
  assert.equal(progress([clean(2, 0), clean(2, 1), messy(5, 2), clean(2, 3)], 2).cleanStreak, 3,
    "RULE: a messy attempt at another level doesn't break this level's streak");
  assert.equal(progress([clean(5, 0), clean(5, 1), clean(5, 2)], 2).cleanStreak, 0, "no attempts at level 2");
  assert.equal(progress([attempt(2, [])], 2).cleanStreak, 0, "RULE: an empty attempt is not clean");
});

test("progress: no suggestion beyond the top level", () => {
  const p = progress([clean(8, 0), clean(8, 1), clean(8, 2), clean(8, 3)], 8);
  assert.deepEqual(p, { level: 8, cleanStreak: 4, suggestUp: false }, "RULE: level 8 is the top; nothing to suggest");
  assert.deepEqual(progress([], 3), { level: 3, cleanStreak: 0, suggestUp: false });
});

test("progress: strict and normal attempts count the same", () => {
  const strict = { ...clean(4, 0), strict: true };
  assert.equal(progress([strict, clean(4, 1), strict], 4).cleanStreak, 3);
});

test("progress does not modify its input", () => {
  const list = [clean(2, 0), messy(2, 1), clean(2, 2)];
  const copy = structuredClone(list);
  progress(list, 2);
  progress(list, 5);
  assert.deepEqual(list, copy, "RULE: progress must not reorder or change the attempts");
  assert.equal(progress(list, 2).cleanStreak, 1);
});

test("progress rejects bad levels", () => {
  for (const l of [0, 9, 2.5, NaN, -1]) assert.throws(() => progress([], l), RangeError, `RULE: level ${l} must be an integer from 1 to 8`);
});
```

Write `src/core/summary.ts` now. Reply with exactly one ```ts block containing the whole file.
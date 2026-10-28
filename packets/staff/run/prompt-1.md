# Packet: staff (staff arithmetic)

## Task

Write `src/core/staff.ts` for a shape-note sight-singing trainer: the small pure functions a staff layout needs. They give where a scale step sits on a five-line staff in a given key and clef, where the key signature's sharps or flats go, how a rhythm splits into 4/4 bars, and how bars break into lines of music ("systems"). There is no drawing here.

**Coordinates.** Within each system (one line of music), x runs right from the system's left edge (0), and y runs **down** from the top staff line (y = 0). So the five staff lines are at y = 0, 1, 2, 3, 4. A note's **staff position** `p` is counted in half-spaces up from the bottom line: p = 0 is the bottom line, 1 is the space above it, 8 is the top line, -2 is the first ledger line below and 10 the first above. `yOf(p) = 4 - p / 2`.

Melody steps are scale steps from do (0 = do, 1 = re … 7 = do above, -3 = sol below); rhythm values are in quarter notes; all bars are 4/4.


## Interface

```ts
import type { Clef, Key, Letter } from "../types.ts";

/** x advance per note, by duration in quarter notes (keys are String(duration)). */
export const NOTE_WIDTH: Readonly<Record<string, number>> = { "0.5": 2, "1": 3, "1.5": 3.5, "2": 4, "3": 5, "4": 6 };

export function yOf(p: number): number;   // 4 - p / 2
export function staffPosition(step: number, key: Key, clef: Clef): number;
export function keySignature(key: Key, clef: Clef): number[];
export function splitBars(rhythm: readonly number[]): number[][];
export function breakSystems(barWidths: readonly number[], start: number, gap: number, maxWidth: number): number[][];
```

## Rules

**`staffPosition`.** With LETTERS = C D E F G A B (index 0 to 6), do's diatonic number is `LETTERS.indexOf(key.tonic) + 7 * (Math.floor((key.doMidi - key.accidental) / 12) - 1)`. (Removing the accidental gives the natural note's octave, so B♭3 counts as a B in octave 3.) The note's position is `do's diatonic number + step - bottom`, where bottom is 30 for treble (E4) and 18 for bass (G2).

**`keySignature`.** Sharps (treble) are at positions `[8, 5, 9, 6, 3, 7, 4]` and flats (treble) at `[4, 7, 3, 6, 2, 5, 1]`. Take the first `key.sharps` of the sharp list, or else the first `key.flats` of the flat list. For the bass clef, subtract 2 from each position.

**`splitBars`.** Group note indices into bars of exactly 4 quarter notes. Throw RangeError if:
- a duration isn't a key of NOTE_WIDTH;
- a note would make a bar exceed 4;
- the last bar is incomplete.

**`breakSystems`.** Greedy line breaking by whole bars. Returns groups of bar indices, in order. A system's width is `start`, plus the widths of its bars, plus `gap` between consecutive bars (not before the first). Go through the bars in order. A bar joins the current system if the width stays `<= maxWidth`; otherwise it starts a new system (whose width starts again at `start`). The first bar of a system always goes in, even if it is too wide. No bars gives `[]`. Don't modify the input.

## Test vectors

| Call | Expected |
|---|---|
| `staffPosition(0, C major do 60, "bass")` | 10 (C4: the first ledger line above the bass staff) |
| `staffPosition(0, B♭ do 58, "bass")` | 9 |
| `staffPosition(0, C major do 60, "treble")` | -2 |
| `keySignature(D major, "bass")` | `[6, 3]` |
| `keySignature(A♭ major, "treble")` | `[4, 7, 3, 6]` |
| `splitBars([1.5, 0.5, 2, 3, 1, 4])` | `[[0, 1, 2], [3, 4], [5]]` |
| `splitBars([3, 2])` | throws RangeError |
| `breakSystems([12, 12, 12, 6], 4.8, 1, 30)` | `[[0, 1], [2, 3]]` |
| `breakSystems([12, 12, 12, 6], 4.8, 1, 5)` | `[[0], [1], [2], [3]]` |

## Constraints

- Pure functions: no I/O, no module-level mutable state, no console output.
- No imports except the type import from `../types.ts` shown above.
- Export exactly the five functions and the constant above.

## Neighbours

`src/types.ts` is already written; it is included below. Don't redefine `Clef`, `Key` or `Letter`. (It also defines many types this packet doesn't need; ignore them.)

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

## Tests `src/core/staff.test.ts` (run with `node --test`; your file must make these pass)

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { staffPosition, keySignature, splitBars, yOf, breakSystems, NOTE_WIDTH } from "./staff.ts";
import type { Key } from "../types.ts";

const key = (tonic: Key["tonic"], accidental: Key["accidental"], sharps: number, flats: number, doMidi: number): Key => ({ tonic, accidental, sharps, flats, doMidi });
const C4 = key("C", 0, 0, 0, 60);
const C5 = key("C", 0, 0, 0, 72);
const A3 = key("A", 0, 3, 0, 57);
const D4 = key("D", 0, 2, 0, 62);
const Bb3 = key("B", -1, 0, 2, 58);
const Eb3 = key("E", -1, 0, 3, 51);
const Fs4 = key("F", 1, 6, 0, 66);

test("NOTE_WIDTH", () => {
  assert.deepEqual({ ...NOTE_WIDTH }, { "0.5": 2, "1": 3, "1.5": 3.5, "2": 4, "3": 5, "4": 6 });
});

test("staffPosition: half-spaces above the bottom line, from the key's do", () => {
  const rows: Array<[number, Key, "treble" | "bass", number, string]> = [
    [0, C4, "bass", 10, "tenor do C4 on the bass clef: first ledger line above (A3 is the top line, 8)"],
    [-3, C4, "bass", 7, "sol below do = G3, the top space but one"],
    [7, C4, "bass", 17, "do above = C5"],
    [0, C4, "treble", -2, "middle C on the treble clef: first ledger line below"],
    [0, C5, "treble", 5, "C5: third space of the treble staff"],
    [0, D4, "treble", -1, "D4: just below the bottom line"],
    [0, Bb3, "bass", 9, "B flat 3: the space above the top line. The accidental doesn't move the note: spell from the tonic letter"],
    [0, Eb3, "bass", 5, "E flat 3: third space of the bass staff"],
    [2, Eb3, "bass", 7, "mi in E flat = G3"],
    [0, Fs4, "treble", 1, "F sharp 4: first space"],
    [0, A3, "bass", 8, "A3: top line of the bass staff"],
  ];
  for (const [step, k, clef, want, why] of rows) assert.equal(staffPosition(step, k, clef), want,
    `staffPosition(${step}, do ${k.tonic}${k.accidental} midi ${k.doMidi}, ${clef}): ${why}. RULE: diatonic(do) = LETTERS.indexOf(tonic) + 7 * (Math.floor((doMidi - accidental) / 12) - 1); position = diatonic(do) + step - bottom line (treble 30 = E4, bass 18 = G2)`);
});

test("yOf: staff spaces down from the top line", () => {
  assert.deepEqual([yOf(0), yOf(8), yOf(4), yOf(-2), yOf(10), yOf(5)], [4, 0, 2, 5, -1, 1.5]);
});

test("keySignature: positions per clef, sharps or flats", () => {
  const G = key("G", 0, 1, 0, 55), F = key("F", 0, 0, 1, 53), E = key("E", 0, 4, 0, 52), Ab = key("A", -1, 0, 4, 56), Db = key("D", -1, 0, 5, 61), B = key("B", 0, 5, 0, 59);
  assert.deepEqual(keySignature(C4, "treble"), [], "C major: no accidentals");
  assert.deepEqual(keySignature(G, "treble"), [8], "G major treble: F sharp on the top line");
  assert.deepEqual(keySignature(G, "bass"), [6], "RULE: the bass clef is the treble list shifted down 2");
  assert.deepEqual(keySignature(D4, "bass"), [6, 3]);
  assert.deepEqual(keySignature(E, "treble"), [8, 5, 9, 6], "RULE: sharps in order F C G D at 8 5 9 6");
  assert.deepEqual(keySignature(B, "bass"), [6, 3, 7, 4, 1]);
  assert.deepEqual(keySignature(F, "treble"), [4], "F major: B flat on the middle line");
  assert.deepEqual(keySignature(Bb3, "bass"), [2, 5]);
  assert.deepEqual(keySignature(Ab, "treble"), [4, 7, 3, 6], "RULE: flats in order B E A D at 4 7 3 6");
  assert.deepEqual(keySignature(Db, "bass"), [2, 5, 1, 4, 0]);
  assert.deepEqual(keySignature(Fs4, "treble"), [8, 5, 9, 6, 3, 7]);
});

test("splitBars: indices grouped into 4/4 bars", () => {
  assert.deepEqual(splitBars([1, 1, 1, 1, 2, 2, 4]), [[0, 1, 2, 3], [4, 5], [6]]);
  assert.deepEqual(splitBars([1.5, 0.5, 2, 3, 1, 4]), [[0, 1, 2], [3, 4], [5]]);
  assert.throws(() => splitBars([3, 2]), RangeError, "RULE: a note may not cross a barline");
  assert.throws(() => splitBars([1, 1]), RangeError, "RULE: the last bar must be complete");
  assert.throws(() => splitBars([0.75, 3.25]), RangeError, "RULE: only durations in NOTE_WIDTH");
});


test("breakSystems: greedy, whole bars, gap between bars", () => {
  // start 4.8, gap 1, bars of 12 except a last of 6: one bar 16.8, two 29.8, three 42.8, all four 49.8
  const w = [12, 12, 12, 6];
  assert.deepEqual(breakSystems(w, 4.8, 1, 49.8), [[0, 1, 2, 3]], "RULE: a system may be exactly maxWidth");
  assert.deepEqual(breakSystems(w, 4.8, 1, 49.7), [[0, 1, 2], [3]], "RULE: start + bars + gap between consecutive bars must stay <= maxWidth");
  assert.deepEqual(breakSystems(w, 4.8, 1, 30), [[0, 1], [2, 3]], "each new system starts again from start: 4.8 + 12 + 1 + 6 = 23.8");
  assert.deepEqual(breakSystems(w, 4.8, 1, 29.7), [[0], [1], [2, 3]]);
  assert.deepEqual(breakSystems(w, 4.8, 1, 5), [[0], [1], [2], [3]], "RULE: the first bar of a system always goes in, even if too wide");
  assert.deepEqual(breakSystems([], 4.8, 1, 30), [], "no bars, no systems");
  assert.deepEqual(breakSystems([10, 10, 10], 0, 0, 20), [[0, 1], [2]], "gap 0, start 0");
  const ws = [12, 12, 12, 6];
  breakSystems(ws, 4.8, 1, 30);
  assert.deepEqual(ws, [12, 12, 12, 6], "RULE: does not modify its input");
});
```

Write `src/core/staff.ts` now. Reply with exactly one ```ts block containing the whole file.
# Packet: shape-table

## Task

Write `src/core/shapes.ts`: the lookup table that tells a music-notation renderer which notehead glyph to draw for a note in 7-shape (Aikin) shape-note notation. Each degree of the major scale has its own notehead shape. The glyphs come from the SMuFL standard (Bravura font, "Shape note noteheads" range U+E1B0–U+E1BF). This is data plus validation: no music logic beyond the lookup.

The rules:

- The shape depends on the **degree** (table below).
- Whole and half notes use the **white** (hollow) glyph; quarter and eighth notes use the **black** (filled) glyph.
- Only **fa** depends on stem direction: stem **up** uses the triangle-left glyph; stem **down**, or **no stem** (whole notes), uses the triangle-right glyph.

| Degree | Shape name | White glyph | Black glyph |
|---|---|---|---|
| do | `triangle-up` | U+E1BA `noteShapeTriangleUpWhite` | U+E1BB `noteShapeTriangleUpBlack` |
| re | `moon` | U+E1BC `noteShapeMoonWhite` | U+E1BD `noteShapeMoonBlack` |
| mi | `diamond` | U+E1B8 `noteShapeDiamondWhite` | U+E1B9 `noteShapeDiamondBlack` |
| fa, stem up | `triangle-left` | U+E1B6 `noteShapeTriangleLeftWhite` | U+E1B7 `noteShapeTriangleLeftBlack` |
| fa, stem down or none | `triangle-right` | U+E1B4 `noteShapeTriangleRightWhite` | U+E1B5 `noteShapeTriangleRightBlack` |
| sol | `round` | U+E1B0 `noteShapeRoundWhite` | U+E1B1 `noteShapeRoundBlack` |
| la | `square` | U+E1B2 `noteShapeSquareWhite` | U+E1B3 `noteShapeSquareBlack` |
| ti | `triangle-round` | U+E1BE `noteShapeTriangleRoundWhite` | U+E1BF `noteShapeTriangleRoundBlack` |

## Interface

```ts
import type { Degree } from "../types.ts";
import { DEGREES } from "../types.ts";

export type StemDirection = "up" | "down" | "none";
export type HeadFill = "white" | "black";
export type ShapeName =
  | "triangle-up" | "moon" | "diamond" | "triangle-left" | "triangle-right"
  | "round" | "square" | "triangle-round";

export interface ShapeGlyph {
  shape: ShapeName;
  /** The SMuFL glyph name, e.g. "noteShapeRoundWhite". */
  smuflName: string;
  /** The SMuFL codepoint, e.g. 0xE1B0. */
  codepoint: number;
}

/** True if x is one of the seven degree strings ("do" … "ti", note "sol", not "so"). */
export function isDegree(x: unknown): x is Degree;

/** The degree for a scale-step number relative to do: 0 = do, 1 = re … 6 = ti, 7 = do above,
 *  -1 = ti below, -3 = sol below; i.e. DEGREES[((n % 7) + 7) % 7].
 *  Throws RangeError if n is not an integer. */
export function degreeFromStep(n: number): Degree;

/** Notehead fill for a duration in quarter notes: 4 (whole), 3 (dotted half) and 2 (half) are
 *  "white"; 1.5 (dotted quarter), 1 (quarter) and 0.5 (eighth) are "black".
 *  Throws RangeError for any other value. */
export function fillForDuration(quarters: number): HeadFill;

/** The glyph for a degree, fill and stem direction, from the table above.
 *  Throws RangeError if degree, fill or stem is not one of the allowed strings. */
export function shapeFor(degree: Degree, fill: HeadFill, stem: StemDirection): ShapeGlyph;

/** The glyph as a one-character string, i.e. String.fromCodePoint(glyph.codepoint). */
export function glyphChar(glyph: ShapeGlyph): string;
```

## Test vectors

| Call | Expected |
|---|---|
| `shapeFor("do", "white", "up")` | `{ shape: "triangle-up", smuflName: "noteShapeTriangleUpWhite", codepoint: 0xE1BA }` |
| `shapeFor("fa", "black", "up")` | `{ shape: "triangle-left", smuflName: "noteShapeTriangleLeftBlack", codepoint: 0xE1B7 }` |
| `shapeFor("fa", "white", "none")` | `{ shape: "triangle-right", smuflName: "noteShapeTriangleRightWhite", codepoint: 0xE1B4 }` |
| `shapeFor("sol", "black", "down")` | `{ shape: "round", smuflName: "noteShapeRoundBlack", codepoint: 0xE1B1 }` |
| `shapeFor("so" as Degree, "white", "up")` | throws RangeError |
| `degreeFromStep(-3)` | `"sol"` |
| `degreeFromStep(7)` | `"do"` |
| `fillForDuration(1.5)` | `"black"` |
| `fillForDuration(5)` | throws RangeError |
| `glyphChar(shapeFor("la", "white", "up"))` | `""` |

## Constraints

- Pure functions: no I/O, no globals that change, no console output. A constant lookup table inside the module is expected.
- No imports except from `../types.ts` (that is `src/types.ts`) as shown above.
- Export exactly the five functions and four types above.

## Neighbours

`src/types.ts` is already written; it is included below. Import from it, don't redefine `Degree` or `DEGREES`. (It also defines types this packet doesn't need; ignore them.)

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

## Tests `src/core/shapes.test.ts` (run with `node --test`; your file must make these pass)

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isDegree, degreeFromStep, fillForDuration, shapeFor, glyphChar } from "./shapes.ts";
import type { HeadFill, StemDirection } from "./shapes.ts";
import type { Degree } from "../types.ts";

// [degree, fill, stem, shape, smuflName, codepoint]
type Row = [Degree, HeadFill, StemDirection, string, string, number];

const NOT_FA: Array<[Degree, string, string, number]> = [
  ["do", "triangle-up", "TriangleUp", 0xe1ba],
  ["re", "moon", "Moon", 0xe1bc],
  ["mi", "diamond", "Diamond", 0xe1b8],
  ["sol", "round", "Round", 0xe1b0],
  ["la", "square", "Square", 0xe1b2],
  ["ti", "triangle-round", "TriangleRound", 0xe1be],
];

const ROWS: Row[] = [];
for (const [d, shape, base, white] of NOT_FA) {
  for (const stem of ["up", "down", "none"] as const) {
    ROWS.push([d, "white", stem, shape, `noteShape${base}White`, white]);
    ROWS.push([d, "black", stem, shape, `noteShape${base}Black`, white + 1]);
  }
}
ROWS.push(
  ["fa", "white", "up", "triangle-left", "noteShapeTriangleLeftWhite", 0xe1b6],
  ["fa", "black", "up", "triangle-left", "noteShapeTriangleLeftBlack", 0xe1b7],
  ["fa", "white", "down", "triangle-right", "noteShapeTriangleRightWhite", 0xe1b4],
  ["fa", "black", "down", "triangle-right", "noteShapeTriangleRightBlack", 0xe1b5],
  ["fa", "white", "none", "triangle-right", "noteShapeTriangleRightWhite", 0xe1b4],
  ["fa", "black", "none", "triangle-right", "noteShapeTriangleRightBlack", 0xe1b5],
);

test("shapeFor: every degree x fill x stem (42 cases)", () => {
  assert.equal(ROWS.length, 42);
  for (const [d, fill, stem, shape, smuflName, codepoint] of ROWS) {
    const g = shapeFor(d, fill, stem);
    const where = `shapeFor(${d}, ${fill}, ${stem})`;
    assert.equal(g.shape, shape, `${where}.shape`);
    assert.equal(g.smuflName, smuflName, `${where}.smuflName`);
    assert.equal(g.codepoint, codepoint, `${where}.codepoint (expected 0x${codepoint.toString(16)}, got 0x${g.codepoint?.toString(16)})`);
  }
});

test("shapeFor: only fa changes with stem direction", () => {
  for (const d of ["do", "re", "mi", "sol", "la", "ti"] as const) {
    assert.deepEqual(shapeFor(d, "black", "up"), shapeFor(d, "black", "down"));
  }
  assert.notDeepEqual(shapeFor("fa", "black", "up"), shapeFor("fa", "black", "down"));
});

test("shapeFor: rejects bad input", () => {
  assert.throws(() => shapeFor("so" as Degree, "white", "up"), RangeError);
  assert.throws(() => shapeFor("" as Degree, "white", "up"), RangeError);
  assert.throws(() => shapeFor("do", "grey" as HeadFill, "up"), RangeError);
  assert.throws(() => shapeFor("do", "white", "sideways" as StemDirection), RangeError);
  assert.throws(() => shapeFor("fa", "black", "left" as StemDirection), RangeError);
});

test("isDegree", () => {
  for (const d of ["do", "re", "mi", "fa", "sol", "la", "ti"]) assert.equal(isDegree(d), true, d);
  for (const x of ["so", "Do", "doh", "", 0, null, undefined, {}, ["do"]]) assert.equal(isDegree(x), false, String(x));
});

test("degreeFromStep", () => {
  const cases: Array<[number, Degree]> = [
    [0, "do"], [1, "re"], [2, "mi"], [3, "fa"], [4, "sol"], [5, "la"], [6, "ti"],
    [7, "do"], [8, "re"], [14, "do"], [-1, "ti"], [-2, "la"], [-3, "sol"], [-7, "do"], [-8, "ti"],
  ];
  for (const [n, d] of cases) assert.equal(degreeFromStep(n), d, `degreeFromStep(${n})`);
  assert.throws(() => degreeFromStep(1.5), RangeError);
  assert.throws(() => degreeFromStep(Number.NaN), RangeError);
});

test("fillForDuration", () => {
  const cases: Array<[number, HeadFill]> = [[4, "white"], [3, "white"], [2, "white"], [1.5, "black"], [1, "black"], [0.5, "black"]];
  for (const [q, f] of cases) assert.equal(fillForDuration(q), f, `fillForDuration(${q})`);
  for (const q of [0, 5, 2.5, 0.25, -1, Number.NaN]) assert.throws(() => fillForDuration(q), RangeError, `fillForDuration(${q})`);
});

test("glyphChar", () => {
  assert.equal(glyphChar(shapeFor("la", "white", "up")), "");
  assert.equal(glyphChar(shapeFor("fa", "black", "up")), "");
  assert.equal(glyphChar(shapeFor("do", "black", "none")).length, 1);
});
```

Write `src/core/shapes.ts` now. Reply with exactly one ```ts block containing the whole file.
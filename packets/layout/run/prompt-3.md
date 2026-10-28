# Packet: layout (staff layout)

## Task

Write `src/core/layout.ts` for a shape-note sight-singing trainer: it lays out a short melody on a five-line staff as **plain data**, ready for another module to turn into SVG. The output is glyphs (font characters from the Bravura music font, by SMuFL codepoint) and lines, with every coordinate in **staff spaces** (the distance between two staff lines). There is no drawing and no DOM here.

**Coordinates.** Within each system (one line of music), x runs right from the system's left edge (0), and y runs **down** from the top staff line (y = 0). So the five staff lines are at y = 0, 1, 2, 3, 4. A note's **staff position** `p` is counted in half-spaces up from the bottom line: p = 0 is the bottom line, 1 is the space above it, 8 is the top line, -2 is the first ledger line below and 10 the first above. `yOf(p) = 4 - p / 2`.

Melody steps are scale steps from do (0 = do, 1 = re … 7 = do above, -3 = sol below); rhythm values are in quarter notes; all bars are 4/4.

## Interface

```ts
import type { Clef, Key, Melody } from "../types.ts";
import { shapeFor, degreeFromStep, fillForDuration } from "./shapes.ts";
import type { ShapeName } from "./shapes.ts";
import { NOTE_WIDTH, yOf, staffPosition, keySignature, splitBars, breakSystems } from "./staff.ts";

export { NOTE_WIDTH };         // re-exported from staff.ts

export const HEAD_W = 1.44;    // notehead width
export const STEM_LEN = 3.5;
export const CLEF_X = 0.5;     // x of the clef glyph
export const KEY_X = 3.3;      // x of the first key-signature glyph
export const KEY_STEP = 1;     // x advance per key-signature glyph
export const KEY_GAP = 1.5;    // gap after the key signature before the first note
export const BAR_GAP = 1;      // gap after a barline before the next note
export const THICK = { staff: 0.13, ledger: 0.16, stem: 0.12, bar: 0.16, final: 0.5 } as const;
export const CODE = { gClef: 0xe050, fClef: 0xe062, sharp: 0xe262, flat: 0xe260, dot: 0xe1e7, flagUp: 0xe240, flagDown: 0xe241 } as const;
/** Where a stem attaches to each notehead shape (Bravura stemUpSE / stemDownNW anchors), as
 *  [x right of the head's left edge, y UP from the head's centre]; null where unused. */
export const ANCHORS: Readonly<Record<ShapeName, { up: [number, number] | null; down: [number, number] | null }>> = {
  "triangle-up": { up: [1.424, -0.5], down: [0, -0.5] },
  moon: { up: [1.444, 0.068], down: [0, 0.072] },
  diamond: { up: [1.436, 0], down: [0, 0] },
  "triangle-left": { up: [1.436, -0.5], down: null },
  "triangle-right": { up: null, down: [0, 0.476] },
  round: { up: [1.456, 0.192], down: [0, -0.168] },
  square: { up: [1.44, -0.46], down: [0, 0.46] },
  "triangle-round": { up: [1.424, 0.172], down: [0, 0.172] },
};

export interface Glyph { kind: "clef" | "key" | "head" | "dot" | "flag"; codepoint: number; x: number; y: number; note: number | null; }
export interface Line { kind: "staff" | "ledger" | "stem" | "bar"; x1: number; y1: number; x2: number; y2: number; thickness: number; note: number | null; }
export interface StaffSystem { glyphs: Glyph[]; lines: Line[]; width: number; firstNote: number; lastNote: number; }
export interface NoteAnchor { system: number; x: number; y: number; }
export interface StaffLayout { systems: StaffSystem[]; anchors: NoteAnchor[]; }

export function layoutStaff(melody: Melody, clef: Clef, key: Key, maxWidth: number): StaffLayout;
```

`note` is the index of the melody note a glyph or line belongs to (head, dot, flag, ledger, stem), and `null` for everything else (clef, key, staff, bar).

## Rules

Positions, the key signature, bars and line breaks all come from `./staff.ts` (included below): use `staffPosition`, `yOf`, `keySignature`, `splitBars` and `breakSystems`, and don't re-implement them.

**`layoutStaff`.** Throw RangeError if:
- `maxWidth <= 0`;
- the melody is empty;
- `degrees` and `rhythm` differ in length;
- `splitBars` throws.

1. **Header and line breaks.** `bars = splitBars(rhythm)`. Notes start at `notesX = KEY_X + KEY_STEP * keySignature(key, clef).length + KEY_GAP`. A bar's width is the sum of its notes' NOTE_WIDTH. The systems are `breakSystems(barWidths, notesX, BAR_GAP, maxWidth)`: each is a list of bar indices.
2. **Each system** gets:
   - a clef glyph at x `CLEF_X`: treble `gClef` at `yOf(2)`, bass `fClef` at `yOf(6)`;
   - the key signature: glyph j at x `KEY_X + KEY_STEP * j` and y `yOf(position)`, using `sharp` if the key has sharps, otherwise `flat`;
   - then its bars from x `notesX`.
3. **Each note** at cursor x (the head's left edge), with `p = staffPosition(step)` and `y = yOf(p)`:
   - **stem direction:** none for a whole note (4); down if `p >= 4`; otherwise up;
   - **head:** codepoint `shapeFor(degreeFromStep(step), fillForDuration(d), stem).codepoint` at (x, y);
   - **ledger lines:** one at every even position from -2 down to p (when p <= -2), and from 10 up to p (when p >= 10). Each runs from `x - 0.4` to `x + HEAD_W + 0.4` at `yOf(position)`, with thickness `THICK.ledger`;
   - **stem:** take the anchor `ANCHORS[shape][stem]` = [ax, ay]. The stem runs from (`x + ax`, `y - ay`) to the same x and `y - ay - STEM_LEN` (up) or `y - ay + STEM_LEN` (down), with thickness `THICK.stem`;
   - **flag (duration 0.5 only):** `flagUp` or `flagDown` at x `stem x - THICK.stem / 2`, y = the stem's end;
   - **dot (durations 1.5 and 3):** at x `x + HEAD_W + 0.5`, y `yOf(p + 1)` if p is even (on a line), else `yOf(p)`;
   - **anchor:** `{ system, x: x + HEAD_W / 2, y }`;
   - then advance the cursor by NOTE_WIDTH.
4. **After each bar:**
   - a barline at x = cursor, from y 0 to 4. Its thickness is `THICK.final` if the bar ends with the melody's last note (index `degrees.length - 1`), otherwise `THICK.bar`. Decide this from the note index, not from a list of systems that is still being built;
   - then, if another bar follows in the same system, advance the cursor by `BAR_GAP`.
5. **Staff:** five lines at y 0 to 4, from x 0 to the system's width, with thickness `THICK.staff`. The system's **width** is the x of its last barline; `firstNote` is the first index of the system's first bar, and `lastNote` is the **last** index of its **last** bar (`bars[lastBar][bars[lastBar].length - 1]`), so a system with notes 0–7 has firstNote 0 and lastNote 7.

## Test vectors

| Call | Expected |
|---|---|
| `layoutStaff({degrees: [0,1,2,0], rhythm: [1,1,2,4]}, "bass", C major 60, 100)` | one system; heads at x 4.8, 7.8, 10.8, 15.8 and y -1, -1.5, -2, -1; barlines at 14.8 (0.16) and 21.8 (0.5); width 21.8 |
| 4 bars of quarters (the last is a whole note), treble, C, maxWidth 30 | systems of notes [0–7], [8–12] |

## Constraints

- Pure functions: no I/O, no module-level mutable state, no console output.
- No imports except from `../types.ts`, `./shapes.ts` and `./staff.ts`, as shown above.
- Export exactly `layoutStaff`, the constants (with `NOTE_WIDTH` re-exported) and the five interfaces above.

## Neighbours

`src/types.ts`, `src/core/shapes.ts` and `src/core/staff.ts` are already written; they are included below. Use `shapeFor`, `degreeFromStep` and `fillForDuration` from `./shapes.ts`, and the staff functions from `./staff.ts`. Don't redefine `Clef`, `Key`, `Melody` or `ShapeName`.

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

## Neighbour file `src/core/shapes.ts` (already exists; do not rewrite it)

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

const SHAPE_TABLE: Record<Degree, Record<HeadFill, Record<StemDirection, ShapeGlyph>>> = {
  do: {
    white: {
      up: { shape: "triangle-up", smuflName: "noteShapeTriangleUpWhite", codepoint: 0xE1BA },
      down: { shape: "triangle-up", smuflName: "noteShapeTriangleUpWhite", codepoint: 0xE1BA },
      none: { shape: "triangle-up", smuflName: "noteShapeTriangleUpWhite", codepoint: 0xE1BA },
    },
    black: {
      up: { shape: "triangle-up", smuflName: "noteShapeTriangleUpBlack", codepoint: 0xE1BB },
      down: { shape: "triangle-up", smuflName: "noteShapeTriangleUpBlack", codepoint: 0xE1BB },
      none: { shape: "triangle-up", smuflName: "noteShapeTriangleUpBlack", codepoint: 0xE1BB },
    }
  },
  re: {
    white: {
      up: { shape: "moon", smuflName: "noteShapeMoonWhite", codepoint: 0xE1BC },
      down: { shape: "moon", smuflName: "noteShapeMoonWhite", codepoint: 0xE1BC },
      none: { shape: "moon", smuflName: "noteShapeMoonWhite", codepoint: 0xE1BC },
    },
    black: {
      up: { shape: "moon", smuflName: "noteShapeMoonBlack", codepoint: 0xE1BD },
      down: { shape: "moon", smuflName: "noteShapeMoonBlack", codepoint: 0xE1BD },
      none: { shape: "moon", smuflName: "noteShapeMoonBlack", codepoint: 0xE1BD },
    }
  },
  mi: {
    white: {
      up: { shape: "diamond", smuflName: "noteShapeDiamondWhite", codepoint: 0xE1B8 },
      down: { shape: "diamond", smuflName: "noteShapeDiamondWhite", codepoint: 0xE1B8 },
      none: { shape: "diamond", smuflName: "noteShapeDiamondWhite", codepoint: 0xE1B8 },
    },
    black: {
      up: { shape: "diamond", smuflName: "noteShapeDiamondBlack", codepoint: 0xE1B9 },
      down: { shape: "diamond", smuflName: "noteShapeDiamondBlack", codepoint: 0xE1B9 },
      none: { shape: "diamond", smuflName: "noteShapeDiamondBlack", codepoint: 0xE1B9 },
    }
  },
  fa: {
    white: {
      up: { shape: "triangle-left", smuflName: "noteShapeTriangleLeftWhite", codepoint: 0xE1B6 },
      down: { shape: "triangle-right", smuflName: "noteShapeTriangleRightWhite", codepoint: 0xE1B4 },
      none: { shape: "triangle-right", smuflName: "noteShapeTriangleRightWhite", codepoint: 0xE1B4 },
    },
    black: {
      up: { shape: "triangle-left", smuflName: "noteShapeTriangleLeftBlack", codepoint: 0xE1B7 },
      down: { shape: "triangle-right", smuflName: "noteShapeTriangleRightBlack", codepoint: 0xE1B5 },
      none: { shape: "triangle-right", smuflName: "noteShapeTriangleRightBlack", codepoint: 0xE1B5 },
    }
  },
  sol: {
    white: {
      up: { shape: "round", smuflName: "noteShapeRoundWhite", codepoint: 0xE1B0 },
      down: { shape: "round", smuflName: "noteShapeRoundWhite", codepoint: 0xE1B0 },
      none: { shape: "round", smuflName: "noteShapeRoundWhite", codepoint: 0xE1B0 },
    },
    black: {
      up: { shape: "round", smuflName: "noteShapeRoundBlack", codepoint: 0xE1B1 },
      down: { shape: "round", smuflName: "noteShapeRoundBlack", codepoint: 0xE1B1 },
      none: { shape: "round", smuflName: "noteShapeRoundBlack", codepoint: 0xE1B1 },
    }
  },
  la: {
    white: {
      up: { shape: "square", smuflName: "noteShapeSquareWhite", codepoint: 0xE1B2 },
      down: { shape: "square", smuflName: "noteShapeSquareWhite", codepoint: 0xE1B2 },
      none: { shape: "square", smuflName: "noteShapeSquareWhite", codepoint: 0xE1B2 },
    },
    black: {
      up: { shape: "square", smuflName: "noteShapeSquareBlack", codepoint: 0xE1B3 },
      down: { shape: "square", smuflName: "noteShapeSquareBlack", codepoint: 0xE1B3 },
      none: { shape: "square", smuflName: "noteShapeSquareBlack", codepoint: 0xE1B3 },
    }
  },
  ti: {
    white: {
      up: { shape: "triangle-round", smuflName: "noteShapeTriangleRoundWhite", codepoint: 0xE1BE },
      down: { shape: "triangle-round", smuflName: "noteShapeTriangleRoundWhite", codepoint: 0xE1BE },
      none: { shape: "triangle-round", smuflName: "noteShapeTriangleRoundWhite", codepoint: 0xE1BE },
    },
    black: {
      up: { shape: "triangle-round", smuflName: "noteShapeTriangleRoundBlack", codepoint: 0xE1BF },
      down: { shape: "triangle-round", smuflName: "noteShapeTriangleRoundBlack", codepoint: 0xE1BF },
      none: { shape: "triangle-round", smuflName: "noteShapeTriangleRoundBlack", codepoint: 0xE1BF },
    }
  }
};

export function isDegree(x: unknown): x is Degree {
  return typeof x === "string" && DEGREES.includes(x as Degree);
}

export function degreeFromStep(n: number): Degree {
  if (!Number.isInteger(n)) throw new RangeError("step must be an integer");
  const index = ((n % 7) + 7) % 7;
  return DEGREES[index];
}

const DURATION_TO_FILL: Record<number, HeadFill> = {
  4: "white",
  3: "white",
  2: "white",
  1.5: "black",
  1: "black",
  0.5: "black"
};

export function fillForDuration(quarters: number): HeadFill {
  const fill = DURATION_TO_FILL[quarters];
  if (fill === undefined) throw new RangeError("duration must be 4, 3, 2, 1.5, 1, or 0.5 quarter notes");
  return fill;
}

export function shapeFor(degree: Degree, fill: HeadFill, stem: StemDirection): ShapeGlyph {
  if (!isDegree(degree)) throw new RangeError("invalid degree");
  if (fill !== "white" && fill !== "black") throw new RangeError("fill must be 'white' or 'black'");
  if (stem !== "up" && stem !== "down" && stem !== "none") throw new RangeError("stem must be 'up', 'down', or 'none'");
  return SHAPE_TABLE[degree][fill][stem];
}

export function glyphChar(glyph: ShapeGlyph): string {
  return String.fromCodePoint(glyph.codepoint);
}
```

## Neighbour file `src/core/staff.ts` (already exists; do not rewrite it)

```ts
import type { Clef, Key, Letter } from "../types.ts";

export const NOTE_WIDTH: Readonly<Record<string, number>> = { "0.5": 2, "1": 3, "1.5": 3.5, "2": 4, "3": 5, "4": 6 };

export function yOf(p: number): number {
  return 4 - p / 2;
}

export function staffPosition(step: number, key: Key, clef: Clef): number {
  const LETTERS: readonly Letter[] = ["C", "D", "E", "F", "G", "A", "B"];
  const diatonicDo = LETTERS.indexOf(key.tonic) + 7 * (Math.floor((key.doMidi - key.accidental) / 12) - 1);
  const bottom = clef === "treble" ? 30 : 18;
  return diatonicDo + step - bottom;
}

export function keySignature(key: Key, clef: Clef): number[] {
  const sharpsTreble = [8, 5, 9, 6, 3, 7, 4];
  const flatsTreble = [4, 7, 3, 6, 2, 5, 1];
  let positions: number[];
  if (key.sharps > 0) {
    positions = sharpsTreble.slice(0, key.sharps);
  } else if (key.flats > 0) {
    positions = flatsTreble.slice(0, key.flats);
  } else {
    positions = [];
  }
  if (clef === "bass") {
    return positions.map((p) => p - 2);
  }
  return positions;
}

export function splitBars(rhythm: readonly number[]): number[][] {
  const bars: number[][] = [];
  let current: number[] = [];
  let sum = 0;

  for (let i = 0; i < rhythm.length; i++) {
    const dur = rhythm[i];
    const key = String(dur);
    if (!(key in NOTE_WIDTH)) {
      throw new RangeError(`Invalid duration: ${dur}`);
    }
    if (sum + dur > 4) {
      throw new RangeError(`Note ${i} would exceed bar limit`);
    }
    current.push(i);
    sum += dur;
    if (sum === 4) {
      bars.push(current);
      current = [];
      sum = 0;
    }
  }

  if (current.length > 0) {
    throw new RangeError("Last bar is incomplete");
  }

  return bars;
}

export function breakSystems(barWidths: readonly number[], start: number, gap: number, maxWidth: number): number[][] {
  if (barWidths.length === 0) {
    return [];
  }

  const systems: number[][] = [];
  let current: number[] = [];
  let currentWidth = 0;

  for (let i = 0; i < barWidths.length; i++) {
    if (current.length === 0) {
      // First bar of a system always goes in
      current.push(i);
      currentWidth = start + barWidths[i];
    } else {
      const newWidth = currentWidth + gap + barWidths[i];
      if (newWidth <= maxWidth) {
        current.push(i);
        currentWidth = newWidth;
      } else {
        systems.push(current);
        current = [i];
        currentWidth = start + barWidths[i];
      }
    }
  }

  if (current.length > 0) {
    systems.push(current);
  }

  return systems;
}
```

## Tests `src/core/layout.test.ts`

The test file is left out of this retry so the prompt fits the context window. The failing assertions and their RULE messages are in the test output below.

## Your previous attempt at `src/core/layout.ts`

```ts
import type { Clef, Key, Melody } from "../types.ts";
import { shapeFor, degreeFromStep, fillForDuration } from "./shapes.ts";
import type { ShapeName } from "./shapes.ts";
import { NOTE_WIDTH, yOf, staffPosition, keySignature, splitBars, breakSystems } from "./staff.ts";

export { NOTE_WIDTH };         // re-exported from staff.ts

export const HEAD_W = 1.44;    // notehead width
export const STEM_LEN = 3.5;
export const CLEF_X = 0.5;     // x of the clef glyph
export const KEY_X = 3.3;      // x of the first key-signature glyph
export const KEY_STEP = 1;     // x advance per key-signature glyph
export const KEY_GAP = 1.5;    // gap after the key signature before the first note
export const BAR_GAP = 1;      // gap after a barline before the next note
export const THICK = { staff: 0.13, ledger: 0.16, stem: 0.12, bar: 0.16, final: 0.5 } as const;
export const CODE = { gClef: 0xe050, fClef: 0xe062, sharp: 0xe262, flat: 0xe260, dot: 0xe1e7, flagUp: 0xe240, flagDown: 0xe241 } as const;
/** Where a stem attaches to each notehead shape (Bravura stemUpSE / stemDownNW anchors), as
 *  [x right of the head's left edge, y UP from the head's centre]; null where unused. */
export const ANCHORS: Readonly<Record<ShapeName, { up: [number, number] | null; down: [number, number] | null }>> = {
  "triangle-up": { up: [1.424, -0.5], down: [0, -0.5] },
  moon: { up: [1.444, 0.068], down: [0, 0.072] },
  diamond: { up: [1.436, 0], down: [0, 0] },
  "triangle-left": { up: [1.436, -0.5], down: null },
  "triangle-right": { up: null, down: [0, 0.476] },
  round: { up: [1.456, 0.192], down: [0, -0.168] },
  square: { up: [1.44, -0.46], down: [0, 0.46] },
  "triangle-round": { up: [1.424, 0.172], down: [0, 0.172] },
};

export interface Glyph { kind: "clef" | "key" | "head" | "dot" | "flag"; codepoint: number; x: number; y: number; note: number | null; }
export interface Line { kind: "staff" | "ledger" | "stem" | "bar"; x1: number; y1: number; x2: number; y2: number; thickness: number; note: number | null; }
export interface StaffSystem { glyphs: Glyph[]; lines: Line[]; width: number; firstNote: number; lastNote: number; }
export interface NoteAnchor { system: number; x: number; y: number; }
export interface StaffLayout { systems: StaffSystem[]; anchors: NoteAnchor[]; }

export function layoutStaff(melody: Melody, clef: Clef, key: Key, maxWidth: number): StaffLayout {
  if (maxWidth <= 0) throw new RangeError("maxWidth must be > 0");
  if (melody.degrees.length === 0) throw new RangeError("melody must not be empty");
  if (melody.degrees.length !== melody.rhythm.length) throw new RangeError("degrees and rhythm must be the same length");

  const bars = splitBars(melody.rhythm);
  const barWidths = bars.map(bar => bar.reduce((sum, i) => sum + NOTE_WIDTH[melody.rhythm[i]], 0));
  const notesX = KEY_X + KEY_STEP * keySignature(key, clef).length + KEY_GAP;
  const systems = breakSystems(barWidths, notesX, BAR_GAP, maxWidth);
  
  if (systems.length === 0) {
    return { systems: [], anchors: [] };
  }

  const result: StaffLayout = { systems: [], anchors: [] };
  let noteIndex = 0;

  for (let systemIndex = 0; systemIndex < systems.length; systemIndex++) {
    const systemBarIndices = systems[systemIndex];
    const system: StaffSystem = { glyphs: [], lines: [], width: 0, firstNote: noteIndex, lastNote: 0 };
    
    // Clef
    const clefY = clef === "treble" ? yOf(2) : yOf(6);
    system.glyphs.push({ kind: "clef", codepoint: clef === "treble" ? CODE.gClef : CODE.fClef, x: CLEF_X, y: clefY, note: null });
    
    // Key signature
    const keySig = keySignature(key, clef);
    for (let i = 0; i < keySig.length; i++) {
      system.glyphs.push({
        kind: "key",
        codepoint: key.sharps > 0 ? CODE.sharp : CODE.flat,
        x: KEY_X + KEY_STEP * i,
        y: yOf(keySig[i]),
        note: null
      });
    }
    
    let cursorX = notesX;
    
    // Process bars in this system
    for (let barIndex = 0; barIndex < systemBarIndices.length; barIndex++) {
      const barNotes = bars[systemBarIndices[barIndex]];
      
      // Process notes in the bar
      for (let i = 0; i < barNotes.length; i++) {
        const noteIndexInMelody = barNotes[i];
        const step = melody.degrees[noteIndexInMelody];
        const duration = melody.rhythm[noteIndexInMelody];
        
        const p = staffPosition(step, key, clef);
        const y = yOf(p);
        
        // Determine stem direction
        let stemDir: "up" | "down" | "none" = "none";
        if (duration !== 4) {
          stemDir = p >= 4 ? "down" : "up";
        }
        
        // Get shape
        const fill = fillForDuration(duration);
        const shape = shapeFor(degreeFromStep(step), fill, stemDir);
        
        // Head glyph
        system.glyphs.push({
          kind: "head",
          codepoint: shape.codepoint,
          x: cursorX,
          y: y,
          note: noteIndexInMelody
        });
        
        // Ledger lines
        if (p <= -2) {
          for (let pos = -2; pos >= p; pos -= 2) {
            system.lines.push({
              kind: "ledger",
              x1: cursorX - 0.4,
              y1: yOf(pos),
              x2: cursorX + HEAD_W + 0.4,
              y2: yOf(pos),
              thickness: THICK.ledger,
              note: noteIndexInMelody
            });
          }
        } else if (p >= 10) {
          for (let pos = 10; pos <= p; pos += 2) {
            system.lines.push({
              kind: "ledger",
              x1: cursorX - 0.4,
              y1: yOf(pos),
              x2: cursorX + HEAD_W + 0.4,
              y2: yOf(pos),
              thickness: THICK.ledger,
              note: noteIndexInMelody
            });
          }
        }
        
        // Stem
        if (stemDir !== "none") {
          const anchor = ANCHORS[shape.shape];
          const [ax, ay] = stemDir === "up" ? anchor.up! : anchor.down!;
          const stemY1 = y - ay;
          const stemY2 = stemY1 + (stemDir === "up" ? -STEM_LEN : STEM_LEN);
          
          system.lines.push({
            kind: "stem",
            x1: cursorX + ax,
            y1: stemY1,
            x2: cursorX + ax,
            y2: stemY2,
            thickness: THICK.stem,
            note: noteIndexInMelody
          });
        }
        
        // Flag (for eighth notes only)
        if (duration === 0.5) {
          const flagCode = stemDir === "up" ? CODE.flagUp : CODE.flagDown;
          // Find the stem end to position the flag correctly
          let stemEndY = y - ay + (stemDir === "up" ? -STEM_LEN : STEM_LEN);
          system.glyphs.push({
            kind: "flag",
            codepoint: flagCode,
            x: cursorX + HEAD_W / 2 - THICK.stem / 2,
            y: stemEndY,
            note: noteIndexInMelody
          });
        }
        
        // Dot (for dotted notes)
        if (duration === 1.5 || duration === 3) {
          const dotY = p % 2 === 0 ? yOf(p + 1) : yOf(p);
          system.glyphs.push({
            kind: "dot",
            codepoint: CODE.dot,
            x: cursorX + HEAD_W + 0.5,
            y: dotY,
            note: noteIndexInMelody
          });
        }
        
        // Anchor
        result.anchors.push({
          system: systemIndex,
          x: cursorX + HEAD_W / 2,
          y: y
        });
        
        // Advance cursor
        cursorX += NOTE_WIDTH[duration];
        
        noteIndex++;
      }
      
      // Barline after the bar (if not the last bar in the system)
      if (barIndex < systemBarIndices.length - 1) {
        system.lines.push({
          kind: "bar",
          x1: cursorX,
          y1: 0,
          x2: cursorX,
          y2: 4,
          thickness: THICK.bar,
          note: null
        });
        cursorX += BAR_GAP;
      }
    }
    
    // Final barline (if this is the last system)
    const lastBarIndex = systemBarIndices[systemBarIndices.length - 1];
    const isLastSystem = systemIndex === systems.length - 1;
    const lastNoteInMelody = bars[lastBarIndex][bars[lastBarIndex].length - 1];
    const isLastNote = lastNoteInMelody === melody.degrees.length - 1;
    
    const barThickness = isLastSystem && isLastNote ? THICK.final : THICK.bar;
    
    system.lines.push({
      kind: "bar",
      x1: cursorX,
      y1: 0,
      x2: cursorX,
      y2: 4,
      thickness: barThickness,
      note: null
    });
    
    // Staff lines
    for (let i = 0; i < 5; i++) {
      system.lines.push({
        kind: "staff",
        x1: 0,
        y1: i,
        x2: cursorX,
        y2: i,
        thickness: THICK.staff,
        note: null
      });
    }
    
    system.width = cursorX;
    system.lastNote = noteIndex - 1;
    result.systems.push(system);
  }
  
  return result;
}
```

## It failed the tests. Test output (tail)

```
✔ constants (0.869708ms)
✔ one system: heads, ledgers, stems, barlines and anchors (0.484459ms)
✔ stems up below the middle line, down from it; fa follows the stem (0.138709ms)
✖ dots, flags and a whole-note fa (0.109416ms)
✔ a dotted note in a space keeps its dot in that space (0.058667ms)
✔ key signature is pinned on every system (0.153875ms)
✔ line breaking is greedy by whole bars (0.118667ms)
✖ pure: same input, same layout; input untouched (0.065875ms)
✔ bad input (0.168958ms)
ℹ tests 9
ℹ suites 0
ℹ pass 7
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 85.825333

✖ failing tests:

test at src/core/layout.test.ts:107:1
✖ dots, flags and a whole-note fa (0.109416ms)
  ReferenceError [Error]: ay is not defined
      at layoutStaff (file:///Users/gary/Library/Caches/packet-driver/sw48/layout/qwen3-coder_30b/src/core/layout.ts:156:30)
      at TestContext.<anonymous> (file:///Users/gary/Library/Caches/packet-driver/sw48/layout/qwen3-coder_30b/src/core/layout.test.ts:110:13)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7)

test at src/core/layout.test.ts:171:1
✖ pure: same input, same layout; input untouched (0.065875ms)
  ReferenceError [Error]: ay is not defined
      at layoutStaff (file:///Users/gary/Library/Caches/packet-driver/sw48/layout/qwen3-coder_30b/src/core/layout.ts:156:30)
      at TestContext.<anonymous> (file:///Users/gary/Library/Caches/packet-driver/sw48/layout/qwen3-coder_30b/src/core/layout.test.ts:175:3)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7)
```

Fix the problem. Reply with the complete corrected `src/core/layout.ts` in one ```ts block.
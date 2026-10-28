---
component: layout
root: ../..
target: src/core/layout.ts
tests: src/core/layout.test.ts
neighbours: src/types.ts, src/core/shapes.ts, src/core/staff.ts
---

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

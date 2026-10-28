---
component: shapes
root: ../..
target: src/core/shapes.ts
tests: src/core/shapes.test.ts
neighbours: src/types.ts
---

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

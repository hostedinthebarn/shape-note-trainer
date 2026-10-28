---
component: staff
root: ../..
target: src/core/staff.ts
tests: src/core/staff.test.ts
neighbours: src/types.ts
---

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

---
component: summary
root: ../..
target: src/core/summary.ts
tests: src/core/summary.test.ts
neighbours: src/types.ts
---

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

---
component: generator
root: ../..
target: src/core/generator.ts
tests: src/core/generator.test.ts
neighbours: src/types.ts, src/core/prng.ts
---

# Packet: level-generator

## Task

Write `src/core/generator.ts` for a shape-note sight-singing trainer: one function that generates a random **melody** (a short line of scale degrees plus a rhythm) from a **level's settings**, using only the seeded random-number function passed in. All eight levels use the same algorithm; a level is just a `LevelSettings` value (see `src/types.ts`, which also holds the eight levels as `LEVELS`). Choosing the key and clef is someone else's job; this function only makes the melody.

Degrees are integers relative to do: 0 = do, 1 = re … 6 = ti, 7 = do above, −1 = ti below, −2 = la below, −3 = sol below.

## Interface

```ts
import type { LevelSettings, Melody } from "../types.ts";

/** Generate one melody for the given level settings.
 *  `rand` returns floats in [0, 1); it is the ONLY source of randomness (never Math.random),
 *  so the same rand sequence must always give the same melody.
 *  Throws an Error if no valid melody is found in 1000 attempts. */
export function generateMelody(settings: LevelSettings, rand: () => number): Melody;
```

## The algorithm

Each **attempt**:

1. **Rhythm.** Pick a rhythm pattern for each of bars 1, 2 and 3, independently and uniformly at random from `settings.rhythms`. Let `n` = the total number of notes in those three patterns.
2. **Start.** The first degree is chosen uniformly from {0, 2, 4} ∩ `settings.allowed`.
3. **Walk.** Add degrees until there are `n`. From the current degree `cur`, the candidates are every `d` in `settings.allowed` with `d ≠ cur` (no repeated notes) and `|d − cur| ≤ settings.maxLeap`; if `settings.chord` is true, `d` must also be in {0, 2, 4, 7}. Each candidate has weight 1, multiplied by:
   - 3 if `settings.prefer` is set and `|d − cur| ≥ settings.prefer`;
   - 1.5 if `|d − cur| = 1` (a step);
   - 0.4 if `d` equals the degree *before* `cur` (discourages going straight back).

   Choose one candidate with probability proportional to its weight. If there are no candidates, the attempt fails.
4. **Final note.** Let `last` = the last degree of the walk. `final` = 7 if 7 is in `settings.allowed` and `|last − 7| < |last − 0|`; otherwise 0. The attempt fails if `final === last` or `|final − last| > settings.maxLeap`.
5. **Variety.** The attempt fails if the walk's `n` degrees contain fewer than `min(settings.allowed.length, 3)` distinct values.
6. **Result.** `degrees` = the walk followed by `final`; `rhythm` = the three bar patterns concatenated, followed by 4 (a whole note). So `degrees.length === rhythm.length === n + 1`.

A failed attempt starts again from step 1 (new rhythms too). After 1000 failed attempts, throw an `Error`.

## Test vectors

The output for a seed can't be predicted, so the tests are a **checker**: they generate melodies for all 8 levels over 300 seeds and assert every rule above (allowed degrees, no repeats, max leap, chord degrees, start in {0, 2, 4}, three valid bars plus a final 4, the final-degree rule, variety). The checker is first run on 24 real melodies from an older generator, for example:

| Level | Degrees | Rhythm |
|---|---|---|
| 1 | 0 1 2 1 2 1 0 1 0 1 2 1 0 | 1 ×12, then 4 |
| 4 | 0 2 0 4 0 2 4 2 0 2 0 4 7 | 1 ×12, then 4 |
| 6 | 0 3 4 2 1 4 3 2 0 | 2 1 1 2 1 1 2 2 4 |
| 8 | 0 1 4 7 6 4 3 7 2 −2 0 | 1 1 1.5 0.5 2 2 1.5 0.5 1 1 4 |

The tests also check that the same seed gives the same melody, that `Math.random` is never called, that different seeds give varied melodies, the weights statistically (level 5: about 59% of moves are thirds; level 3: about 38% of moves go straight back), and that impossible settings throw.

## Constraints

- Pure function apart from calling `rand`: no I/O, no globals, no console output, no `Math.random`.
- No imports except the type import from `../types.ts` shown above. (`prng.ts` is used by the tests; you don't need it.)
- Export exactly `generateMelody` with the signature above.

## Neighbours

`src/types.ts` and `src/core/prng.ts` are already written; they are included below. Import from `../types.ts`, don't redefine `LevelSettings`, `Melody` or `LEVELS`. (`types.ts` also defines many types this packet doesn't need; ignore them.)

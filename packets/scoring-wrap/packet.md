---
component: scoring-wrap
root: ../..
target: src/core/scoring.ts
tests: src/core/scoring.test.ts
neighbours: src/types.ts, src/core/hold.ts, packets/scoring-wrap/scoring.prev.ts
fixtures: src/core/fixtures/sw37-c3-g2.json
---

# Packet: scoring, one fix (SW-58 review)

## Task

`scoring.prev.ts` (included below) is the current, working `src/core/scoring.ts`. It passes every test except one. Return the **whole file**, identical to `scoring.prev.ts` except for this one change. Do not rename, reorder, reformat or "improve" anything else.

## The change

In `view()`, the "Determine singing" block finds the major-scale degree nearest `x` (semitones above do, 0 to 12) by comparing against `MAJOR_SEMITONES` only (0, 2, 4, 5, 7, 9, 11). It must also compare against **12**, which is do again: the candidates are `[...MAJOR_SEMITONES, 12]`, and a winning index of 7 means degree index 0 (do). An exact tie still goes to the lower degree.

Why: a note just under the do above (x between 11.5 and 12) is currently named ti. Target do sung 30 cents flat in strict mode must give `singing: null` (it's nearest the target's own degree); target ti sung at 1160 cents must give `singing: "do"`.

## Test vectors

| target | sung (cents from do) | strict | status | singing |
|---|---|---|---|---|
| do | -30 | yes | flat | null |
| ti | 1160 | no | sharp | "do" |
| do | -100 | no | flat | "ti" |
| do | +400 | no | sharp | "mi" |

## Constraints

Same as the original: pure, plain-data state, only the imports already in `scoring.prev.ts`. Output one TypeScript code block containing the complete `src/core/scoring.ts`. `scoring.prev.ts` is reference only: don't import it.

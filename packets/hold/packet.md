---
component: hold
root: ../..
target: src/core/hold.ts
tests: src/core/hold.test.ts
---

# Packet: hold (judging one note's readings)

## Task

Write `src/core/hold.ts` for a shape-note sight-singing trainer. While one note is current, the app gets a pitch reading about every 10 ms, already turned into an error in cents against the target note (`err`, positive = sharp), or `null` when nothing is being sung. This module decides when the singer has **held the note in tune long enough**. It is a small reducer: `holdReading(hold, t, err, band)` returns a new hold and, on the reading that completes the hold, an acceptance. Times are milliseconds and come with each reading; never read a clock.

## Interface

```ts
export const MEDIAN_MS = 200;  // median window
export const HOLD_MS = 300;    // held time needed to accept
export const GAP_MS = 100;     // longest gap between voiced readings that only pauses the hold

/** Plain data only. */
export interface Hold {
  window: Array<[number, number]>;  // recent voiced readings [t, err]
  start: number | null;             // t of the first reading of the current hold; null when not holding
  heldMs: number;                   // time held so far
  errs: number[];                   // raw errs of the voiced readings since the hold started
  lastVoiced: number | null;        // t of the last voiced reading
  prevInBand: boolean;              // was the previous reading voiced and in band?
  prevT: number | null;             // t of the previous reading (voiced or not)
}
export interface Accepted { cents: number; start: number; }

/** Middle value of a sorted copy; for an even count, the mean of the middle two.
 *  Does not modify xs. Throws RangeError if xs is empty. */
export function median(xs: readonly number[]): number;

/** { window: [], start: null, heldMs: 0, errs: [], lastVoiced: null, prevInBand: false, prevT: null } */
export function newHold(): Hold;

/** Apply one reading. Never modifies `h` (the tests deep-freeze it). */
export function holdReading(h: Hold, t: number, err: number | null, band: number): { hold: Hold; accepted: Accepted | null };

/** Median err of the window entries with wt > now - MEDIAN_MS, or null if there are none. */
export function recentMedian(h: Hold, now: number): number | null;
```

## Rules for `holdReading`

"Reset the hold" means: start = null, heldMs = 0, errs = [].

A **gap** is when `lastVoiced !== null` and `t - lastVoiced > GAP_MS`.

- **err is null (unvoiced):** if there is a gap, reset the hold. Set prevInBand = false and prevT = t. accepted = null.
- **err is a number (voiced):**
  1. If there is a gap: reset the hold and set prevInBand = false.
  2. window = the entries with `wt > t - MEDIAN_MS`, plus `[t, err]`. `m` = the median of the window's errs.
  3. If `|m| <= band`:
     - if start is null: start = t, heldMs = 0, errs = [];
     - otherwise, if prevInBand: heldMs += t - prevT. If not (an unvoiced gap of 100 ms or less), heldMs is unchanged: the gap **pauses** the hold;
     - then append err to errs and set prevInBand = true.
  4. Otherwise (out of band): reset the hold and set prevInBand = false.
  5. lastVoiced = t, prevT = t.
  6. accepted = `{ cents: median(errs), start }` when start is not null and `heldMs >= HOLD_MS`; otherwise null.

## Test vectors

Readings every 10 ms, band 50:

| Readings | First acceptance |
|---|---|
| err 10 from t = 0 | at t = 300: `{ cents: 10, start: 0 }` |
| err 49.9 / 50.1 | accepted / never |
| err 0 with one reading of 400 at t = 150 | at 300, cents 0 |
| err -100 for 0–140, then 0 | start 240 (the median first reaches -50 at 240), accepted at 540 |
| 0 for 0–150, null 160–240, 0 from 250 | at 400, start 0 (paused) |
| same, resuming at 251 | at 551, start 251 (reset) |
| `median([4, 1, 3, 2])` | 2.5 |

## Constraints

- Pure functions: no I/O, no module-level mutable state, no clock, no console output.
- No imports at all.
- Export exactly the four functions, two interfaces and three constants above.

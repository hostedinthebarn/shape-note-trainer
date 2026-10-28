---
component: scoring
root: ../..
target: src/core/scoring.ts
tests: src/core/scoring.test.ts
neighbours: src/types.ts, src/core/hold.ts
fixtures: src/core/fixtures/sw37-c3-g2.json
---

# Packet: scoring

## Task

Write `src/core/scoring.ts` for a shape-note sight-singing trainer: the pure state machine that judges a singer, note by note. An exercise is a list of target notes (scale steps from do). The app **waits on each note**: one note is current, and it moves on only when the singer holds it in tune for 300 ms, or skips it. The shell feeds in timestamped events (pitch readings about every 10 ms, tone start/end, hint, skip); this module never reads a clock. It is a reducer: `step(state, event)` returns a **new** state, and `view(state)` says what the screen shows.

Steps are integers: 0 = do, 1 = re … 6 = ti, 7 = do above, -1 = ti below, -3 = sol below. A step's position is `targetCents(step) = 100 * (12 * Math.floor(step / 7) + MAJOR_SEMITONES[((step % 7) + 7) % 7])` cents above do.

## Interface

```ts
import type { Degree, ScoringEvent, NoteResult, LiveView, LiveStatus } from "../types.ts";
import { DEGREES, MAJOR_SEMITONES } from "../types.ts";
import { newHold, holdReading, recentMedian, MEDIAN_MS, HOLD_MS, GAP_MS } from "./hold.ts";
import type { Hold } from "./hold.ts";

export { MEDIAN_MS, HOLD_MS, GAP_MS };  // re-exported from hold.ts
export const BAND_CENTS = 50;          // in tune: |median| <= this
export const STRICT_BAND_CENTS = 25;   // ... or this in strict mode
export const TONE_TAIL_MS = 150;       // readings ignored this long after a tone ends
export const HINT_AFTER_MS = 8000;     // "play this note" offered after this much note time

export interface ScoringConfig {
  steps: readonly number[];  // the target notes
  doHz: number;              // frequency of do, fixed for the whole exercise
  strict: boolean;
}

/** Your design: whatever the reducer needs, including the current note's `Hold` from hold.ts.
 *  It must be plain data (objects, arrays, numbers, strings, booleans, null; no functions,
 *  Maps, Sets or class instances). */
export interface ScoringState { /* ... */ }

/** Fold a cents error to the nearest octave: e - 1200 * Math.round(e / 1200). */
export function fold(e: number): number;

/** How long the current note has been current at time T, excluding tone time (see "Note time"). */
export function noteTime(state: ScoringState, T: number): number;

/** The starting state: note 0 is current from time t.
 *  Throws RangeError if steps is empty or doHz is not a finite number > 0. */
export function init(config: ScoringConfig, t: number): ScoringState;

/** Apply one event. Never modifies `state` (the tests deep-freeze it); returns a new state. */
export function step(state: ScoringState, event: ScoringEvent): ScoringState;

/** What the exercise screen shows now. Returns new objects and arrays every call. */
export function view(state: ScoringState): LiveView;
```

`ScoringEvent`, `NoteResult` and `LiveView` are in `src/types.ts` (below). Events arrive in time order.

## The rules for `step`

**Once every note has a result, the attempt is done and every event is ignored.** Every event (even an ignored one) sets the state's "now" to its `t`, which `view` uses.

**Tone state** (keep these three fields, separately from everything else):
- `tonePlaying: boolean`, false at first;
- `toneStart: number`, the `t` of the latest toneStart;
- `gateUntil: number | null`, null until the first toneEnd.

A reading is **gated** (ignored) when `tonePlaying` is true, or when `gateUntil !== null && t < gateUntil`. Don't derive the gate from `toneStart`, and never do arithmetic on a null.

The per-note values, all reset whenever a new note becomes current: the **hold** (`newHold()`), **hint used**, the note's start time, and its paused ms.

- **`toneStart`**: `tonePlaying = true`, `toneStart = t`. Replace the hold with `newHold()`.
- **`toneEnd`**: if `tonePlaying`, add `t - max(toneStart, noteStart)` to the note's paused ms. Then `tonePlaying = false`, `gateUntil = t + TONE_TAIL_MS`.
- **`hint`**: mark the current note as hint used.
- **`skip`**: record `{ outcome: "skipped", cents: null, settleMs: null }`, and make the next note current from `t`.
- **`reading`**: if it is gated, ignore it (only "now" changes). Otherwise:
  - `err` = `null` if `hz` is null, else `fold(1200 * Math.log2(hz / doHz) - targetCents(current step))`.
  - `{ hold, accepted } = holdReading(currentHold, t, err, band)`, with band `STRICT_BAND_CENTS` if strict, else `BAND_CENTS`. Keep the new hold.
  - If `accepted`: record `{ outcome: hintUsed ? "helped" : "unaided", cents: accepted.cents, settleMs: noteTime(state, accepted.start) }`, and the next note becomes current from `t`. **Settle time is measured to `accepted.start`, when the hold began, not to the current reading's `t`** (which is at least 300 ms later).


**Note time:** `noteTime(state, T) = T - noteStart - pausedMs - (tonePlaying ? T - max(toneStart, noteStart) : 0)`. It is the time the note has been current, excluding tone time. A tone that started before the note became current counts from the note's start.

## The rules for `view`

- **done:** `{ noteIndex: steps.length, status: "listening", cents: null, singing: null, hintOffered: false, results, done: true }`.
- **otherwise:**
  - `hintOffered = noteTime(state, now) >= HINT_AFTER_MS`.
  - `m` = `recentMedian(hold, now)`, or null while a tone plays.
  - If `m` is null: `status: "listening"`, `cents: null`, `singing: null`.
  - Otherwise: `status` is `"holding"` if `|m| <= band`, `"sharp"` if `m > band`, and `"flat"` if `m < -band`; `cents` is `m`.
  - **singing:** only when the status is sharp or flat. Find the major-scale degree nearest `x = (((targetCents(step) + m) % 1200) + 1200) % 1200 / 100` semitones, comparing against `MAJOR_SEMITONES` plus 12 (which is do). An exact tie goes to the lower degree. If that degree is the target's own degree (`DEGREES[((step % 7) + 7) % 7]`), `singing` is `null`; otherwise it's that degree's name.
- `results` is a new array of the results so far.

## Test vectors

Readings every 10 ms. With do = C3 (130.81 Hz):

| Events | Expected |
|---|---|
| `init({steps: [0, 2]}, -500)`, readings at 0 cents from t = 0 | accepted on the reading at t = 300: `{ outcome: "unaided", cents: 0, settleMs: 500 }`, noteIndex 1 |
| readings at +10 cents, 0–290 | not accepted; status `"holding"`, cents 10 |
| do sung an octave up, +20 cents | accepted at 300, cents 20 (folded) |
| ±49.9 accepted, ±50.1 not; strict: ±24.9 accepted, ±25.1 not | |
| in tune 0–150, unvoiced 160–240, in tune from 250 | accepted at 400 (the gap paused the hold) |
| same, but resuming at 251 | accepted at 551 (the gap of 101 ms reset the hold) |
| `toneStart` 0, `toneEnd` 1000, wrong-pitch readings to 1140, in tune from 1150 | accepted at 1450, settleMs 150 |
| unvoiced readings for 8000 ms | `hintOffered` true; at 7990, false; a 1 s tone pushes it to 9000 |
| target do, singing +400 | sharp, cents 400, singing `"mi"`; +300 → `"re"` (the tie goes lower); +60 → singing null |
| Gary's recorded do on C3 and G2 (fixture), with the tone events | accepted, unaided, between -50 and -5 cents (the open mic's view of the tone, at ~0 cents, is gated out) |

## Constraints

- Pure functions: no I/O, no module-level mutable state, no clock, no randomness, no console output.
- `step` must not modify its input in any way (the tests deep-freeze each state before stepping).
- No imports except from `../types.ts` and `./hold.ts`, as shown above. All median, window, band-hold and gap logic is in `hold.ts`; don't re-implement it.
- Export exactly the five functions, the two interfaces, the four constants and the three re-exported constants above.

## Neighbours

`src/types.ts` and `src/core/hold.ts` are already written; they are included below. Import from it, and don't redefine `ScoringEvent`, `NoteResult`, `LiveView`, `LiveStatus`, `Degree`, `DEGREES` or `MAJOR_SEMITONES`. (It also defines types this packet doesn't need; ignore them.) The tests also read `src/core/fixtures/sw37-c3-g2.json` (recorded readings); you don't need to.

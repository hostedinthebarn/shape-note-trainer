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

## Rules that always apply

- The file runs under Node's built-in TypeScript type stripping, so use erasable syntax only: no `enum`, no `namespace`, no constructor parameter properties, no decorators.
- Relative imports must include the `.ts` extension (e.g. `./note-types.ts`).
- No npm packages and no Node built-in modules unless the packet's constraints allow them.
- Do not change the exported names or signatures given in the interface.
- No module-level mutable state: no top-level `let` or `var`. Exported functions must give the same result for the same arguments however often or in whatever order they are called. Passing a test by remembering earlier calls is a failure.

## Tests `src/core/hold.test.ts` (run with `node --test`; your file must make these pass)

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { newHold, holdReading, recentMedian, median, MEDIAN_MS, HOLD_MS, GAP_MS } from "./hold.ts";
import type { Hold, Accepted } from "./hold.ts";

/** Feed [t, err] readings (err null = unvoiced); return the final hold and the first acceptance. */
function feed(rows: Array<[number, number | null]>, band = 50, h: Hold = newHold()) {
  let first: { t: number; acc: Accepted } | null = null;
  for (const [t, err] of rows) {
    const r = holdReading(h, t, err, band);
    h = r.hold;
    if (r.accepted && !first) first = { t, acc: r.accepted };
  }
  return { h, first };
}
const steady = (err: number | null, from: number, to: number, every = 10) => {
  const out: Array<[number, number | null]> = [];
  for (let t = from; t <= to; t += every) out.push([t, err]);
  return out;
};

test("constants", () => {
  assert.deepEqual([MEDIAN_MS, HOLD_MS, GAP_MS], [200, 300, 100]);
});

test("median: odd count is the middle value, even count is the mean of the middle two", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([-100, 0]), -50);
  assert.equal(median([7]), 7);
  const xs = [5, 1, 4];
  median(xs);
  assert.deepEqual(xs, [5, 1, 4], "RULE: median must not sort its input in place");
  assert.throws(() => median([]), RangeError);
});

test("newHold: empty", () => {
  const h = newHold();
  assert.equal(recentMedian(h, 0), null);
  assert.deepEqual(newHold(), h, "RULE: a fresh plain-data object each time");
});

test("a steady in-band run is accepted when held time reaches 300 ms", () => {
  const { first } = feed(steady(10, 0, 1000));
  assert.deepEqual(first, { t: 300, acc: { cents: 10, start: 0 } },
    "RULE: the hold starts at the first in-band reading (0); held time grows by the time between consecutive in-band voiced readings; accepted when it reaches HOLD_MS; cents = median of the raw errors since the hold started");
  assert.equal(feed(steady(10, 0, 290)).first, null, "290 ms is not enough");
});

test("band: |median| <= band", () => {
  assert.notEqual(feed(steady(49.9, 0, 600)).first, null);
  assert.equal(feed(steady(50.1, 0, 600)).first, null);
  assert.notEqual(feed(steady(-24.9, 0, 600), 25).first, null);
  assert.equal(feed(steady(-25.1, 0, 600), 25).first, null, "RULE: the band is the argument passed in");
});

test("the median is over the last 200 ms of voiced readings: one outlier changes nothing", () => {
  const rows = steady(0, 0, 600);
  rows[15] = [150, 400];
  assert.deepEqual(feed(rows).first, { t: 300, acc: { cents: 0, start: 0 } },
    "RULE: an outlier inside the hold keeps the median in band; cents is the median of the raw errors, so the outlier doesn't shift it");
});

test("a scoop: the hold starts once the median comes into band", () => {
  const { first } = feed([...steady(-100, 0, 140), ...steady(0, 150, 1000)]);
  assert.ok(first, "accepted");
  assert.equal(first!.acc.start, 240, "RULE: the median is over entries with wt > t - 200. At 230 the window has 11 readings at -100 and 10 at 0 (median -100); at 240 it has 10 and 10, so the median is (-100 + 0) / 2 = -50, in band");
  assert.equal(first!.t, 540);
  assert.equal(first!.acc.cents, 0);
});

test("gaps: <= 100 ms pauses the hold, > 100 ms resets it", () => {
  const paused = feed([...steady(0, 0, 150), ...steady(null, 160, 240), ...steady(0, 250, 1000)]).first;
  assert.deepEqual(paused, { t: 400, acc: { cents: 0, start: 0 } }, "RULE: the gap from 150 to 250 adds nothing but keeps the hold: 150 + 150 = 300 at t = 400");
  const reset = feed([...steady(0, 0, 150), ...steady(null, 160, 240), ...steady(0, 251, 1000)]).first;
  assert.deepEqual(reset, { t: 551, acc: { cents: 0, start: 251 } }, "RULE: 251 - 150 > 100 resets the hold at the voiced reading");
  const viaNull = feed([...steady(0, 0, 150), ...steady(null, 160, 400), ...steady(0, 410, 1000)]).first;
  assert.deepEqual(viaNull, { t: 710, acc: { cents: 0, start: 410 } }, "RULE: an unvoiced reading more than 100 ms after the last voiced one resets too");
});

test("out of band resets the hold", () => {
  const { first } = feed([...steady(0, 0, 200), ...steady(300, 210, 450), ...steady(0, 460, 1500)]);
  assert.ok(first);
  assert.ok(first!.acc.start > 450, `RULE: once the median leaves the band the hold restarts (start ${first!.acc.start})`);
});

test("recentMedian: voiced readings newer than now - 200, or null", () => {
  const { h } = feed([...steady(70, 0, 100), ...steady(null, 110, 300)]);
  assert.equal(recentMedian(h, 290), 70, "the reading at 100 is newer than 90");
  assert.equal(recentMedian(h, 300), null, "RULE: strictly newer than now - MEDIAN_MS");
});

test("pure: holdReading never changes its input", () => {
  const deepFreeze = (o: any): any => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); } return o; };
  let h = newHold();
  for (const [t, e] of [...steady(0, 0, 400), ...steady(null, 410, 450), ...steady(80, 460, 700)]) {
    const copy = structuredClone(h);
    deepFreeze(h);
    const r = holdReading(h, t, e, 50);
    assert.deepEqual(h, copy, `RULE: return a new hold, never mutate (t = ${t})`);
    h = r.hold;
  }
  assert.deepEqual(structuredClone(h), h, "plain data");
});
```

Write `src/core/hold.ts` now. Reply with exactly one ```ts block containing the whole file.
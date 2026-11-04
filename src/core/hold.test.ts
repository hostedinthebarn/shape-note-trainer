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

test("a reset gap clears the median window too, so old readings don't judge new ones (SW-58 review)", () => {
  const { first } = feed([...steady(300, 0, 200), ...steady(null, 210, 330), ...steady(0, 340, 1000)]);
  assert.deepEqual(first, { t: 640, acc: { cents: 0, start: 340 } },
    "RULE: after a gap of more than 100 ms the median starts empty: the first reading after it (0 cents, t = 340) starts the hold, accepted 300 ms later");
});

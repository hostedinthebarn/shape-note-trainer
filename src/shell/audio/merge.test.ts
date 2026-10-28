import { test } from "node:test";
import assert from "node:assert/strict";
import { createMerger } from "./merge.ts";
import type { ScoringEvent } from "../../types.ts";

const collect = () => {
  const got: ScoringEvent[] = [];
  return { got, m: createMerger((e) => got.push(e)) };
};
const r = (t: number, hz: number | null = 220): ScoringEvent & { type: "reading" } => ({ type: "reading", t, hz });

test("tone events scheduled ahead are released in time order among late readings", () => {
  const { got, m } = collect();
  m.tone({ type: "toneStart", t: 1050 });
  m.tone({ type: "toneEnd", t: 1950 });
  for (const t of [1000, 1040, 1060, 1900, 1960]) m.reading(r(t));
  assert.deepEqual(got.map((e) => `${e.type}@${e.t}`), [
    "reading@1000", "reading@1040", "toneStart@1050", "reading@1060", "reading@1900", "toneEnd@1950", "reading@1960",
  ]);
});

test("flush releases due tone events when no readings come", () => {
  const { got, m } = collect();
  m.tone({ type: "toneEnd", t: 500 });
  m.tone({ type: "toneStart", t: 100 });
  m.flush(99);
  assert.equal(got.length, 0);
  m.flush(100);
  assert.deepEqual(got.map((e) => e.type), ["toneStart"]);
  m.flush(10_000);
  assert.deepEqual(got.map((e) => e.type), ["toneStart", "toneEnd"]);
});

test("hint and skip release due tones first", () => {
  const { got, m } = collect();
  m.tone({ type: "toneStart", t: 100 });
  m.other({ type: "hint", t: 150 });
  assert.deepEqual(got.map((e) => e.type), ["toneStart", "hint"]);
});

test("output never goes back in time", () => {
  const { got, m } = collect();
  m.reading(r(1000));
  m.other({ type: "skip", t: 990 });   // UI clock a little behind the audio clock
  m.reading(r(1010));
  assert.deepEqual(got.map((e) => e.t), [1000, 1000, 1010], "a late-stamped event is clamped to the last time");
});

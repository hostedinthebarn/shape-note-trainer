import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, progress, LEAN_CENTS, CLEAN_TO_SUGGEST, TOP_LEVEL } from "./summary.ts";
import type { NoteResult, Attempt } from "../types.ts";

const U = (cents: number): NoteResult => ({ outcome: "unaided", cents, settleMs: 400 });
const H = (cents: number): NoteResult => ({ outcome: "helped", cents, settleMs: 9000 });
const S: NoteResult = { outcome: "skipped", cents: null, settleMs: null };

const attempt = (level: number, results: NoteResult[], i = 0): Attempt => ({
  exercise: {
    level,
    key: { tonic: "C", accidental: 0, sharps: 0, flats: 0, doMidi: 60 },
    clef: "bass",
    melody: { degrees: results.map(() => 0), rhythm: results.map(() => 1) },
  },
  results,
  strict: false,
  finishedAt: new Date(Date.UTC(2026, 9, 28, 12, i)).toISOString(),
});
const clean = (level: number, i = 0) => attempt(level, [U(3), U(-8), U(1)], i);
const messy = (level: number, i = 0) => attempt(level, [U(3), H(12), U(1)], i);
const skippy = (level: number, i = 0) => attempt(level, [U(3), S, U(1)], i);

const close = (a: number | null, b: number, what: string) =>
  assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${what}: expected ${b}, got ${a}`);

test("constants", () => {
  assert.equal(LEAN_CENTS, 15);
  assert.equal(CLEAN_TO_SUGGEST, 3);
  assert.equal(TOP_LEVEL, 8);
});

test("summarize: all unaided is clean", () => {
  const s = summarize([U(5), U(-3), U(10)]);
  assert.equal(s.total, 3);
  assert.equal(s.unaided, 3);
  assert.equal(s.helped, 0);
  assert.equal(s.skipped, 0);
  assert.deepEqual(s.trouble, [], "RULE: trouble lists only helped or skipped notes");
  close(s.meanCents, 4, "meanCents");
  assert.equal(s.lean, null, "RULE: |4| is within 15 cents, no lean");
  assert.equal(s.clean, true, "RULE: clean when there is at least one note and every note is unaided");
});

test("summarize: counts, trouble notes and a sharp lean", () => {
  const s = summarize([U(20), H(30), S, U(10)]);
  assert.deepEqual([s.total, s.unaided, s.helped, s.skipped], [4, 2, 1, 1]);
  assert.deepEqual(s.trouble, [1, 2], "RULE: trouble is the ascending indices of helped and skipped notes");
  close(s.meanCents, 20, "RULE: meanCents averages unaided AND helped cents (20, 30, 10), skipping the skipped note");
  assert.equal(s.lean, "sharp", "RULE: meanCents 20 > 15 is a sharp lean");
  assert.equal(s.clean, false, "RULE: any helped or skipped note makes the attempt not clean");
});

test("summarize: lean thresholds are strict", () => {
  assert.equal(summarize([U(-16)]).lean, "flat", "RULE: -16 < -15 is a flat lean");
  assert.equal(summarize([U(15)]).lean, null, "RULE: 15 is not beyond 15");
  assert.equal(summarize([U(-15)]).lean, null, "RULE: -15 is not beyond -15");
  assert.equal(summarize([U(15.5)]).lean, "sharp");
  assert.equal(summarize([U(40), U(-40)]).lean, null, "RULE: sharp and flat notes cancel in the mean");
  assert.equal(summarize([H(-30), S, U(-10)]).lean, "flat", "RULE: helped notes count toward the lean (mean -20)");
});

test("summarize: no cents, no notes", () => {
  const s = summarize([S, S]);
  assert.equal(s.meanCents, null, "RULE: no unaided or helped notes means meanCents is null");
  assert.equal(s.lean, null);
  assert.deepEqual(s.trouble, [0, 1]);
  assert.equal(s.clean, false);
  const e = summarize([]);
  assert.deepEqual(e, { total: 0, unaided: 0, helped: 0, skipped: 0, trouble: [], meanCents: null, lean: null, clean: false },
    "RULE: an empty attempt has no notes and is not clean");
});

test("summarize does not modify its input and gives the same answer every time", () => {
  const results = [U(20), H(30), S, U(10)];
  const copy = structuredClone(results);
  const a = summarize(results);
  summarize([U(1)]);
  assert.deepEqual(summarize(results), a, "RULE: same input, same summary, whatever was called in between");
  assert.deepEqual(results, copy, "RULE: summarize must not change the results array");
  a.trouble.push(99);
  assert.deepEqual(summarize(results).trouble, [1, 2], "RULE: each summary is a new object");
});

test("progress: three clean in a row suggests moving up", () => {
  const p = progress([clean(2, 0), clean(2, 1), clean(2, 2)], 2);
  assert.deepEqual(p, { level: 2, cleanStreak: 3, suggestUp: true });
  assert.equal(progress([clean(2, 0), clean(2, 1)], 2).suggestUp, false, "RULE: two is not enough");
  assert.equal(progress([clean(2, 0), clean(2, 1), clean(2, 2), clean(2, 3)], 2).cleanStreak, 4);
});

test("progress: the streak counts back from the latest attempt at the level", () => {
  assert.equal(progress([clean(2, 0), clean(2, 1), messy(2, 2)], 2).cleanStreak, 0,
    "RULE: the latest attempt at the level was not clean, so the streak is 0");
  assert.equal(progress([clean(2, 0), skippy(2, 1), clean(2, 2), clean(2, 3)], 2).cleanStreak, 2,
    "RULE: count back from the latest, stop at the first attempt that wasn't clean");
  assert.equal(progress([messy(2, 0), clean(2, 1), clean(5, 2), clean(2, 3), clean(2, 4)], 2).cleanStreak, 3,
    "RULE: attempts at other levels are ignored; they neither count nor break the streak");
  assert.equal(progress([clean(2, 0), clean(2, 1), messy(5, 2), clean(2, 3)], 2).cleanStreak, 3,
    "RULE: a messy attempt at another level doesn't break this level's streak");
  assert.equal(progress([clean(5, 0), clean(5, 1), clean(5, 2)], 2).cleanStreak, 0, "no attempts at level 2");
  assert.equal(progress([attempt(2, [])], 2).cleanStreak, 0, "RULE: an empty attempt is not clean");
});

test("progress: no suggestion beyond the top level", () => {
  const p = progress([clean(8, 0), clean(8, 1), clean(8, 2), clean(8, 3)], 8);
  assert.deepEqual(p, { level: 8, cleanStreak: 4, suggestUp: false }, "RULE: level 8 is the top; nothing to suggest");
  assert.deepEqual(progress([], 3), { level: 3, cleanStreak: 0, suggestUp: false });
});

test("progress: strict and normal attempts count the same", () => {
  const strict = { ...clean(4, 0), strict: true };
  assert.equal(progress([strict, clean(4, 1), strict], 4).cleanStreak, 3);
});

test("progress does not modify its input", () => {
  const list = [clean(2, 0), messy(2, 1), clean(2, 2)];
  const copy = structuredClone(list);
  progress(list, 2);
  progress(list, 5);
  assert.deepEqual(list, copy, "RULE: progress must not reorder or change the attempts");
  assert.equal(progress(list, 2).cleanStreak, 1);
});

test("progress rejects bad levels", () => {
  for (const l of [0, 9, 2.5, NaN, -1]) assert.throws(() => progress([], l), RangeError, `RULE: level ${l} must be an integer from 1 to 8`);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { keyForDo, noteMidi, fittingKeys, pickKey, MAX_ACCIDENTALS, KEY_SPREAD } from "./keys.ts";
import type { Melody } from "../types.ts";

// [pitch class, tonic, accidental, sharps, flats]
const SPELLING: Array<[number, string, number, number, number]> = [
  [0, "C", 0, 0, 0], [1, "D", -1, 0, 5], [2, "D", 0, 2, 0], [3, "E", -1, 0, 3],
  [4, "E", 0, 4, 0], [5, "F", 0, 0, 1], [6, "F", 1, 6, 0], [7, "G", 0, 1, 0],
  [8, "A", -1, 0, 4], [9, "A", 0, 3, 0], [10, "B", -1, 0, 2], [11, "B", 0, 5, 0],
];

const mel = (degrees: number[]): Melody => ({ degrees, rhythm: degrees.map((_, i) => (i === degrees.length - 1 ? 4 : 1)) });
const SMALL = mel([0, 1, 2, 1, 0]);
const FULL = mel([0, -1, -3, 0, 4, 7, 6, 4, 2, 0]);    // sol below to do above: -5 … +12 semitones
const UP = mel([0, 2, 4, 7, 6, 4, 2, 0]);              // do to do above: 0 … +12
const LOW = mel([0, -1, -3, -1, 0, 2, 4, 2, 0]);       // sol below to sol: -5 … +7
const dos = (keys: { doMidi: number }[]) => keys.map((k) => k.doMidi);

test("constants", () => {
  assert.equal(MAX_ACCIDENTALS, 5);
  assert.equal(KEY_SPREAD, 3);
});

test("keyForDo spells every pitch class from the table, in every octave", () => {
  for (const base of [36, 48, 60, 72]) for (const [pc, tonic, accidental, sharps, flats] of SPELLING) {
    const doMidi = base + pc;
    assert.deepEqual(keyForDo(doMidi), { tonic, accidental, sharps, flats, doMidi },
      `keyForDo(${doMidi}): RULE: spell by pitch class doMidi mod 12 = ${pc} from the table, and carry doMidi through unchanged`);
  }
});

test("keyForDo returns a new object each time", () => {
  const a = keyForDo(60);
  a.sharps = 99;
  assert.equal(keyForDo(60).sharps, 0, "RULE: changing a returned key must not change later results (no shared objects)");
});

test("keyForDo rejects bad input", () => {
  for (const x of [60.5, -1, 128, NaN, Infinity]) assert.throws(() => keyForDo(x), RangeError, `RULE: keyForDo(${x}): doMidi must be an integer from 0 to 127`);
  assert.equal(keyForDo(0).tonic, "C");
  assert.equal(keyForDo(127).tonic, "G");
});

test("noteMidi: scale steps to MIDI notes", () => {
  const rows: Array<[number, number, number]> = [
    [0, 60, 60], [1, 60, 62], [2, 60, 64], [3, 60, 65], [4, 60, 67], [5, 60, 69], [6, 60, 71],
    [7, 60, 72], [9, 60, 76], [14, 60, 84], [-1, 60, 59], [-2, 60, 57], [-3, 60, 55], [-7, 60, 48], [-8, 60, 47],
    [0, 58, 58], [4, 58, 65], [-3, 63, 58],
  ];
  for (const [step, doMidi, want] of rows) assert.equal(noteMidi(step, doMidi), want,
    `noteMidi(${step}, ${doMidi}). RULE: doMidi + 12 * floor(step / 7) + MAJOR_SEMITONES[((step % 7) + 7) % 7]`);
  assert.throws(() => noteMidi(0.5, 60), RangeError, "RULE: step must be an integer");
  assert.throws(() => noteMidi(0, 60.5), RangeError, "RULE: doMidi must be an integer");
});

test("fittingKeys: candidates within 3 semitones, at most 4 sharps or flats, melody in range", () => {
  assert.deepEqual(dos(fittingKeys(SMALL, 60)), [57, 58, 59, 60, 61, 62, 63],
    "small melody, singer do 60: every do from 57 to 63 fits the range, and none has more than 5 sharps or flats (B has 5 sharps, D flat 5 flats)");
  assert.deepEqual(dos(fittingKeys(SMALL, 63)), [60, 61, 62, 63, 64, 65],
    "singer do 63: 66 (F sharp, 6 sharps) is dropped for too many accidentals");
  assert.deepEqual(dos(fittingKeys(FULL, 60)), [60],
    "melody from sol below to do above fills the singer's whole range (55 … 72), so only the singer's own do fits");
  assert.deepEqual(dos(fittingKeys(UP, 60)), [57, 58, 59, 60],
    "melody do … do above: the top note doMidi + 12 must be <= 72, so do <= 60");
  assert.deepEqual(dos(fittingKeys(LOW, 60)), [60, 61, 62, 63],
    "melody sol below … sol: the bottom note doMidi - 5 must be >= 55, so do >= 60");
  assert.deepEqual(dos(fittingKeys(UP, 61)), [58, 59, 60, 61],
    "singer do 61: do 58 … 61 keep the top note <= 73");
  assert.deepEqual(fittingKeys(FULL, 66), [], "singer do 66, full-range melody: only 66 fits the range, and F sharp has 6 sharps");
});

test("fittingKeys returns complete keys in ascending order", () => {
  const keys = fittingKeys(SMALL, 60);
  assert.deepEqual(keys[0], { tonic: "A", accidental: 0, sharps: 3, flats: 0, doMidi: 57 });
  assert.deepEqual(keys[1], { tonic: "B", accidental: -1, sharps: 0, flats: 2, doMidi: 58 });
  assert.deepEqual(keys[2], { tonic: "B", accidental: 0, sharps: 5, flats: 0, doMidi: 59 });
  assert.deepEqual(keys[6], { tonic: "E", accidental: -1, sharps: 0, flats: 3, doMidi: 63 });
  for (const singerDo of [43, 48, 55, 58, 60, 62, 66, 70]) {
    const got = fittingKeys(SMALL, singerDo);
    for (const k of got) {
      assert.ok(Math.abs(k.doMidi - singerDo) <= 3, `singer ${singerDo}: key do ${k.doMidi} is more than 3 semitones away`);
      assert.ok(k.sharps <= 5 && k.flats <= 5, `singer ${singerDo}: key do ${k.doMidi} has too many accidentals`);
      assert.deepEqual(k, keyForDo(k.doMidi), "RULE: each key is spelled exactly as keyForDo spells it");
    }
    assert.deepEqual(dos(got), [...dos(got)].sort((a, b) => a - b), `singer ${singerDo}: RULE: ascending doMidi`);
  }
  assert.throws(() => fittingKeys(SMALL, 60.5), RangeError);
  assert.throws(() => fittingKeys(SMALL, 200), RangeError);
});

test("pickKey: always-my-do and the empty-list fallback use the singer's do without calling rand", () => {
  let calls = 0;
  const rand = () => { calls++; return 0.5; };
  assert.deepEqual(pickKey(SMALL, 66, true, rand), keyForDo(66), "RULE: alwaysMyDo gives keyForDo(singerDo) even with 6 sharps");
  assert.deepEqual(pickKey(SMALL, 60, true, rand), keyForDo(60));
  assert.deepEqual(pickKey(FULL, 66, false, rand), keyForDo(66), "RULE: when no key fits, fall back to keyForDo(singerDo)");
  assert.equal(calls, 0, "RULE: rand must not be called for alwaysMyDo or the fallback");
});

test("pickKey: one rand() call indexes the fitting keys", () => {
  const seq = (v: number) => { let calls = 0; return { rand: () => { calls++; return v; }, calls: () => calls }; };
  const cases: Array<[number, number]> = [[0, 57], [0.2, 58], [0.5, 60], [0.7, 61], [0.999, 63]];
  for (const [v, want] of cases) {
    const r = seq(v);
    assert.equal(pickKey(SMALL, 60, false, r.rand).doMidi, want, `rand ${v} over 7 keys: RULE: keys[Math.floor(rand() * keys.length)]`);
    assert.equal(r.calls(), 1, "RULE: rand is called exactly once when choosing");
  }
  const one = seq(0.9);
  assert.equal(pickKey(FULL, 60, false, one.rand).doMidi, 60, "one fitting key: that key");
  assert.equal(one.calls(), 1);
});

test("pickKey never calls Math.random and gives the same key for the same rand", () => {
  const real = Math.random;
  Math.random = () => { throw new Error("pickKey must use the rand() passed in, not Math.random"); };
  try {
    for (const v of [0.1, 0.9, 0.4, 0.1]) assert.deepEqual(pickKey(SMALL, 60, false, () => v), pickKey(SMALL, 60, false, () => v));
  } finally {
    Math.random = real;
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { hzToDegree, degreeToHz, scalePosition } from "./degree.ts";

const C4 = 261.6255653005986;
const G3 = 195.99771799087463;

const close = (actual: number, expected: number, what: string, eps = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${what}: expected ${expected}, got ${actual}`);

type Row = [hz: number, doHz: number, degree: string, index: number, octave: number, cents: number];

const SCALE = [0, 2, 4, 5, 7, 9, 11];

/** Explains the rule for one row, so a failure says what the right reasoning is. */
const why = (hz: number, doHz: number, octave: number, index: number) => {
  const s = 12 * Math.log2(hz / doHz);
  const p = 12 * octave + SCALE[index];
  return `RULE: s = 12 * log2(hz / doHz) = ${s.toFixed(4)} semitones from do. ` +
    `Compare the ABSOLUTE distance |s - p| for scale positions p = 12 * octave + MAJOR_SEMITONES[index] across neighbouring octaves (octave can be -1, 0, +1 relative to floor(s / 12), and negative), ` +
    `and pick the smallest. Here the nearest is p = ${p} (index ${index}, octave ${octave}), |s - p| = ${Math.abs(s - p).toFixed(4)}. ` +
    `octave is the octave of that scale tone (so a slightly flat do is octave 0, not -1), and cents = 100 * (s - p) = ${(100 * (s - p)).toFixed(4)}.`;
};

const check = (rows: Row[]) => {
  for (const [hz, doHz, degree, index, octave, cents] of rows) {
    const r = hzToDegree(hz, doHz);
    const where = `hzToDegree(${hz}, ${doHz})`;
    const rule = why(hz, doHz, octave, index);
    assert.equal(r.degree, degree, `${where}.degree should be "${degree}", got "${r.degree}". ${rule}`);
    assert.equal(r.index, index, `${where}.index should be ${index}, got ${r.index}. ${rule}`);
    assert.equal(r.octave, octave, `${where}.octave should be ${octave}, got ${r.octave}. ${rule}`);
    close(r.cents, cents, `${where}.cents (${rule})`);
  }
};

test("in-tune degrees of C major, octave 0", () => {
  check([
    [C4, C4, "do", 0, 0, 0],
    [293.6647679174076, C4, "re", 1, 0, 0],
    [329.6275569128699, C4, "mi", 2, 0, 0],
    [349.2282314330039, C4, "fa", 3, 0, 0],
    [391.99543598174927, C4, "sol", 4, 0, 0],
    [440, C4, "la", 5, 0, 0],
    [493.8833012561241, C4, "ti", 6, 0, 0],
  ]);
});

test("octaves above and below do", () => {
  check([
    [246.94165062806206, C4, "ti", 6, -1, 0],
    [523.2511306011972, C4, "do", 0, 1, 0],
    [130, C4, "do", 0, -1, -10.790280595445978],
    [1000, C4, "ti", 6, 1, 21.309485364913172],
    [70, C4, "re", 1, -2, -82.49203589563159],
    [1100, C4, "do", 0, 2, 86.31371386483515],
  ]);
});

test("sharp and flat readings", () => {
  check([
    [445, C4, "la", 5, 0, 19.56217479492075],
    [255, C4, "do", 0, 0, -44.407531998961844],
    [329, C4, "mi", 2, 0, -3.299127747301611],
    [340, C4, "fa", 3, 0, -46.362532864349504],
    [500, C4, "ti", 6, 0, 21.309485364912817],
  ]);
});

test("chromatic notes go to the nearer whole-tone neighbour", () => {
  check([
    [277, C4, "do", 0, 0, 98.85894302943463],
    [278, C4, "re", 1, 0, -94.90236896138269],
    [233.08, C4, "la", 5, -1, 99.98603045752516],
    [236, C4, "ti", 6, -1, -78.459996995382],
  ]);
});

test("another key: do = G3", () => {
  check([
    [185, G3, "ti", 6, -1, 0.02609638998322117],
    [98, G3, "do", 0, -1, 0.020156708658447542],
    [440, G3, "re", 1, 1, 0],
    [293.66476791740763, G3, "sol", 4, 0, 0],
    [175, G3, "ti", 6, -1, -96.17832203079698],
  ]);
});

test("hzToDegree rejects bad input", () => {
  assert.throws(() => hzToDegree(0, C4), RangeError);
  assert.throws(() => hzToDegree(-440, C4), RangeError);
  assert.throws(() => hzToDegree(440, 0), RangeError);
  assert.throws(() => hzToDegree(Number.NaN, C4), RangeError);
  assert.throws(() => hzToDegree(Number.POSITIVE_INFINITY, C4), RangeError);
});

test("degreeToHz", () => {
  close(degreeToHz("do", 0, C4), C4, "do 0");
  close(degreeToHz("sol", 0, C4), 391.99543598174927, "sol 0");
  close(degreeToHz("re", -1, C4), 146.8323839587038, "re -1");
  close(degreeToHz("ti", -1, C4), 246.94165062806206, "ti -1");
  close(degreeToHz("fa", 1, C4), 698.4564628660078, "fa 1");
  close(degreeToHz("re", 1, G3), 440, "G3 re 1");
});

test("degreeToHz and hzToDegree round-trip", () => {
  const degrees = ["do", "re", "mi", "fa", "sol", "la", "ti"] as const;
  for (let octave = -2; octave <= 2; octave++) {
    degrees.forEach((d, i) => {
      const r = hzToDegree(degreeToHz(d, octave, G3), G3);
      const rule = `RULE: degreeToHz(d, octave, doHz) = doHz * 2 ** ((12 * octave + MAJOR_SEMITONES[index]) / 12), and hzToDegree must invert it exactly: same degree, same octave, cents 0.`;
      assert.equal(r.degree, d, `round trip ${d} octave ${octave}: degree. ${rule}`);
      assert.equal(r.index, i, `round trip ${d} octave ${octave}: index. ${rule}`);
      assert.equal(r.octave, octave, `round trip ${d} octave ${octave}: octave. ${rule}`);
      close(r.cents, 0, `${d} ${octave} cents`);
    });
  }
});

test("degreeToHz rejects bad input", () => {
  assert.throws(() => degreeToHz("do", 0, 0), RangeError);
  assert.throws(() => degreeToHz("do", 0.5, C4), RangeError);
  assert.throws(() => degreeToHz("so" as never, 0, C4), RangeError);
});

const hzAt = (semitones: number, doHz: number) => doHz * 2 ** (semitones / 12);

test("scalePosition: scale tones land on whole steps from do", () => {
  // [semitones from do, expected position]
  const rows: Array<[number, number]> = [
    [0, 0], [2, 1], [4, 2], [5, 3], [7, 4], [9, 5], [11, 6], [12, 7], [14, 8], [24, 14],
    [-1, -1], [-3, -2], [-5, -3], [-7, -4], [-12, -7], [-13, -8],
  ];
  for (const doHz of [C4, G3]) for (const [semi, pos] of rows) {
    close(scalePosition(hzAt(semi, doHz), doHz), pos,
      `scalePosition ${semi} semitones from do. RULE: octave = floor(s / 12), r = s - 12 * octave; a scale tone with MAJOR_SEMITONES[i] = r is at 7 * octave + i`, 1e-9);
  }
});

test("scalePosition: between scale tones, linear in semitones", () => {
  const rows: Array<[number, number, string]> = [
    [1, 0.5, "C sharp: halfway from do (0) to re (1), a whole tone"],
    [3, 1.5, "E flat: halfway from re to mi"],
    [4.5, 2.5, "a quarter tone above mi: halfway to fa, which is only a semitone away"],
    [6, 3.5, "F sharp: halfway from fa (5) to sol (7)"],
    [10, 5.5, "B flat: halfway from la to ti"],
    [11.5, 6.5, "a quarter tone above ti: halfway to do above (next = 12)"],
    [-2, -1.5, "B flat below: octave -1, r = 10, between la (-2) and ti (-1)"],
    [-0.5, -0.5, "a quarter tone below do: octave -1, r = 11.5, between ti below (-1) and do (0)"],
    [0.5, 0.25, "a quarter tone above do: a quarter of the way to re"],
    [7.2, 4.1, "20 cents sharp of sol: a tenth of the way from sol to la"],
  ];
  for (const [semi, pos, why] of rows) close(scalePosition(hzAt(semi, C4), C4), pos, `scalePosition ${semi} semitones (${why}). RULE: 7 * octave + i + (r - MAJOR_SEMITONES[i]) / (next - MAJOR_SEMITONES[i])`, 1e-9);
});

test("scalePosition is continuous and increasing", () => {
  let prev = -Infinity;
  for (let c = -2400; c <= 2400; c += 7) {
    const p = scalePosition(hzAt(c / 100, G3), G3);
    assert.ok(p > prev, `RULE: a higher pitch is always higher on the scale; ${c} cents gave ${p} after ${prev}`);
    assert.ok(p - prev < 0.08 || prev === -Infinity, `RULE: no jumps; ${c} cents gave ${p} after ${prev}`);
    prev = p;
  }
});

test("scalePosition agrees with hzToDegree on scale tones, in any call order", () => {
  for (let octave = 1; octave >= -2; octave--) for (let i = 6; i >= 0; i--) {
    const hz = degreeToHz(["do", "re", "mi", "fa", "sol", "la", "ti"][i] as never, octave, G3);
    close(scalePosition(hz, G3), 7 * octave + i, `scalePosition of degree ${i} octave ${octave}`, 1e-9);
    assert.equal(hzToDegree(hz, G3).index, i);
    close(scalePosition(hz, G3), 7 * octave + i, "same answer when called again", 1e-9);
  }
});

test("scalePosition rejects bad input", () => {
  for (const [hz, d] of [[0, C4], [-1, C4], [NaN, C4], [Infinity, C4], [C4, 0], [C4, NaN]]) {
    assert.throws(() => scalePosition(hz, d), RangeError, `RULE: hz ${hz}, doHz ${d}: both must be finite numbers > 0`);
  }
});

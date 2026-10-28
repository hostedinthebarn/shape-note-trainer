import { test } from "node:test";
import assert from "node:assert/strict";
import { hzToDegree, degreeToHz } from "./degree.ts";

const C4 = 261.6255653005986;
const G3 = 195.99771799087463;

const close = (actual: number, expected: number, what: string, eps = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${what}: expected ${expected}, got ${actual}`);

type Row = [hz: number, doHz: number, degree: string, index: number, octave: number, cents: number];

const check = (rows: Row[]) => {
  for (const [hz, doHz, degree, index, octave, cents] of rows) {
    const r = hzToDegree(hz, doHz);
    const where = `hzToDegree(${hz}, ${doHz})`;
    assert.equal(r.degree, degree, `${where}.degree`);
    assert.equal(r.index, index, `${where}.index`);
    assert.equal(r.octave, octave, `${where}.octave`);
    close(r.cents, cents, `${where}.cents`);
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
      assert.equal(r.degree, d, `${d} ${octave}`);
      assert.equal(r.index, i);
      assert.equal(r.octave, octave, `${d} ${octave} octave`);
      close(r.cents, 0, `${d} ${octave} cents`);
    });
  }
});

test("degreeToHz rejects bad input", () => {
  assert.throws(() => degreeToHz("do", 0, 0), RangeError);
  assert.throws(() => degreeToHz("do", 0.5, C4), RangeError);
  assert.throws(() => degreeToHz("so" as never, 0, C4), RangeError);
});

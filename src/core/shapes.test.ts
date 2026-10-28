import { test } from "node:test";
import assert from "node:assert/strict";
import { isDegree, degreeFromStep, fillForDuration, shapeFor, glyphChar } from "./shapes.ts";
import type { HeadFill, StemDirection } from "./shapes.ts";
import type { Degree } from "../types.ts";

// [degree, fill, stem, shape, smuflName, codepoint]
type Row = [Degree, HeadFill, StemDirection, string, string, number];

const NOT_FA: Array<[Degree, string, string, number]> = [
  ["do", "triangle-up", "TriangleUp", 0xe1ba],
  ["re", "moon", "Moon", 0xe1bc],
  ["mi", "diamond", "Diamond", 0xe1b8],
  ["sol", "round", "Round", 0xe1b0],
  ["la", "square", "Square", 0xe1b2],
  ["ti", "triangle-round", "TriangleRound", 0xe1be],
];

const ROWS: Row[] = [];
for (const [d, shape, base, white] of NOT_FA) {
  for (const stem of ["up", "down", "none"] as const) {
    ROWS.push([d, "white", stem, shape, `noteShape${base}White`, white]);
    ROWS.push([d, "black", stem, shape, `noteShape${base}Black`, white + 1]);
  }
}
ROWS.push(
  ["fa", "white", "up", "triangle-left", "noteShapeTriangleLeftWhite", 0xe1b6],
  ["fa", "black", "up", "triangle-left", "noteShapeTriangleLeftBlack", 0xe1b7],
  ["fa", "white", "down", "triangle-right", "noteShapeTriangleRightWhite", 0xe1b4],
  ["fa", "black", "down", "triangle-right", "noteShapeTriangleRightBlack", 0xe1b5],
  ["fa", "white", "none", "triangle-right", "noteShapeTriangleRightWhite", 0xe1b4],
  ["fa", "black", "none", "triangle-right", "noteShapeTriangleRightBlack", 0xe1b5],
);

test("shapeFor: every degree x fill x stem (42 cases)", () => {
  assert.equal(ROWS.length, 42);
  for (const [d, fill, stem, shape, smuflName, codepoint] of ROWS) {
    const g = shapeFor(d, fill, stem);
    const where = `shapeFor(${d}, ${fill}, ${stem})`;
    assert.equal(g.shape, shape, `${where}.shape`);
    assert.equal(g.smuflName, smuflName, `${where}.smuflName`);
    assert.equal(g.codepoint, codepoint, `${where}.codepoint (expected 0x${codepoint.toString(16)}, got 0x${g.codepoint?.toString(16)})`);
  }
});

test("shapeFor: only fa changes with stem direction", () => {
  for (const d of ["do", "re", "mi", "sol", "la", "ti"] as const) {
    assert.deepEqual(shapeFor(d, "black", "up"), shapeFor(d, "black", "down"));
  }
  assert.notDeepEqual(shapeFor("fa", "black", "up"), shapeFor("fa", "black", "down"));
});

test("shapeFor: rejects bad input", () => {
  assert.throws(() => shapeFor("so" as Degree, "white", "up"), RangeError);
  assert.throws(() => shapeFor("" as Degree, "white", "up"), RangeError);
  assert.throws(() => shapeFor("do", "grey" as HeadFill, "up"), RangeError);
  assert.throws(() => shapeFor("do", "white", "sideways" as StemDirection), RangeError);
  assert.throws(() => shapeFor("fa", "black", "left" as StemDirection), RangeError);
});

test("isDegree", () => {
  for (const d of ["do", "re", "mi", "fa", "sol", "la", "ti"]) assert.equal(isDegree(d), true, d);
  for (const x of ["so", "Do", "doh", "", 0, null, undefined, {}, ["do"]]) assert.equal(isDegree(x), false, String(x));
});

test("degreeFromStep", () => {
  const cases: Array<[number, Degree]> = [
    [0, "do"], [1, "re"], [2, "mi"], [3, "fa"], [4, "sol"], [5, "la"], [6, "ti"],
    [7, "do"], [8, "re"], [14, "do"], [-1, "ti"], [-2, "la"], [-3, "sol"], [-7, "do"], [-8, "ti"],
  ];
  for (const [n, d] of cases) assert.equal(degreeFromStep(n), d, `degreeFromStep(${n})`);
  assert.throws(() => degreeFromStep(1.5), RangeError);
  assert.throws(() => degreeFromStep(Number.NaN), RangeError);
});

test("fillForDuration", () => {
  const cases: Array<[number, HeadFill]> = [[4, "white"], [3, "white"], [2, "white"], [1.5, "black"], [1, "black"], [0.5, "black"]];
  for (const [q, f] of cases) assert.equal(fillForDuration(q), f, `fillForDuration(${q})`);
  for (const q of [0, 5, 2.5, 0.25, -1, Number.NaN]) assert.throws(() => fillForDuration(q), RangeError, `fillForDuration(${q})`);
});

test("glyphChar", () => {
  assert.equal(glyphChar(shapeFor("la", "white", "up")), "");
  assert.equal(glyphChar(shapeFor("fa", "black", "up")), "");
  assert.equal(glyphChar(shapeFor("do", "black", "none")).length, 1);
});

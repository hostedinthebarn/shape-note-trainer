// Sanity checks on the shared constants every packet relies on (SW-44).
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEGREES, MAJOR_SEMITONES, LEVELS, VOICE_PARTS } from "./types.ts";

test("seven degrees with major-scale semitones", () => {
  assert.equal(DEGREES.length, 7);
  assert.deepEqual([...MAJOR_SEMITONES], [0, 2, 4, 5, 7, 9, 11]);
});

test("eight levels, numbered 1-8, each rhythm pattern filling a 4/4 bar", () => {
  assert.deepEqual(LEVELS.map((l) => l.level), [1, 2, 3, 4, 5, 6, 7, 8]);
  for (const l of LEVELS) for (const r of l.rhythms) assert.equal(r.reduce((a, b) => a + b, 0), 4, `level ${l.level} pattern ${r} must sum to 4`);
});

test("tenor and bass read the bass clef, as in Songs of Faith and Praise; tenor do is C4", () => {
  assert.equal(VOICE_PARTS.T.clef, "bass");
  assert.equal(VOICE_PARTS.B.clef, "bass");
  assert.equal(VOICE_PARTS.T.defaultDoMidi, 60);
});

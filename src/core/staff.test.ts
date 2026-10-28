import { test } from "node:test";
import assert from "node:assert/strict";
import { staffPosition, keySignature, splitBars, yOf, breakSystems, NOTE_WIDTH } from "./staff.ts";
import type { Key } from "../types.ts";

const key = (tonic: Key["tonic"], accidental: Key["accidental"], sharps: number, flats: number, doMidi: number): Key => ({ tonic, accidental, sharps, flats, doMidi });
const C4 = key("C", 0, 0, 0, 60);
const C5 = key("C", 0, 0, 0, 72);
const A3 = key("A", 0, 3, 0, 57);
const D4 = key("D", 0, 2, 0, 62);
const Bb3 = key("B", -1, 0, 2, 58);
const Eb3 = key("E", -1, 0, 3, 51);
const Fs4 = key("F", 1, 6, 0, 66);

test("NOTE_WIDTH", () => {
  assert.deepEqual({ ...NOTE_WIDTH }, { "0.5": 2, "1": 3, "1.5": 3.5, "2": 4, "3": 5, "4": 6 });
});

test("staffPosition: half-spaces above the bottom line, from the key's do", () => {
  const rows: Array<[number, Key, "treble" | "bass", number, string]> = [
    [0, C4, "bass", 10, "tenor do C4 on the bass clef: first ledger line above (A3 is the top line, 8)"],
    [-3, C4, "bass", 7, "sol below do = G3, the top space but one"],
    [7, C4, "bass", 17, "do above = C5"],
    [0, C4, "treble", -2, "middle C on the treble clef: first ledger line below"],
    [0, C5, "treble", 5, "C5: third space of the treble staff"],
    [0, D4, "treble", -1, "D4: just below the bottom line"],
    [0, Bb3, "bass", 9, "B flat 3: the space above the top line. The accidental doesn't move the note: spell from the tonic letter"],
    [0, Eb3, "bass", 5, "E flat 3: third space of the bass staff"],
    [2, Eb3, "bass", 7, "mi in E flat = G3"],
    [0, Fs4, "treble", 1, "F sharp 4: first space"],
    [0, A3, "bass", 8, "A3: top line of the bass staff"],
  ];
  for (const [step, k, clef, want, why] of rows) assert.equal(staffPosition(step, k, clef), want,
    `staffPosition(${step}, do ${k.tonic}${k.accidental} midi ${k.doMidi}, ${clef}): ${why}. RULE: diatonic(do) = LETTERS.indexOf(tonic) + 7 * (Math.floor((doMidi - accidental) / 12) - 1); position = diatonic(do) + step - bottom line (treble 30 = E4, bass 18 = G2)`);
});

test("yOf: staff spaces down from the top line", () => {
  assert.deepEqual([yOf(0), yOf(8), yOf(4), yOf(-2), yOf(10), yOf(5)], [4, 0, 2, 5, -1, 1.5]);
});

test("keySignature: positions per clef, sharps or flats", () => {
  const G = key("G", 0, 1, 0, 55), F = key("F", 0, 0, 1, 53), E = key("E", 0, 4, 0, 52), Ab = key("A", -1, 0, 4, 56), Db = key("D", -1, 0, 5, 61), B = key("B", 0, 5, 0, 59);
  assert.deepEqual(keySignature(C4, "treble"), [], "C major: no accidentals");
  assert.deepEqual(keySignature(G, "treble"), [8], "G major treble: F sharp on the top line");
  assert.deepEqual(keySignature(G, "bass"), [6], "RULE: the bass clef is the treble list shifted down 2");
  assert.deepEqual(keySignature(D4, "bass"), [6, 3]);
  assert.deepEqual(keySignature(E, "treble"), [8, 5, 9, 6], "RULE: sharps in order F C G D at 8 5 9 6");
  assert.deepEqual(keySignature(B, "bass"), [6, 3, 7, 4, 1]);
  assert.deepEqual(keySignature(F, "treble"), [4], "F major: B flat on the middle line");
  assert.deepEqual(keySignature(Bb3, "bass"), [2, 5]);
  assert.deepEqual(keySignature(Ab, "treble"), [4, 7, 3, 6], "RULE: flats in order B E A D at 4 7 3 6");
  assert.deepEqual(keySignature(Db, "bass"), [2, 5, 1, 4, 0]);
  assert.deepEqual(keySignature(Fs4, "treble"), [8, 5, 9, 6, 3, 7]);
});

test("splitBars: indices grouped into 4/4 bars", () => {
  assert.deepEqual(splitBars([1, 1, 1, 1, 2, 2, 4]), [[0, 1, 2, 3], [4, 5], [6]]);
  assert.deepEqual(splitBars([1.5, 0.5, 2, 3, 1, 4]), [[0, 1, 2], [3, 4], [5]]);
  assert.throws(() => splitBars([3, 2]), RangeError, "RULE: a note may not cross a barline");
  assert.throws(() => splitBars([1, 1]), RangeError, "RULE: the last bar must be complete");
  assert.throws(() => splitBars([0.75, 3.25]), RangeError, "RULE: only durations in NOTE_WIDTH");
});


test("breakSystems: greedy, whole bars, gap between bars", () => {
  // start 4.8, gap 1, bars of 12 except a last of 6: one bar 16.8, two 29.8, three 42.8, all four 49.8
  const w = [12, 12, 12, 6];
  assert.deepEqual(breakSystems(w, 4.8, 1, 49.8), [[0, 1, 2, 3]], "RULE: a system may be exactly maxWidth");
  assert.deepEqual(breakSystems(w, 4.8, 1, 49.7), [[0, 1, 2], [3]], "RULE: start + bars + gap between consecutive bars must stay <= maxWidth");
  assert.deepEqual(breakSystems(w, 4.8, 1, 30), [[0, 1], [2, 3]], "each new system starts again from start: 4.8 + 12 + 1 + 6 = 23.8");
  assert.deepEqual(breakSystems(w, 4.8, 1, 29.7), [[0], [1], [2, 3]]);
  assert.deepEqual(breakSystems(w, 4.8, 1, 5), [[0], [1], [2], [3]], "RULE: the first bar of a system always goes in, even if too wide");
  assert.deepEqual(breakSystems([], 4.8, 1, 30), [], "no bars, no systems");
  assert.deepEqual(breakSystems([10, 10, 10], 0, 0, 20), [[0, 1], [2]], "gap 0, start 0");
  const ws = [12, 12, 12, 6];
  breakSystems(ws, 4.8, 1, 30);
  assert.deepEqual(ws, [12, 12, 12, 6], "RULE: does not modify its input");
});

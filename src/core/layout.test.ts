import { test } from "node:test";
import assert from "node:assert/strict";
import {
  layoutStaff,
  HEAD_W, STEM_LEN, CLEF_X, KEY_X, KEY_STEP, KEY_GAP, BAR_GAP, THICK, NOTE_WIDTH, CODE, ANCHORS,
} from "./layout.ts";
import type { StaffLayout, Line, Glyph } from "./layout.ts";
import { staffPosition, keySignature, yOf } from "./staff.ts";
import type { Key, Melody } from "../types.ts";

const key = (tonic: Key["tonic"], accidental: Key["accidental"], sharps: number, flats: number, doMidi: number): Key => ({ tonic, accidental, sharps, flats, doMidi });
const C4 = key("C", 0, 0, 0, 60);
const C5 = key("C", 0, 0, 0, 72);
const A3 = key("A", 0, 3, 0, 57);
const D4 = key("D", 0, 2, 0, 62);
const Bb3 = key("B", -1, 0, 2, 58);
const Eb3 = key("E", -1, 0, 3, 51);
const Fs4 = key("F", 1, 6, 0, 66);

const close = (a: number, b: number, what: string, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${what}: expected ${b}, got ${a}`);
const heads = (l: StaffLayout, s = 0) => l.systems[s].glyphs.filter((g) => g.kind === "head");
const linesOf = (l: StaffLayout, kind: Line["kind"], note: number | null = null, s = 0) =>
  l.systems[s].lines.filter((x) => x.kind === kind && (note === null || x.note === note));
const glyphsOf = (l: StaffLayout, kind: Glyph["kind"], s = 0) => l.systems[s].glyphs.filter((g) => g.kind === kind);

// do re mi (quarter, quarter, half) | do (whole), tenor in C: all above the bass staff.
const SHORT: Melody = { degrees: [0, 1, 2, 0], rhythm: [1, 1, 2, 4] };

test("constants", () => {
  assert.deepEqual([HEAD_W, STEM_LEN, CLEF_X, KEY_X, KEY_STEP, KEY_GAP, BAR_GAP], [1.44, 3.5, 0.5, 3.3, 1, 1.5, 1]);
  assert.deepEqual({ ...THICK }, { staff: 0.13, ledger: 0.16, stem: 0.12, bar: 0.16, final: 0.5 });
  assert.deepEqual({ ...NOTE_WIDTH }, { "0.5": 2, "1": 3, "1.5": 3.5, "2": 4, "3": 5, "4": 6 });
  assert.deepEqual({ ...CODE }, { gClef: 0xe050, fClef: 0xe062, sharp: 0xe262, flat: 0xe260, dot: 0xe1e7, flagUp: 0xe240, flagDown: 0xe241 });
  assert.deepEqual(ANCHORS["triangle-left"], { up: [1.436, -0.5], down: null });
  assert.deepEqual(ANCHORS["triangle-right"], { up: null, down: [0, 0.476] });
  assert.deepEqual(ANCHORS.round, { up: [1.456, 0.192], down: [0, -0.168] });
});

test("one system: heads, ledgers, stems, barlines and anchors", () => {
  const l = layoutStaff(SHORT, "bass", C4, 100);
  assert.equal(l.systems.length, 1);
  const s = l.systems[0];
  assert.equal(s.firstNote, 0);
  assert.equal(s.lastNote, 3);
  const notesX = KEY_X + 0 + KEY_GAP; // 4.8
  const xs = [notesX, notesX + 3, notesX + 6, notesX + 10 + BAR_GAP];
  const h = heads(l);
  assert.deepEqual(h.map((g) => g.codepoint), [0xe1bb, 0xe1bd, 0xe1b8, 0xe1ba], "RULE: shapes from shapeFor: black do, black re, white mi (half), white do (whole)");
  h.forEach((g, i) => close(g.x, xs[i], `head ${i} x. RULE: notes start at KEY_X + KEY_STEP * accidentals + KEY_GAP; each note advances NOTE_WIDTH; BAR_GAP after each barline`));
  assert.deepEqual(h.map((g) => g.y), [-1, -1.5, -2, -1], "RULE: head y = yOf(staffPosition)");
  assert.deepEqual(h.map((g) => g.note), [0, 1, 2, 3]);
  // Ledger lines: do at 10 has one, re at 11 one, mi at 12 two.
  assert.equal(linesOf(l, "ledger", 0).length, 1);
  assert.equal(linesOf(l, "ledger", 1).length, 1, "RULE: ledger lines at even positions from 10 up to the note");
  const lm = linesOf(l, "ledger", 2);
  assert.deepEqual(lm.map((x) => x.y1).sort((a, b) => a - b), [-2, -1]);
  close(lm[0].x1, xs[2] - 0.4, "ledger starts 0.4 left of the head");
  close(lm[0].x2, xs[2] + HEAD_W + 0.4, "ledger ends 0.4 right of the head");
  assert.equal(lm[0].thickness, 0.16);
  // Stems: positions >= 4 point down, using the stemDownNW anchor; whole notes have none.
  const st0 = linesOf(l, "stem", 0)[0];
  close(st0.x1, xs[0] + 0, "do stem down: anchor (0, -0.5)");
  close(st0.y1, -1 + 0.5, "RULE: stem starts at y - anchorY (SMuFL y points up)");
  close(st0.y2, -0.5 + STEM_LEN, "RULE: a down stem runs STEM_LEN down");
  assert.equal(st0.thickness, 0.12);
  assert.equal(linesOf(l, "stem", 3).length, 0, "RULE: whole notes have no stem");
  // Barlines.
  const bars = linesOf(l, "bar");
  assert.equal(bars.length, 2);
  close(bars[0].x1, notesX + 10, "barline after bar 1, at the end of its last note's width");
  assert.equal(bars[0].thickness, 0.16);
  close(bars[1].x1, xs[3] + 6, "final barline");
  assert.equal(bars[1].thickness, 0.5, "RULE: the very last barline is THICK.final");
  assert.deepEqual([bars[0].y1, bars[0].y2], [0, 4]);
  close(s.width, xs[3] + 6, "RULE: system width = x of its last barline");
  // Staff lines span the system.
  const staff = linesOf(l, "staff");
  assert.deepEqual(staff.map((x) => x.y1).sort((a, b) => a - b), [0, 1, 2, 3, 4]);
  for (const x of staff) { assert.equal(x.x1, 0); close(x.x2, s.width, "staff line length"); assert.equal(x.thickness, 0.13); }
  // Clef, no key signature in C.
  assert.deepEqual(glyphsOf(l, "clef"), [{ kind: "clef", codepoint: 0xe062, x: 0.5, y: 1, note: null }], "RULE: the bass clef sits on the F line (position 6)");
  assert.equal(glyphsOf(l, "key").length, 0);
  // Anchors: the centre of each head.
  l.anchors.forEach((a, i) => { assert.equal(a.system, 0); close(a.x, xs[i] + HEAD_W / 2, `anchor ${i} x`); assert.equal(a.y, h[i].y); });
});

test("stems up below the middle line, down from it; fa follows the stem", () => {
  // Treble, C4: do -2, re -1, mi 0, fa 1 (up) ... ti 5 (down), fa above at 8 (down).
  const m: Melody = { degrees: [0, 3, 4, 6, 3, 2, 1, 0, 3, 7, 10, 3], rhythm: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] };
  const l = layoutStaff(m, "treble", C4, 1000);
  const h = heads(l);
  assert.deepEqual(glyphsOf(l, "clef")[0], { kind: "clef", codepoint: 0xe050, x: 0.5, y: 3, note: null }, "RULE: the treble clef sits on the G line (position 2)");
  const up = linesOf(l, "stem", 0)[0];
  close(up.x1, h[0].x + 1.424, "do stem up: stemUpSE x");
  close(up.y1, h[0].y + 0.5, "do stem up: y - (-0.5)");
  close(up.y2, up.y1 - STEM_LEN, "RULE: an up stem runs STEM_LEN up");
  assert.equal(h[1].codepoint, 0xe1b7, "fa at position 1, stem up: triangle-left black");
  close(linesOf(l, "stem", 1)[0].x1, h[1].x + 1.436, "fa up anchor x");
  const ti = linesOf(l, "stem", 3)[0];
  assert.equal(staffPosition(6, C4, "treble"), 4, "ti is on the middle line");
  close(ti.x1, h[3].x, "RULE: the middle line (4) points down");
  close(ti.y2, ti.y1 + STEM_LEN, "down");
  assert.equal(h[10].codepoint, 0xe1b5, "fa above at position 8, stem down: triangle-right black");
  close(linesOf(l, "stem", 10)[0].y1, h[10].y - 0.476, "fa down anchor y");
});

test("dots, flags and a whole-note fa", () => {
  // Treble C4: sol (pos 2, line) dotted quarter, la eighth, fa half | dotted half on mi (pos 0, line), quarter | whole fa
  const m: Melody = { degrees: [4, 5, 3, 2, 1, 3], rhythm: [1.5, 0.5, 2, 3, 1, 4] };
  const l = layoutStaff(m, "treble", C4, 1000);
  const h = heads(l);
  const dots = glyphsOf(l, "dot");
  assert.equal(dots.length, 2);
  const d0 = dots.find((g) => g.note === 0)!;
  close(d0.x, h[0].x + HEAD_W + 0.5, "dot x");
  assert.equal(d0.y, yOf(3), "RULE: a note on a line (even position) puts its dot in the space above");
  assert.equal(dots.find((g) => g.note === 3)!.y, yOf(1), "dotted half on mi (position 0): dot at 1");
  assert.equal(d0.codepoint, 0xe1e7);
  const flag = glyphsOf(l, "flag");
  assert.equal(flag.length, 1, "RULE: only eighth notes get a flag");
  const st = linesOf(l, "stem", 1)[0];
  assert.equal(flag[0].codepoint, 0xe240, "la at position 3: stem up, flag up");
  close(flag[0].x, st.x1 - 0.06, "RULE: flag x = stem x - THICK.stem / 2");
  close(flag[0].y, st.y2, "flag at the stem end");
  assert.equal(h[5].codepoint, 0xe1b4, "RULE: a whole-note fa has no stem and uses the stem-down glyph (triangle-right white)");
  assert.equal(h[2].codepoint, 0xe1b6, "half-note fa at position 1, stem up: triangle-left white");
});

test("a dotted note in a space keeps its dot in that space", () => {
  const l = layoutStaff({ degrees: [5, 4, 0], rhythm: [3, 1, 4] }, "treble", C4, 1000);
  assert.equal(staffPosition(5, C4, "treble"), 3);
  assert.equal(glyphsOf(l, "dot")[0].y, yOf(3), "RULE: odd position (a space): the dot stays at that position");
});

test("key signature is pinned on every system", () => {
  const q = [1, 1, 1, 1];
  const m: Melody = { degrees: [0, 1, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 0], rhythm: [...q, ...q, ...q, 4] };
  const l = layoutStaff(m, "bass", A3, 30);
  // header = 3.3 + 3 + 1.5 = 7.8; a bar of quarters is 12 wide.
  assert.equal(l.systems.length, 3, "7.8 + 12 = 19.8; + 1 + 12 = 32.8 > 30: one bar per system until the last, 7.8 + 12 + 1 + 6 = 26.8 fits");
  for (let s = 0; s < 3; s++) {
    assert.equal(glyphsOf(l, "clef", s).length, 1, `system ${s}: clef`);
    const ks = glyphsOf(l, "key", s);
    assert.deepEqual(ks.map((g) => g.y), [6, 3, 7].map(yOf), `system ${s}: RULE: the key signature (bass, 3 sharps: 6 3 7) on every system`);
    ks.forEach((g, j) => { assert.equal(g.codepoint, 0xe262); close(g.x, KEY_X + KEY_STEP * j, "key glyph x"); });
    close(heads(l, s)[0].x, 7.8, `system ${s}: notes start after the key signature`);
  }
  assert.deepEqual(l.systems.map((s) => [s.firstNote, s.lastNote]), [[0, 3], [4, 7], [8, 12]]);
  assert.deepEqual(l.systems.map((s) => linesOf(l, "bar", null, l.systems.indexOf(s)).map((b) => b.thickness)), [[0.16], [0.16], [0.16, 0.5]],
    "RULE: only the last barline of the last system is final");
  assert.deepEqual(l.anchors.map((a) => a.system), [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
  const bb = layoutStaff(m, "bass", Bb3, 1000);
  assert.deepEqual(glyphsOf(bb, "key").map((g) => g.codepoint), [0xe260, 0xe260], "flats use the flat glyph");
});

test("line breaking is greedy by whole bars", () => {
  const q = [1, 1, 1, 1];
  const m: Melody = { degrees: [0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0], rhythm: [...q, ...q, ...q, 4] };
  const count = (w: number) => layoutStaff(m, "treble", C5, w).systems.map((s) => [s.firstNote, s.lastNote]);
  // header 4.8: bar 16.8, two bars 29.8, three 42.8, all four 49.8
  assert.deepEqual(count(49.8), [[0, 12]], "RULE: a system may be exactly maxWidth");
  assert.deepEqual(count(49.7), [[0, 11], [12, 12]]);
  assert.deepEqual(count(30), [[0, 7], [8, 12]]);
  assert.deepEqual(count(29.7), [[0, 3], [4, 7], [8, 12]], "4.8 + 12 + 1 + 6 = 23.8 for the last pair");
  assert.deepEqual(count(5), [[0, 3], [4, 7], [8, 11], [12, 12]], "RULE: a bar always goes on an empty system, even if it overflows");
  const two = layoutStaff(m, "treble", C5, 30);
  close(heads(two, 1)[0].x, 4.8, "RULE: each system restarts at the notes' start x");
  close(two.systems[1].width, 4.8 + 12 + 1 + 6, "second system width");
});

test("pure: same input, same layout; input untouched", () => {
  const m: Melody = { degrees: [0, 1, 2, 0], rhythm: [1, 1, 2, 4] };
  const copy = structuredClone(m);
  const a = layoutStaff(m, "bass", C4, 30);
  layoutStaff({ degrees: [4, 5, 3, 2, 1, 3], rhythm: [1.5, 0.5, 2, 3, 1, 4] }, "treble", D4, 12);
  assert.deepEqual(layoutStaff(m, "bass", C4, 30), a);
  assert.deepEqual(m, copy, "RULE: layoutStaff must not change the melody");
});

test("bad input", () => {
  assert.throws(() => layoutStaff(SHORT, "bass", C4, 0), RangeError, "RULE: maxWidth must be > 0");
  assert.throws(() => layoutStaff({ degrees: [0, 1], rhythm: [4] }, "bass", C4, 50), RangeError, "RULE: degrees and rhythm must be the same length");
  assert.throws(() => layoutStaff({ degrees: [], rhythm: [] }, "bass", C4, 50), RangeError, "RULE: at least one note");
  assert.throws(() => layoutStaff({ degrees: [0, 1], rhythm: [3, 2] }, "bass", C4, 50), RangeError);
});

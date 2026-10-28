import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  init, step, view, fold, noteTime,
  BAND_CENTS, STRICT_BAND_CENTS, MEDIAN_MS, HOLD_MS, GAP_MS, TONE_TAIL_MS, HINT_AFTER_MS,
} from "./scoring.ts";
import type { ScoringState } from "./scoring.ts";
import type { ScoringEvent } from "../types.ts";

const C3 = 130.8127826502993;
/** The frequency `cents` away from do. */
const at = (cents: number, doHz = C3) => doHz * 2 ** (cents / 1200);

/** Voiced readings every `every` ms from `from` up to and including `to`. */
function sing(cents: number, from: number, to: number, every = 10, doHz = C3): ScoringEvent[] {
  const out: ScoringEvent[] = [];
  for (let t = from; t <= to; t += every) out.push({ type: "reading", t, hz: at(cents, doHz) });
  return out;
}
function silence(from: number, to: number, every = 10): ScoringEvent[] {
  const out: ScoringEvent[] = [];
  for (let t = from; t <= to; t += every) out.push({ type: "reading", t, hz: null });
  return out;
}
const run = (s: ScoringState, events: ScoringEvent[]) => events.reduce(step, s);
const close = (a: number | null, b: number, what: string, eps = 1e-6) =>
  assert.ok(a !== null && Math.abs(a - b) <= eps, `${what}: expected ${b}, got ${a}`);

/** Run events one at a time; return the index (into events) of the event that finished note 0, or -1. */
function acceptedAt(s: ScoringState, events: ScoringEvent[]): { t: number | null; state: ScoringState } {
  let state = s;
  for (const e of events) {
    const before = view(state).noteIndex;
    state = step(state, e);
    if (view(state).noteIndex > before && view(state).results.at(-1)?.outcome !== "skipped") return { t: e.t, state };
  }
  return { t: null, state };
}

test("constants", () => {
  assert.deepEqual([BAND_CENTS, STRICT_BAND_CENTS, MEDIAN_MS, HOLD_MS, GAP_MS, TONE_TAIL_MS, HINT_AFTER_MS], [50, 25, 200, 300, 100, 150, 8000]);
});

test("fold: e - 1200 * Math.round(e / 1200)", () => {
  const rows: Array<[number, number]> = [[0, 0], [30, 30], [1200, 0], [1250, 50], [-1190, 10], [700, -500], [-700, 500], [2405, 5], [600, -600], [-600, -600]];
  for (const [e, want] of rows) close(fold(e), want, `fold(${e}). RULE: fold to the nearest octave with e - 1200 * Math.round(e / 1200)`);
});

test("noteTime: time the current note has been current, excluding tone time", () => {
  const s0 = init({ steps: [0, 1], doHz: C3, strict: false }, 100);
  assert.equal(noteTime(s0, 600), 500, "RULE: T - noteStart");
  const s1 = run(s0, [{ type: "toneStart", t: 200 }, { type: "toneEnd", t: 500 }]);
  assert.equal(noteTime(s1, 900), 500, "RULE: minus the paused ms of finished tones (300)");
  const s2 = run(s1, [{ type: "toneStart", t: 1000 }]);
  assert.equal(noteTime(s2, 1400), 600, "RULE: minus the running tone too: 1300 - 300 - 400");
  const s3 = run(s0, [...sing(0, 100, 400)]);
  assert.equal(noteTime(s3, 1400), 1000, "RULE: after acceptance at 400 the next note's time starts there");
});

test("a steady in-tune note is accepted after 300 ms of hold", () => {
  const s = init({ steps: [0, 2], doHz: C3, strict: false }, -500);
  const r = acceptedAt(s, sing(0, 0, 1000));
  assert.equal(r.t, 300, "RULE: the hold starts at the first in-band reading (t = 0) and the note is accepted on the reading where held time reaches HOLD_MS (t = 300)");
  const v = view(r.state);
  assert.equal(v.noteIndex, 1, "RULE: acceptance moves to the next note");
  assert.deepEqual(v.results, [{ outcome: "unaided", cents: 0, settleMs: 500 }],
    "RULE: unaided; cents is the median raw error over the accepted hold; settleMs runs from the note becoming current (init t = -500) to the start of the hold (t = 0)");
  assert.equal(v.done, false);
});

test("while holding: status holding, not yet accepted at 290 ms", () => {
  const s = run(init({ steps: [0], doHz: C3, strict: false }, 0), sing(10, 0, 290));
  const v = view(s);
  assert.equal(v.noteIndex, 0, "RULE: 290 ms of hold is not enough");
  assert.equal(v.status, "holding", "RULE: status is holding when |median| <= band");
  close(v.cents, 10, "cents is the median of the recent folded errors");
  assert.equal(v.singing, null);
});

test("octave-folded: an octave above or below do still counts as do", () => {
  for (const off of [1200, -1200, 2400]) {
    const r = acceptedAt(init({ steps: [0], doHz: C3, strict: false }, 0), sing(off + 20, 0, 600));
    assert.equal(r.t, 300, `do sung ${off} cents away: RULE: errors are folded to the nearest octave before judging`);
    close(view(r.state).results[0].cents, 20, `folded cents for ${off}`);
  }
  const hi = acceptedAt(init({ steps: [7], doHz: C3, strict: false }, 0), sing(0, 0, 600));
  assert.equal(hi.t, 300, "target do above (step 7), sung on do: same note an octave away, accepted");
});

test("band edges: ±50 cents normally, ±25 in strict mode", () => {
  const cases: Array<[number, boolean, boolean]> = [
    [49.9, false, true], [-49.9, false, true], [50.1, false, false], [-50.1, false, false],
    [24.9, true, true], [-24.9, true, true], [25.1, true, false], [-25.1, true, false], [40, true, false],
  ];
  for (const [c, strict, ok] of cases) {
    const r = acceptedAt(init({ steps: [0], doHz: C3, strict }, 0), sing(c, 0, 2000));
    assert.equal(r.t !== null, ok, `${c} cents, strict ${strict}: RULE: in tune when |median| <= ${strict ? 25 : 50}`);
  }
  const v = view(run(init({ steps: [0], doHz: C3, strict: false }, 0), sing(60, 0, 500)));
  assert.equal(v.status, "sharp", "RULE: median above the band is sharp");
  const f = view(run(init({ steps: [0], doHz: C3, strict: false }, 0), sing(-60, 0, 500)));
  assert.equal(f.status, "flat", "RULE: median below the band is flat");
  close(f.cents, -60, "flat cents");
});

test("median smoothing: a single wild reading does not break the hold", () => {
  const ev = sing(0, 0, 600);
  ev[15] = { type: "reading", t: 150, hz: at(400) };
  const r = acceptedAt(init({ steps: [0], doHz: C3, strict: false }, 0), ev);
  assert.equal(r.t, 300, "RULE: the 200 ms median ignores one outlier, so the hold carries on");
});

test("median smoothing: a scoop from 100 cents flat settles once the median is in band", () => {
  const ev = [...sing(-100, 0, 140), ...sing(0, 150, 1000)];
  const r = acceptedAt(init({ steps: [0], doHz: C3, strict: false }, 0), ev);
  assert.ok(r.t !== null, "accepted after the scoop");
  const res = view(r.state).results[0];
  assert.ok(res.settleMs! >= 150 && res.settleMs! <= 300, `RULE: the hold starts when the 200 ms median comes into band, after the scoop; settleMs ${res.settleMs}`);
  close(res.cents, 0, "RULE: cents is the median of the raw errors from the start of the hold, after the scoop");
  assert.equal(r.t, res.settleMs! + 300, "RULE: accepted 300 ms after the hold starts (no gaps)");
});

test("gaps: up to 100 ms pauses the hold, more than 100 ms resets it", () => {
  // Hold 0..150 (150 ms held), unvoiced readings, then voiced again.
  const paused = [...sing(0, 0, 150), ...silence(160, 240), ...sing(0, 250, 1000)];
  const a = acceptedAt(init({ steps: [0], doHz: C3, strict: false }, -500), paused);
  assert.equal(a.t, 400, "RULE: a 100 ms gap (150 -> 250) pauses the hold: 150 ms before + 150 ms after, accepted at 400");
  assert.equal(view(a.state).results[0].settleMs, 500, "settle time is to the start of the hold, which survived the gap");

  const reset = [...sing(0, 0, 150), ...silence(160, 240), ...sing(0, 251, 1000)];
  const b = acceptedAt(init({ steps: [0], doHz: C3, strict: false }, -500), reset);
  assert.equal(b.t, 551, "RULE: a 101 ms gap (150 -> 251) resets the hold, which restarts at 251");
  assert.equal(view(b.state).results[0].settleMs, 751);

  const longSilence = [...sing(0, 0, 150), ...silence(160, 400), ...sing(0, 410, 1000)];
  assert.equal(acceptedAt(init({ steps: [0], doHz: C3, strict: false }, 0), longSilence).t, 710, "RULE: the gap is judged on unvoiced readings too; restart at 410");
});

test("tone gating: readings are ignored during a tone and for 150 ms after it ends", () => {
  const ev: ScoringEvent[] = [
    { type: "toneStart", t: 0 },
    ...sing(0, 10, 990),               // the open mic hearing the tone itself
    { type: "toneEnd", t: 1000 },
    ...sing(300, 1000, 1140),          // wrong note during the tail: ignored
    ...sing(0, 1150, 2000),
  ];
  const r = acceptedAt(init({ steps: [0], doHz: C3, strict: false }, 0), ev);
  assert.equal(r.t, 1450, "RULE: ignore readings from toneStart until toneEnd + 150 ms; the hold starts at 1150");
  assert.equal(view(r.state).results[0].settleMs, 150, "RULE: clocks pause while a tone plays: 1150 - 0 - 1000 ms of tone");
});

test("a tone during a hold resets it", () => {
  const ev: ScoringEvent[] = [...sing(0, 0, 200), { type: "toneStart", t: 205 }, { type: "toneEnd", t: 400 }, ...sing(0, 550, 1200)];
  const r = acceptedAt(init({ steps: [0], doHz: C3, strict: false }, 0), ev);
  assert.equal(r.t, 850, "RULE: a toneStart clears the hold and the median window; the hold restarts at 550");
  assert.equal(view(r.state).results[0].settleMs, 355, "settle 550 - 195 ms of tone");
  const during = view(run(init({ steps: [0], doHz: C3, strict: false }, 0), [...sing(0, 0, 200), { type: "toneStart", t: 205 }]));
  assert.equal(during.status, "listening", "RULE: while a tone plays the view is listening");
  assert.equal(during.cents, null);
});

test("hint clock: offered after 8 s of current-note time, paused by tones", () => {
  const s0 = init({ steps: [0, 1], doHz: C3, strict: false }, 0);
  assert.equal(view(run(s0, silence(0, 7990, 10))).hintOffered, false, "7.99 s: not yet");
  assert.equal(view(run(s0, silence(0, 8000, 10))).hintOffered, true, "RULE: hintOffered once 8000 ms have passed since the note became current");
  const withTone = [...silence(0, 990), { type: "toneStart", t: 1000 } as ScoringEvent, { type: "toneEnd", t: 2000 } as ScoringEvent];
  assert.equal(view(run(s0, [...withTone, ...silence(2010, 8990)])).hintOffered, false, "RULE: the 1 s tone pauses the clock, so 8990 is only 7990 ms");
  assert.equal(view(run(s0, [...withTone, ...silence(2010, 9000)])).hintOffered, true, "9000 - 1000 ms of tone = 8000");
  const toneOpen = run(s0, [...silence(0, 7490), { type: "toneStart", t: 7500 }, { type: "hint", t: 8500 }]);
  assert.equal(view(toneOpen).hintOffered, false, "RULE: a tone still playing also pauses the clock (7500 ms so far)");
  const r = acceptedAt(s0, [...silence(0, 2000), { type: "toneStart", t: 2010 }, { type: "toneEnd", t: 3010 }, ...sing(0, 3200, 4000)]);
  assert.equal(view(r.state).results[0].settleMs, 2200, "replaying do does not restart the clock: 3200 - 1000 ms of tone");
});

test("hint makes the note helped; skip makes it skipped and starts the next note", () => {
  const s0 = init({ steps: [0, 2, 4], doHz: C3, strict: false }, 0);
  const helped = run(s0, [...silence(0, 8100), { type: "hint", t: 8110 }, { type: "toneStart", t: 8120 }, { type: "toneEnd", t: 9120 }, ...sing(0, 9300, 9700)]);
  const v = view(helped);
  assert.equal(v.results[0].outcome, "helped", "RULE: a hint before acceptance makes the note helped");
  assert.equal(v.results[0].settleMs, 8300, "9300 - 1000 ms of tone");
  assert.equal(v.hintOffered, false, "RULE: the next note's hint clock starts fresh at its acceptance (t = 9600)");

  const skipped = run(helped, [{ type: "skip", t: 9800 }]);
  const w = view(skipped);
  assert.deepEqual(w.results[1], { outcome: "skipped", cents: null, settleMs: null }, "RULE: skip records a skipped result");
  assert.equal(w.noteIndex, 2);
  const third = acceptedAt(skipped, sing(700, 10000, 10500));
  assert.deepEqual(view(third.state).results[2], { outcome: "unaided", cents: 0, settleMs: 200 },
    "RULE: after a skip the next note is current from the skip (9800); hints don't carry over");
});

test("the attempt finishes after the last note; later events change nothing", () => {
  const s = run(init({ steps: [0, 1], doHz: C3, strict: false }, 0), [...sing(0, 0, 300), ...sing(200, 400, 700)]);
  const v = view(s);
  assert.equal(v.done, true, "RULE: done once every note has a result");
  assert.equal(v.noteIndex, 2, "RULE: noteIndex equals the note count when done");
  assert.equal(v.results.length, 2);
  assert.equal(v.status, "listening");
  assert.equal(v.hintOffered, false);
  const after = run(s, [...sing(0, 800, 1200), { type: "skip", t: 1300 }, { type: "hint", t: 1400 }]);
  assert.deepEqual(view(after), v, "RULE: events after done are ignored");
});

test("consecutive notes: do, re, mi sung straight through", () => {
  const ev = [...sing(0, 0, 400), ...sing(200, 410, 800), ...sing(400, 810, 1200)];
  const v = view(run(init({ steps: [0, 1, 2], doHz: C3, strict: false }, 0), ev));
  assert.deepEqual(v.results.map((r) => r.outcome), ["unaided", "unaided", "unaided"]);
  assert.deepEqual(v.results.map((r) => r.settleMs), [0, 210, 10],
    "RULE: re becomes current when do is accepted (t = 300), with an empty median window. The do readings 310-400 are 200 cents flat for re, so the median only comes into band at 510, when re readings are the majority of the last 200 ms. Re is accepted at 810 and mi's hold starts on the next reading (820)");
});

test("wrong degree: the view names the degree being sung when it isn't the target", () => {
  const look = (target: number, cents: number) => view(run(init({ steps: [target], doHz: C3, strict: false }, 0), sing(cents, 0, 250)));
  let v = look(0, 400);
  assert.deepEqual([v.status, v.singing], ["sharp", "mi"], "target do, sung on mi (+400): sharp, singing mi");
  close(v.cents, 400, "cents against the target");
  v = look(0, -100);
  assert.deepEqual([v.status, v.singing], ["flat", "ti"], "target do, sung a semitone flat: ti");
  v = look(0, 60);
  assert.deepEqual([v.status, v.singing], ["sharp", null], "RULE: +60 is out of band but still nearest do, so singing is null");
  v = look(0, 300);
  assert.equal(v.singing, "re", "RULE: exactly between re and mi: the lower degree");
  v = look(4, 500);
  assert.deepEqual([v.status, v.singing], ["flat", "fa"], "target sol (700), sung on fa (500): flat by 200, singing fa");
  v = look(4, 1200);
  assert.deepEqual([v.status, v.singing], ["sharp", "do"], "target sol, sung on do above: folded +500, singing do");
  v = look(6, 1200);
  assert.deepEqual([v.status, v.singing], ["sharp", "do"], "target ti, sung on do above: +100, singing do");
  v = look(0, 20);
  assert.deepEqual([v.status, v.singing], ["holding", null], "RULE: singing is null while in band");
});

test("listening: no voiced reading in the last 200 ms", () => {
  const s0 = init({ steps: [0], doHz: C3, strict: false }, 0);
  assert.equal(view(s0).status, "listening", "fresh state");
  assert.equal(view(s0).cents, null);
  assert.equal(view(run(s0, [...sing(70, 0, 100), ...silence(110, 290)])).status, "sharp", "RULE: the 100 ms reading is within 200 ms of 290");
  assert.equal(view(run(s0, [...sing(70, 0, 100), ...silence(110, 300)])).status, "listening", "RULE: at 300 the last voiced reading (100) is not newer than now - 200");
});

test("pure: step never changes its input state, and the state is plain data", () => {
  const deepFreeze = (o: any): any => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); } return o; };
  const ev: ScoringEvent[] = [...sing(0, 0, 400), { type: "toneStart", t: 410 }, { type: "toneEnd", t: 900 }, { type: "hint", t: 950 }, ...sing(200, 1100, 1500), { type: "skip", t: 1600 }];
  let s = init({ steps: [0, 1, 2, 3], doHz: C3, strict: false }, 0);
  for (const e of ev) {
    const copy = structuredClone(s);
    deepFreeze(s);
    const next = step(s, e);
    assert.deepEqual(s, copy, `RULE: step must return a new state and never mutate the old one (event ${e.type} at ${e.t})`);
    s = next;
  }
  assert.deepEqual(structuredClone(s), s, "RULE: the state is plain data (structuredClone round-trips)");
  const a = view(run(init({ steps: [0, 1, 2, 3], doHz: C3, strict: false }, 0), ev));
  const b = view(run(init({ steps: [0, 1, 2, 3], doHz: C3, strict: false }, 0), ev));
  assert.deepEqual(a, b, "RULE: the same events give the same view");
  assert.deepEqual(a.results.map((r) => r.outcome), ["unaided", "helped", "skipped"]);
  const v = view(s);
  v.results.push({ outcome: "skipped", cents: null, settleMs: null });
  assert.equal(view(s).results.length, 3, "RULE: view returns a new results array");
});

test("init rejects bad config", () => {
  assert.throws(() => init({ steps: [], doHz: C3, strict: false }, 0), RangeError, "RULE: at least one note");
  for (const d of [0, -1, NaN, Infinity]) assert.throws(() => init({ steps: [0], doHz: d, strict: false }, 0), RangeError, `RULE: doHz ${d} must be a finite number > 0`);
});

// ── Replay: Gary singing do on an iPhone during the SW-37 prototype (C3, then G2).
// Times in ms, hz null for unpitched frames; from report 2026-10-28T13-01-59 (numbers only).

const replay = JSON.parse(readFileSync(new URL("./fixtures/sw37-c3-g2.json", import.meta.url), "utf8")) as {
  c3: Array<[number, number | null]>; g2: Array<[number, number | null]>; tones: { c3: [number, number]; g2: [number, number] };
};
const G2 = 97.99885899543733;
/** The readings with the do tone's start and end merged in by time (the open mic hears the tone). */
function replayEvents(rows: Array<[number, number | null]>, [t0, t1]: [number, number]): ScoringEvent[] {
  const ev: ScoringEvent[] = rows.map(([t, hz]) => ({ type: "reading", t, hz }));
  ev.push({ type: "toneStart", t: t0 }, { type: "toneEnd", t: t1 });
  return ev.sort((a, b) => a.t - b.t);
}

test("replay: Gary's real do on C3 and G2 is accepted, unaided, a little flat (the tone itself is gated out)", () => {
  for (const [name, rows, tone, doHz] of [["C3", replay.c3, replay.tones.c3, C3], ["G2", replay.g2, replay.tones.g2, G2]] as const) {
    const s = init({ steps: [0], doHz, strict: false }, rows[0][0]);
    const v = view(run(s, replayEvents(rows, tone)));
    assert.equal(v.done, true, `${name}: the sung do is accepted`);
    const r = v.results[0];
    assert.equal(r.outcome, "unaided");
    // The tone reads within 0.3 cents; Gary's first 300 ms in band reads 20-30 cents flat.
    assert.ok(r.cents! < -5 && r.cents! > -50, `${name}: RULE: judged on the voice after toneEnd + 150 ms, not on the tone the mic heard (cents ${r.cents})`);
    const toneMs = tone[1] - Math.max(tone[0], rows[0][0]);
    assert.ok(r.settleMs! >= 150 && r.settleMs! < 2000, `${name}: settle ${r.settleMs} ms, excluding ${toneMs} ms of tone`);
  }
});

test("replay: the same singing is not accepted as sol or mi", () => {
  for (const target of [4, 2]) {
    const v = view(run(init({ steps: [target], doHz: C3, strict: false }, replay.c3[0][0]), replayEvents(replay.c3, replay.tones.c3)));
    assert.equal(v.done, false, `RULE: do sung against target step ${target} is never in band`);
    assert.equal(v.singing === "do" || v.status === "listening", true, `the view says do is being sung (got ${v.singing})`);
  }
});

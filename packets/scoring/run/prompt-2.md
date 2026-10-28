# Packet: scoring

## Task

Write `src/core/scoring.ts` for a shape-note sight-singing trainer: the pure state machine that judges a singer, note by note. An exercise is a list of target notes (scale steps from do). The app **waits on each note**: one note is current, and it moves on only when the singer holds it in tune for 300 ms, or skips it. The shell feeds in timestamped events (pitch readings about every 10 ms, tone start/end, hint, skip); this module never reads a clock. It is a reducer: `step(state, event)` returns a **new** state, and `view(state)` says what the screen shows.

Steps are integers: 0 = do, 1 = re … 6 = ti, 7 = do above, -1 = ti below, -3 = sol below. A step's position is `targetCents(step) = 100 * (12 * Math.floor(step / 7) + MAJOR_SEMITONES[((step % 7) + 7) % 7])` cents above do.

## Interface

```ts
import type { Degree, ScoringEvent, NoteResult, LiveView, LiveStatus } from "../types.ts";
import { DEGREES, MAJOR_SEMITONES } from "../types.ts";
import { newHold, holdReading, recentMedian, MEDIAN_MS, HOLD_MS, GAP_MS } from "./hold.ts";
import type { Hold } from "./hold.ts";

export { MEDIAN_MS, HOLD_MS, GAP_MS };  // re-exported from hold.ts
export const BAND_CENTS = 50;          // in tune: |median| <= this
export const STRICT_BAND_CENTS = 25;   // ... or this in strict mode
export const TONE_TAIL_MS = 150;       // readings ignored this long after a tone ends
export const HINT_AFTER_MS = 8000;     // "play this note" offered after this much note time

export interface ScoringConfig {
  steps: readonly number[];  // the target notes
  doHz: number;              // frequency of do, fixed for the whole exercise
  strict: boolean;
}

/** Your design: whatever the reducer needs, including the current note's `Hold` from hold.ts.
 *  It must be plain data (objects, arrays, numbers, strings, booleans, null; no functions,
 *  Maps, Sets or class instances). */
export interface ScoringState { /* ... */ }

/** Fold a cents error to the nearest octave: e - 1200 * Math.round(e / 1200). */
export function fold(e: number): number;

/** How long the current note has been current at time T, excluding tone time (see "Note time"). */
export function noteTime(state: ScoringState, T: number): number;

/** The starting state: note 0 is current from time t.
 *  Throws RangeError if steps is empty or doHz is not a finite number > 0. */
export function init(config: ScoringConfig, t: number): ScoringState;

/** Apply one event. Never modifies `state` (the tests deep-freeze it); returns a new state. */
export function step(state: ScoringState, event: ScoringEvent): ScoringState;

/** What the exercise screen shows now. Returns new objects and arrays every call. */
export function view(state: ScoringState): LiveView;
```

`ScoringEvent`, `NoteResult` and `LiveView` are in `src/types.ts` (below). Events arrive in time order.

## The rules for `step`

**Once every note has a result, the attempt is done and every event is ignored.** Every event (even an ignored one) sets the state's "now" to its `t`, which `view` uses.

**Tone state** (keep these three fields, separately from everything else):
- `tonePlaying: boolean`, false at first;
- `toneStart: number`, the `t` of the latest toneStart;
- `gateUntil: number | null`, null until the first toneEnd.

A reading is **gated** (ignored) when `tonePlaying` is true, or when `gateUntil !== null && t < gateUntil`. Don't derive the gate from `toneStart`, and never do arithmetic on a null.

The per-note values, all reset whenever a new note becomes current: the **hold** (`newHold()`), **hint used**, the note's start time, and its paused ms.

- **`toneStart`**: `tonePlaying = true`, `toneStart = t`. Replace the hold with `newHold()`.
- **`toneEnd`**: if `tonePlaying`, add `t - max(toneStart, noteStart)` to the note's paused ms. Then `tonePlaying = false`, `gateUntil = t + TONE_TAIL_MS`.
- **`hint`**: mark the current note as hint used.
- **`skip`**: record `{ outcome: "skipped", cents: null, settleMs: null }`, and make the next note current from `t`.
- **`reading`**: if it is gated, ignore it (only "now" changes). Otherwise:
  - `err` = `null` if `hz` is null, else `fold(1200 * Math.log2(hz / doHz) - targetCents(current step))`.
  - `{ hold, accepted } = holdReading(currentHold, t, err, band)`, with band `STRICT_BAND_CENTS` if strict, else `BAND_CENTS`. Keep the new hold.
  - If `accepted`: record `{ outcome: hintUsed ? "helped" : "unaided", cents: accepted.cents, settleMs: noteTime(state, accepted.start) }`, and the next note becomes current from `t`. **Settle time is measured to `accepted.start`, when the hold began, not to the current reading's `t`** (which is at least 300 ms later).


**Note time:** `noteTime(state, T) = T - noteStart - pausedMs - (tonePlaying ? T - max(toneStart, noteStart) : 0)`. It is the time the note has been current, excluding tone time. A tone that started before the note became current counts from the note's start.

## The rules for `view`

- **done:** `{ noteIndex: steps.length, status: "listening", cents: null, singing: null, hintOffered: false, results, done: true }`.
- **otherwise:**
  - `hintOffered = noteTime(state, now) >= HINT_AFTER_MS`.
  - `m` = `recentMedian(hold, now)`, or null while a tone plays.
  - If `m` is null: `status: "listening"`, `cents: null`, `singing: null`.
  - Otherwise: `status` is `"holding"` if `|m| <= band`, `"sharp"` if `m > band`, and `"flat"` if `m < -band`; `cents` is `m`.
  - **singing:** only when the status is sharp or flat. Find the major-scale degree nearest `x = (((targetCents(step) + m) % 1200) + 1200) % 1200 / 100` semitones, comparing against `MAJOR_SEMITONES` plus 12 (which is do). An exact tie goes to the lower degree. If that degree is the target's own degree (`DEGREES[((step % 7) + 7) % 7]`), `singing` is `null`; otherwise it's that degree's name.
- `results` is a new array of the results so far.

## Test vectors

Readings every 10 ms. With do = C3 (130.81 Hz):

| Events | Expected |
|---|---|
| `init({steps: [0, 2]}, -500)`, readings at 0 cents from t = 0 | accepted on the reading at t = 300: `{ outcome: "unaided", cents: 0, settleMs: 500 }`, noteIndex 1 |
| readings at +10 cents, 0–290 | not accepted; status `"holding"`, cents 10 |
| do sung an octave up, +20 cents | accepted at 300, cents 20 (folded) |
| ±49.9 accepted, ±50.1 not; strict: ±24.9 accepted, ±25.1 not | |
| in tune 0–150, unvoiced 160–240, in tune from 250 | accepted at 400 (the gap paused the hold) |
| same, but resuming at 251 | accepted at 551 (the gap of 101 ms reset the hold) |
| `toneStart` 0, `toneEnd` 1000, wrong-pitch readings to 1140, in tune from 1150 | accepted at 1450, settleMs 150 |
| unvoiced readings for 8000 ms | `hintOffered` true; at 7990, false; a 1 s tone pushes it to 9000 |
| target do, singing +400 | sharp, cents 400, singing `"mi"`; +300 → `"re"` (the tie goes lower); +60 → singing null |
| Gary's recorded do on C3 and G2 (fixture), with the tone events | accepted, unaided, between -50 and -5 cents (the open mic's view of the tone, at ~0 cents, is gated out) |

## Constraints

- Pure functions: no I/O, no module-level mutable state, no clock, no randomness, no console output.
- `step` must not modify its input in any way (the tests deep-freeze each state before stepping).
- No imports except from `../types.ts` and `./hold.ts`, as shown above. All median, window, band-hold and gap logic is in `hold.ts`; don't re-implement it.
- Export exactly the five functions, the two interfaces, the four constants and the three re-exported constants above.

## Neighbours

`src/types.ts` and `src/core/hold.ts` are already written; they are included below. Import from it, and don't redefine `ScoringEvent`, `NoteResult`, `LiveView`, `LiveStatus`, `Degree`, `DEGREES` or `MAJOR_SEMITONES`. (It also defines types this packet doesn't need; ignore them.) The tests also read `src/core/fixtures/sw37-c3-g2.json` (recorded readings); you don't need to.

## Rules that always apply

- The file runs under Node's built-in TypeScript type stripping, so use erasable syntax only: no `enum`, no `namespace`, no constructor parameter properties, no decorators.
- Relative imports must include the `.ts` extension (e.g. `./note-types.ts`).
- No npm packages and no Node built-in modules unless the packet's constraints allow them.
- Do not change the exported names or signatures given in the interface.
- No module-level mutable state: no top-level `let` or `var`. Exported functions must give the same result for the same arguments however often or in whatever order they are called. Passing a test by remembering earlier calls is a failure.

## Neighbour file `src/types.ts` (already exists; do not rewrite it)

```ts
// Shared types and constants for the shape-note trainer (SW-44, written by Claude).
// Every core packet imports from this file and nothing else of ours; terms follow CONTEXT.md.
// Erasable TypeScript only: Node and the build strip the types, nothing is compiled.

// ── degrees ──────────────────────────────────────────────────────────────────

/** A movable-do degree of the major scale, in scale order. */
export type Degree = "do" | "re" | "mi" | "fa" | "sol" | "la" | "ti";

/** The seven degrees in scale order; DEGREES[i] is scale index i. */
export const DEGREES: readonly Degree[] = ["do", "re", "mi", "fa", "sol", "la", "ti"];

/** Semitones above do for each scale index (major scale). */
export const MAJOR_SEMITONES: readonly number[] = [0, 2, 4, 5, 7, 9, 11];

/** Where a sung frequency sits relative to the movable-do scale. */
export interface DegreeReading {
  /** The nearest degree of the major scale. */
  degree: Degree;
  /** Its scale index, 0 (do) to 6 (ti). */
  index: number;
  /** Octave of that degree relative to do: 0 = the octave starting on do, -1 below, 1 above. */
  octave: number;
  /** Signed offset from that degree in cents; positive = sharp. */
  cents: number;
}

// ── voice parts, keys ────────────────────────────────────────────────────────

export type Clef = "treble" | "bass";
export type VoicePartId = "S" | "A" | "T" | "B";

/** The line a singer sings. Clefs as in Songs of Faith and Praise: tenor reads the bass clef. */
export interface VoicePart {
  id: VoicePartId;
  name: string;
  clef: Clef;
  /** Default pitch of do as a MIDI note number (60 = C4). Tenor C4 is Gary's ear (SW-38); the rest are guesses (SW-57). */
  defaultDoMidi: number;
  /** Clarity cut-off for the pitch detector (SW-37: 0.8 is borderline at G2). */
  clarityGate: number;
}

export const VOICE_PARTS: Readonly<Record<VoicePartId, VoicePart>> = {
  S: { id: "S", name: "Soprano", clef: "treble", defaultDoMidi: 62, clarityGate: 0.8 },
  A: { id: "A", name: "Alto", clef: "treble", defaultDoMidi: 58, clarityGate: 0.8 },
  T: { id: "T", name: "Tenor", clef: "bass", defaultDoMidi: 60, clarityGate: 0.8 },
  B: { id: "B", name: "Bass", clef: "bass", defaultDoMidi: 48, clarityGate: 0.7 },
};

export type Letter = "C" | "D" | "E" | "F" | "G" | "A" | "B";

/** A major key: what the key signature shows and where do sounds. */
export interface Key {
  /** Letter name of the tonic (do). */
  tonic: Letter;
  /** -1 flat, 0 natural, 1 sharp, applied to the tonic letter (B♭ = { tonic: "B", accidental: -1 }). */
  accidental: -1 | 0 | 1;
  /** Number of sharps in the key signature (0 if flats are used). */
  sharps: number;
  /** Number of flats in the key signature (0 if sharps are used). */
  flats: number;
  /** Sounding pitch of do as a MIDI note number. */
  doMidi: number;
}

// ── levels, melodies, exercises ──────────────────────────────────────────────

/** The parameters of one level (SW-34). Degrees are scale steps from do: 0 do … 7 do above, -3 sol below. */
export interface LevelSettings {
  level: number;
  /** Degrees the melody may use, ascending. */
  allowed: readonly number[];
  /** Largest allowed |next - current| in scale steps. */
  maxLeap: number;
  /** Rhythm patterns for bars 1-3; each is note lengths in quarter notes summing to 4. */
  rhythms: readonly (readonly number[])[];
  /** If true, every degree must be one of 0, 2, 4, 7. */
  chord?: boolean;
  /** If set, moves with |d - current| >= prefer get weight x3. */
  prefer?: number;
}

/** What the generator produces: parallel lists of scale steps from do and durations in quarter notes. */
export interface Melody {
  degrees: number[];
  rhythm: number[];
}

/** One short phrase to sing: a melody in a key, on a clef, belonging to a level. */
export interface Exercise {
  level: number;
  key: Key;
  clef: Clef;
  melody: Melody;
}

const QUARTERS = [[1, 1, 1, 1]];
const HALVES = [[1, 1, 1, 1], [1, 1, 2], [2, 1, 1], [2, 2]];
const DOTTED = [...HALVES, [1.5, 0.5, 1, 1], [1, 1, 1.5, 0.5], [1.5, 0.5, 2]];
const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

/** The eight levels, unchanged from the October drills (SW-34, kept in SW-40). */
export const LEVELS: readonly LevelSettings[] = [
  { level: 1, allowed: [0, 1, 2], maxLeap: 1, rhythms: QUARTERS },
  { level: 2, allowed: range(0, 4), maxLeap: 1, rhythms: QUARTERS },
  { level: 3, allowed: range(0, 7), maxLeap: 1, rhythms: QUARTERS },
  { level: 4, allowed: [0, 2, 4, 7], maxLeap: 4, rhythms: QUARTERS, chord: true },
  { level: 5, allowed: range(0, 7), maxLeap: 2, rhythms: QUARTERS, prefer: 2 },
  { level: 6, allowed: range(-3, 4), maxLeap: 3, rhythms: HALVES },
  { level: 7, allowed: range(-3, 7), maxLeap: 4, rhythms: HALVES, prefer: 3 },
  { level: 8, allowed: range(-3, 7), maxLeap: 5, rhythms: DOTTED },
];

// ── settings ─────────────────────────────────────────────────────────────────

export interface Settings {
  voicePart: VoicePartId;
  /** The singer's pitch of do (MIDI). Their range is sol below to do above: doMidi - 5 … doMidi + 12. */
  doMidi: number;
  /** If true, every exercise uses the singer's own do instead of a key chosen near it. */
  alwaysMyDo: boolean;
  /** Strict mode: ±25 cents instead of ±50. Applies from the next attempt. */
  strict: boolean;
}

// ── scoring (SW-39) ──────────────────────────────────────────────────────────

/** Everything scoring reacts to. Each event carries its own time in milliseconds; scoring never reads a clock. */
export type ScoringEvent =
  | { type: "reading"; t: number; hz: number | null }
  | { type: "toneStart"; t: number }
  | { type: "toneEnd"; t: number }
  | { type: "hint"; t: number }
  | { type: "skip"; t: number };

export type NoteOutcome = "unaided" | "helped" | "skipped";

/** The judgement on one note of an attempt. */
export interface NoteResult {
  outcome: NoteOutcome;
  /** Median signed error over the accepted hold, in cents; null when skipped. */
  cents: number | null;
  /** From the note becoming current to the start of the accepted hold, tone time excluded; null when skipped. */
  settleMs: number | null;
}

export type LiveStatus = "listening" | "sharp" | "flat" | "holding";

/** What the exercise screen shows at this moment. */
export interface LiveView {
  /** Index of the current note; equals the note count once the attempt is finished. */
  noteIndex: number;
  status: LiveStatus;
  /** Smoothed signed error against the current note, in cents (octave-folded); null when listening. */
  cents: number | null;
  /** The degree actually being sung, only when it isn't the target and is outside the band. */
  singing: Degree | null;
  /** True once "play this note" should be offered (8 s without acceptance, tone time excluded). */
  hintOffered: boolean;
  /** Results so far, one per finished note. */
  results: NoteResult[];
  done: boolean;
}

// ── history ──────────────────────────────────────────────────────────────────

/** One singing of an exercise, as stored on the device. */
export interface Attempt {
  exercise: Exercise;
  results: NoteResult[];
  strict: boolean;
  /** ISO 8601 time the attempt finished. */
  finishedAt: string;
}
```

## Neighbour file `src/core/hold.ts` (already exists; do not rewrite it)

```ts
export const MEDIAN_MS = 200;
export const HOLD_MS = 300;
export const GAP_MS = 100;

export interface Hold {
  window: Array<[number, number]>;
  start: number | null;
  heldMs: number;
  errs: number[];
  lastVoiced: number | null;
  prevInBand: boolean;
  prevT: number | null;
}

export interface Accepted { cents: number; start: number; }

export function median(xs: readonly number[]): number {
  if (xs.length === 0) throw new RangeError("median of empty array");
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function newHold(): Hold {
  return { window: [], start: null, heldMs: 0, errs: [], lastVoiced: null, prevInBand: false, prevT: null };
}

export function holdReading(h: Hold, t: number, err: number | null, band: number): { hold: Hold; accepted: Accepted | null } {
  const newH = JSON.parse(JSON.stringify(h)) as Hold;
  
  if (err === null) {
    if (newH.lastVoiced !== null && t - newH.lastVoiced > GAP_MS) {
      newH.start = null;
      newH.heldMs = 0;
      newH.errs = [];
    }
    newH.prevInBand = false;
    newH.prevT = t;
    return { hold: newH, accepted: null };
  }

  const gap = newH.lastVoiced !== null && t - newH.lastVoiced > GAP_MS;
  if (gap) {
    newH.start = null;
    newH.heldMs = 0;
    newH.errs = [];
    newH.prevInBand = false;
  }

  newH.window = newH.window.filter(([wt]) => wt > t - MEDIAN_MS);
  newH.window.push([t, err]);

  const windowErrs = newH.window.map(([_, e]) => e);
  const m = median(windowErrs);

  if (Math.abs(m) <= band) {
    if (newH.start === null) {
      newH.start = t;
      newH.heldMs = 0;
      newH.errs = [];
    } else {
      if (newH.prevInBand) {
        newH.heldMs += t - newH.prevT!;
      }
      // If prevInBand is false, the gap paused the hold, so heldMs is unchanged
    }
    newH.errs.push(err);
    newH.prevInBand = true;
  } else {
    newH.start = null;
    newH.heldMs = 0;
    newH.errs = [];
    newH.prevInBand = false;
  }

  newH.lastVoiced = t;
  newH.prevT = t;

  let accepted: Accepted | null = null;
  if (newH.start !== null && newH.heldMs >= HOLD_MS) {
    const cents = median(newH.errs);
    accepted = { cents, start: newH.start };
  }

  return { hold: newH, accepted };
}

export function recentMedian(h: Hold, now: number): number | null {
  const recent = h.window.filter(([t]) => t > now - MEDIAN_MS);
  if (recent.length === 0) return null;
  const errs = recent.map(([_, e]) => e);
  return median(errs);
}
```

## Tests `src/core/scoring.test.ts`

The test file is left out of this retry so the prompt fits the context window. The failing assertions and their RULE messages are in the test output below.

## Your previous attempt at `src/core/scoring.ts`

```ts
import type { Degree, ScoringEvent, NoteResult, LiveView, LiveStatus } from "../types.ts";
import { DEGREES, MAJOR_SEMITONES } from "../types.ts";
import { newHold, holdReading, recentMedian, MEDIAN_MS, HOLD_MS, GAP_MS } from "./hold.ts";
import type { Hold } from "./hold.ts";

export { MEDIAN_MS, HOLD_MS, GAP_MS };  // re-exported from hold.ts
export const BAND_CENTS = 50;          // in tune: |median| <= this
export const STRICT_BAND_CENTS = 25;   // ... or this in strict mode
export const TONE_TAIL_MS = 150;       // readings ignored this long after a tone ends
export const HINT_AFTER_MS = 8000;     // "play this note" offered after this much note time

export interface ScoringConfig {
  steps: readonly number[];  // the target notes
  doHz: number;              // frequency of do, fixed for the whole exercise
  strict: boolean;
}

/** Your design: whatever the reducer needs, including the current note's `Hold` from hold.ts.
 *  It must be plain data (objects, arrays, numbers, strings, booleans, null; no functions,
 *  Maps, Sets or class instances). */
export interface ScoringState {
  config: ScoringConfig;
  now: number;
  done: boolean;
  noteIndex: number;
  tonePlaying: boolean;
  toneStart: number;
  gateUntil: number | null;
  hold: Hold;
  hintUsed: boolean;
  noteStart: number;
  pausedMs: number;
  results: NoteResult[];
}

/** Fold a cents error to the nearest octave: e - 1200 * Math.round(e / 1200). */
export function fold(e: number): number {
  return e - 1200 * Math.round(e / 1200);
}

/** How long the current note has been current at time T, excluding tone time (see "Note time"). */
export function noteTime(state: ScoringState, T: number): number {
  const toneTime = state.tonePlaying ? T - Math.max(state.toneStart, state.noteStart) : 0;
  return T - state.noteStart - state.pausedMs - toneTime;
}

/** The starting state: note 0 is current from time t.
 *  Throws RangeError if steps is empty or doHz is not a finite number > 0. */
export function init(config: ScoringConfig, t: number): ScoringState {
  if (config.steps.length === 0) throw new RangeError("steps must not be empty");
  if (!isFinite(config.doHz) || config.doHz <= 0) throw new RangeError("doHz must be a finite number > 0");
  
  return {
    config,
    now: t,
    done: false,
    noteIndex: 0,
    tonePlaying: false,
    toneStart: t,
    gateUntil: null,
    hold: newHold(),
    hintUsed: false,
    noteStart: t,
    pausedMs: 0,
    results: [],
  };
}

/** Apply one event. Never modifies `state` (the tests deep-freeze it); returns a new state. */
export function step(state: ScoringState, event: ScoringEvent): ScoringState {
  if (state.done) return { ...state, now: event.t };

  const newState = { ...state, now: event.t };
  
  // Handle tone events
  if (event.type === "toneStart") {
    newState.tonePlaying = true;
    newState.toneStart = event.t;
    newState.hold = newHold();
    return newState;
  }
  
  if (event.type === "toneEnd") {
    if (newState.tonePlaying) {
      const toneDuration = event.t - Math.max(newState.toneStart, newState.noteStart);
      newState.pausedMs += toneDuration;
      newState.tonePlaying = false;
      newState.gateUntil = event.t + TONE_TAIL_MS;
    }
    return newState;
  }
  
  // Handle hint and skip events
  if (event.type === "hint") {
    newState.hintUsed = true;
    return newState;
  }
  
  if (event.type === "skip") {
    newState.results.push({ outcome: "skipped", cents: null, settleMs: null });
    newState.noteIndex += 1;
    newState.noteStart = event.t;
    newState.pausedMs = 0;
    newState.hold = newHold();
    newState.hintUsed = false;
    return newState;
  }
  
  // Handle reading events
  if (event.type === "reading") {
    const gated = newState.tonePlaying || (newState.gateUntil !== null && event.t < newState.gateUntil);
    
    if (gated) {
      return newState;
    }
    
    const step = newState.config.steps[newState.noteIndex];
    const targetCents = 100 * (12 * Math.floor(step / 7) + MAJOR_SEMITONES[((step % 7) + 7) % 7]);
    const err = event.hz === null ? null : fold(1200 * Math.log2(event.hz / newState.config.doHz) - targetCents);
    
    const band = newState.config.strict ? STRICT_BAND_CENTS : BAND_CENTS;
    const { hold, accepted } = holdReading(newState.hold, event.t, err, band);
    newState.hold = hold;
    
    if (accepted !== null) {
      const settleMs = noteTime(newState, accepted.start);
      const result: NoteResult = {
        outcome: newState.hintUsed ? "helped" : "unaided",
        cents: accepted.cents,
        settleMs
      };
      
      newState.results.push(result);
      newState.noteIndex += 1;
      newState.noteStart = event.t;
      newState.pausedMs = 0;
      newState.hold = newHold();
      newState.hintUsed = false;
      
      if (newState.noteIndex >= newState.config.steps.length) {
        newState.done = true;
      }
    }
    
    return newState;
  }
  
  return newState;
}

/** What the exercise screen shows now. Returns new objects and arrays every call. */
export function view(state: ScoringState): LiveView {
  if (state.done) {
    return {
      noteIndex: state.config.steps.length,
      status: "listening",
      cents: null,
      singing: null,
      hintOffered: false,
      results: [...state.results],
      done: true
    };
  }
  
  const step = state.config.steps[state.noteIndex];
  const hintOffered = noteTime(state, state.now) >= HINT_AFTER_MS;
  const m = state.tonePlaying ? null : recentMedian(state.hold, state.now);
  
  let status: LiveStatus = "listening";
  let cents: number | null = null;
  let singing: Degree | null = null;
  
  if (m !== null) {
    const band = state.config.strict ? STRICT_BAND_CENTS : BAND_CENTS;
    if (Math.abs(m) <= band) {
      status = "holding";
    } else if (m > band) {
      status = "sharp";
    } else {
      status = "flat";
    }
    cents = m;
    
    // Determine singing
    const targetCents = 100 * (12 * Math.floor(step / 7) + MAJOR_SEMITONES[((step % 7) + 7) % 7]);
    const x = (((targetCents + m) % 1200) + 1200) % 1200 / 100;
    
    let nearestIndex = 0;
    let minDist = Math.abs(x - MAJOR_SEMITONES[0]);
    
    for (let i = 1; i < MAJOR_SEMITONES.length; i++) {
      const dist = Math.abs(x - MAJOR_SEMITONES[i]);
      if (dist < minDist) {
        minDist = dist;
        nearestIndex = i;
      }
    }
    
    // Check tie case: if it's exactly halfway, prefer the lower degree
    if (Math.abs(x - MAJOR_SEMITONES[nearestIndex]) === 0.5) {
      // This is a tie; we want to prefer the lower degree
      // But since we're iterating from 0, and we found the minimum distance,
      // we already have the correct index for this case.
    }
    
    const nearestDegree = DEGREES[nearestIndex];
    const targetDegree = DEGREES[((step % 7) + 7) % 7];
    
    if (nearestDegree !== targetDegree) {
      singing = nearestDegree;
    }
  }
  
  return {
    noteIndex: state.noteIndex,
    status,
    cents,
    singing,
    hintOffered,
    results: [...state.results],
    done: false
  };
}
```

## It failed the tests. Test output (tail)

```
✔ constants (0.559875ms)
✔ fold: e - 1200 * Math.round(e / 1200) (0.095792ms)
✔ noteTime: time the current note has been current, excluding tone time (0.390916ms)
✔ a steady in-tune note is accepted after 300 ms of hold (0.417541ms)
✔ while holding: status holding, not yet accepted at 290 ms (0.223459ms)
✔ octave-folded: an octave above or below do still counts as do (1.299708ms)
✔ band edges: ±50 cents normally, ±25 in strict mode (5.732292ms)
✔ median smoothing: a single wild reading does not break the hold (0.178375ms)
✔ median smoothing: a scoop from 100 cents flat settles once the median is in band (0.466042ms)
✔ gaps: up to 100 ms pauses the hold, more than 100 ms resets it (0.788084ms)
✔ tone gating: readings are ignored during a tone and for 150 ms after it ends (0.305583ms)
✔ a tone during a hold resets it (0.270167ms)
✔ hint clock: offered after 8 s of current-note time, paused by tones (1.665209ms)
✔ hint makes the note helped; skip makes it skipped and starts the next note (0.481ms)
✔ the attempt finishes after the last note; later events change nothing (0.2435ms)
✔ consecutive notes: do, re, mi sung straight through (0.315417ms)
✔ wrong degree: the view names the degree being sung when it isn't the target (0.497708ms)
✔ listening: no voiced reading in the last 200 ms (0.095875ms)
✖ pure: step never changes its input state, and the state is plain data (0.775167ms)
✔ init rejects bad config (0.172667ms)
✔ replay: Gary's real do on C3 and G2 is accepted, unaided, a little flat (the tone itself is gated out) (0.677708ms)
✔ replay: the same singing is not accepted as sol or mi (2.412958ms)
ℹ tests 22
ℹ suites 0
ℹ pass 21
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 98.672208

✖ failing tests:

test at src/core/scoring.test.ts:242:1
✖ pure: step never changes its input state, and the state is plain data (0.775167ms)
  TypeError [Error]: Cannot add property 0, object is not extensible
      at Array.push (<anonymous>)
      at step (file:///Users/gary/Library/Caches/packet-driver/sw48/scoring/qwen3-coder_30b/src/core/scoring.ts:133:24)
      at TestContext.<anonymous> (file:///Users/gary/Library/Caches/packet-driver/sw48/scoring/qwen3-coder_30b/src/core/scoring.test.ts:249:18)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7)
```

Fix the problem. Reply with the complete corrected `src/core/scoring.ts` in one ```ts block.
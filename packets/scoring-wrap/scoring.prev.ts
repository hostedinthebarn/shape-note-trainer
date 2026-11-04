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
    const newResults = [...newState.results, { outcome: "skipped", cents: null, settleMs: null }];
    const newNoteIndex = newState.noteIndex + 1;
    const isDone = newNoteIndex >= newState.config.steps.length;
    
    return {
      ...newState,
      results: newResults,
      noteIndex: newNoteIndex,
      noteStart: event.t,
      pausedMs: 0,
      hold: newHold(),
      hintUsed: false,
      done: isDone
    };
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
    
    // Create new state with updated hold
    const updatedState = { ...newState, hold };
    
    if (accepted !== null) {
      const settleMs = noteTime(updatedState, accepted.start);
      const result: NoteResult = {
        outcome: updatedState.hintUsed ? "helped" : "unaided",
        cents: accepted.cents,
        settleMs
      };
      
      const newResults = [...updatedState.results, result];
      const newNoteIndex = updatedState.noteIndex + 1;
      const isDone = newNoteIndex >= updatedState.config.steps.length;
      
      return {
        ...updatedState,
        results: newResults,
        noteIndex: newNoteIndex,
        noteStart: event.t,
        pausedMs: 0,
        hold: newHold(),
        hintUsed: false,
        done: isDone
      };
    }
    
    return updatedState;
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
    // But since we're iterating from 0, and we found the minimum distance,
    // we already have the correct index for this case.
    
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

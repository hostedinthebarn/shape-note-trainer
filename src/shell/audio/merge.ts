// Time-ordered event merge for the audio engine (SW-49, written by Claude).
// Scoring needs one stream of events in time order (src/core/scoring.ts). Tone events are known
// in advance (scheduled on the audio clock), while readings arrive late (window + hop + worker).
// So tone events wait in a queue and are released just before the first reading at or after
// their time, or by flush(now) when no readings are coming (mic closed, page idle).
import type { ScoringEvent } from "../../types.ts";

type ToneEvent = Extract<ScoringEvent, { type: "toneStart" | "toneEnd" }>;

export interface Merger {
  /** Queue a tone event; it is released in time order. */
  tone(e: ToneEvent): void;
  /** A reading arrived: release queued tone events with t <= reading.t, then the reading. */
  reading(e: Extract<ScoringEvent, { type: "reading" }>): void;
  /** Release queued tone events with t <= now (call from a timer). */
  flush(now: number): void;
  /** Any event that isn't audio (hint, skip) goes straight through, after due tone events. */
  other(e: Extract<ScoringEvent, { type: "hint" | "skip" }>): void;
}

export function createMerger(emit: (e: ScoringEvent) => void): Merger {
  const queue: ToneEvent[] = [];
  // Never emit an event older than the last one: scoring assumes time order.
  let last = -Infinity;
  const out = (e: ScoringEvent) => {
    const t = Math.max(e.t, last);
    last = t;
    emit(t === e.t ? e : { ...e, t });
  };
  const release = (upTo: number) => {
    while (queue.length && queue[0].t <= upTo) out(queue.shift()!);
  };
  return {
    tone(e) {
      queue.push(e);
      queue.sort((a, b) => a.t - b.t);
    },
    reading(e) {
      release(e.t);
      out(e);
    },
    flush(now) {
      release(now);
    },
    other(e) {
      release(e.t);
      out(e);
    },
  };
}

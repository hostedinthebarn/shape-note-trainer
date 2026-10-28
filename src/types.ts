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

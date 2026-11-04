// Device storage (SW-50, minimal; SW-51 hardens it: versions, quota, offline). Settings and
// attempts as JSON in localStorage, the only state the app keeps. Streaks are derived from
// attempts (src/core/summary.ts), never stored.
import type { Settings, Attempt, VoicePartId } from "../types.ts";
import { VOICE_PARTS } from "../types.ts";

const KEY_SETTINGS = "snt.settings.v1";
const KEY_ATTEMPTS = "snt.attempts.v1";
/** Keep the most recent attempts only; plenty for streaks and later trends. */
const MAX_ATTEMPTS = 500;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked: carry on in memory */ }
}

export function defaultSettings(voicePart: VoicePartId): Settings {
  return { voicePart, doMidi: VOICE_PARTS[voicePart].defaultDoMidi, alwaysMyDo: false, strict: false };
}
/** Null on first run (no voice part chosen yet). Anything malformed (an older build, a damaged
 *  store) is repaired field by field rather than allowed to break the first render (SW-58). */
export function loadSettings(): Settings | null {
  const s = read<Partial<Settings>>(KEY_SETTINGS);
  if (!s || typeof s !== "object" || typeof s.voicePart !== "string" || !(s.voicePart in VOICE_PARTS)) return null;
  const base = defaultSettings(s.voicePart as VoicePartId);
  const okMidi = Number.isInteger(s.doMidi) && (s.doMidi as number) >= 24 && (s.doMidi as number) <= 96;
  return {
    voicePart: base.voicePart,
    doMidi: okMidi ? (s.doMidi as number) : base.doMidi,
    alwaysMyDo: typeof s.alwaysMyDo === "boolean" ? s.alwaysMyDo : base.alwaysMyDo,
    strict: typeof s.strict === "boolean" ? s.strict : base.strict,
  };
}
export function saveSettings(s: Settings): void { write(KEY_SETTINGS, s); }

/** Attempts that don't have the shape progress() and summary() rely on are dropped (SW-58). */
export function loadAttempts(): Attempt[] {
  const all = read<unknown>(KEY_ATTEMPTS);
  if (!Array.isArray(all)) return [];
  return all.filter((a): a is Attempt => !!a && typeof a === "object"
    && Array.isArray((a as Attempt).results)
    && Number.isInteger((a as Attempt).exercise?.level)
    && typeof (a as Attempt).finishedAt === "string");
}
export function saveAttempt(a: Attempt): Attempt[] {
  const all = [...loadAttempts(), a].slice(-MAX_ATTEMPTS);
  write(KEY_ATTEMPTS, all);
  return all;
}

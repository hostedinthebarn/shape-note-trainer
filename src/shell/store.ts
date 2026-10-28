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
/** Null on first run (no voice part chosen yet). */
export function loadSettings(): Settings | null {
  const s = read<Settings>(KEY_SETTINGS);
  return s && s.voicePart in VOICE_PARTS ? s : null;
}
export function saveSettings(s: Settings): void { write(KEY_SETTINGS, s); }

export function loadAttempts(): Attempt[] { return read<Attempt[]>(KEY_ATTEMPTS) ?? []; }
export function saveAttempt(a: Attempt): Attempt[] {
  const all = [...loadAttempts(), a].slice(-MAX_ATTEMPTS);
  write(KEY_ATTEMPTS, all);
  return all;
}

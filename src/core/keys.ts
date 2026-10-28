import type { Key, Letter, Melody } from "../types.ts";
import { MAJOR_SEMITONES } from "../types.ts";

export const MAX_ACCIDENTALS = 4;
export const KEY_SPREAD = 3;

const SPELLING: Array<{ tonic: Letter; accidental: -1 | 0 | 1; sharps: number; flats: number }> = [
  { tonic: "C", accidental: 0, sharps: 0, flats: 0 },
  { tonic: "D", accidental: -1, sharps: 0, flats: 5 },
  { tonic: "D", accidental: 0, sharps: 2, flats: 0 },
  { tonic: "E", accidental: -1, sharps: 0, flats: 3 },
  { tonic: "E", accidental: 0, sharps: 4, flats: 0 },
  { tonic: "F", accidental: 0, sharps: 0, flats: 1 },
  { tonic: "F", accidental: 1, sharps: 6, flats: 0 },
  { tonic: "G", accidental: 0, sharps: 1, flats: 0 },
  { tonic: "A", accidental: -1, sharps: 0, flats: 4 },
  { tonic: "A", accidental: 0, sharps: 3, flats: 0 },
  { tonic: "B", accidental: -1, sharps: 0, flats: 2 },
  { tonic: "B", accidental: 0, sharps: 5, flats: 0 },
];

export function keyForDo(doMidi: number): Key {
  if (!Number.isInteger(doMidi) || doMidi < 0 || doMidi > 127) {
    throw new RangeError(`doMidi must be an integer from 0 to 127, got ${doMidi}`);
  }
  const pc = ((doMidi % 12) + 12) % 12;
  const entry = SPELLING[pc];
  return {
    tonic: entry.tonic,
    accidental: entry.accidental,
    sharps: entry.sharps,
    flats: entry.flats,
    doMidi,
  };
}

export function noteMidi(step: number, doMidi: number): number {
  if (!Number.isInteger(step) || !Number.isInteger(doMidi)) {
    throw new RangeError("step and doMidi must be integers");
  }
  const octave = Math.floor(step / 7);
  const idx = ((step % 7) + 7) % 7;
  return doMidi + 12 * octave + MAJOR_SEMITONES[idx];
}

export function fittingKeys(melody: Melody, singerDo: number): Key[] {
  if (!Number.isInteger(singerDo) || singerDo < 5 || singerDo > 115) {
    throw new RangeError(`singerDo must be an integer from 5 to 115, got ${singerDo}`);
  }

  const rangeLow = singerDo - 5;
  const rangeHigh = singerDo + 12;

  const keys: Key[] = [];

  for (let doMidi = singerDo - KEY_SPREAD; doMidi <= singerDo + KEY_SPREAD; doMidi++) {
    const key = keyForDo(doMidi);

    if (key.sharps > MAX_ACCIDENTALS || key.flats > MAX_ACCIDENTALS) {
      continue;
    }

    let fits = true;
    for (const step of melody.degrees) {
      const midi = noteMidi(step, doMidi);
      if (midi < rangeLow || midi > rangeHigh) {
        fits = false;
        break;
      }
    }

    if (fits) {
      keys.push(key);
    }
  }

  return keys;
}

export function pickKey(melody: Melody, singerDo: number, alwaysMyDo: boolean, rand: () => number): Key {
  if (alwaysMyDo) {
    return keyForDo(singerDo);
  }

  const keys = fittingKeys(melody, singerDo);

  if (keys.length === 0) {
    return keyForDo(singerDo);
  }

  const r = rand();
  return keys[Math.floor(r * keys.length)];
}

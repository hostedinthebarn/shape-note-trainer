import type { Clef, Key, Letter } from "../types.ts";

export const NOTE_WIDTH: Readonly<Record<string, number>> = { "0.5": 2, "1": 3, "1.5": 3.5, "2": 4, "3": 5, "4": 6 };

export function yOf(p: number): number {
  return 4 - p / 2;
}

export function staffPosition(step: number, key: Key, clef: Clef): number {
  const LETTERS: readonly Letter[] = ["C", "D", "E", "F", "G", "A", "B"];
  const diatonicDo = LETTERS.indexOf(key.tonic) + 7 * (Math.floor((key.doMidi - key.accidental) / 12) - 1);
  const bottom = clef === "treble" ? 30 : 18;
  return diatonicDo + step - bottom;
}

export function keySignature(key: Key, clef: Clef): number[] {
  const sharpsTreble = [8, 5, 9, 6, 3, 7, 4];
  const flatsTreble = [4, 7, 3, 6, 2, 5, 1];
  let positions: number[];
  if (key.sharps > 0) {
    positions = sharpsTreble.slice(0, key.sharps);
  } else if (key.flats > 0) {
    positions = flatsTreble.slice(0, key.flats);
  } else {
    positions = [];
  }
  if (clef === "bass") {
    return positions.map((p) => p - 2);
  }
  return positions;
}

export function splitBars(rhythm: readonly number[]): number[][] {
  const bars: number[][] = [];
  let current: number[] = [];
  let sum = 0;

  for (let i = 0; i < rhythm.length; i++) {
    const dur = rhythm[i];
    const key = String(dur);
    if (!(key in NOTE_WIDTH)) {
      throw new RangeError(`Invalid duration: ${dur}`);
    }
    if (sum + dur > 4) {
      throw new RangeError(`Note ${i} would exceed bar limit`);
    }
    current.push(i);
    sum += dur;
    if (sum === 4) {
      bars.push(current);
      current = [];
      sum = 0;
    }
  }

  if (current.length > 0) {
    throw new RangeError("Last bar is incomplete");
  }

  return bars;
}

export function breakSystems(barWidths: readonly number[], start: number, gap: number, maxWidth: number): number[][] {
  if (barWidths.length === 0) {
    return [];
  }

  const systems: number[][] = [];
  let current: number[] = [];
  let currentWidth = 0;

  for (let i = 0; i < barWidths.length; i++) {
    if (current.length === 0) {
      // First bar of a system always goes in
      current.push(i);
      currentWidth = start + barWidths[i];
    } else {
      const newWidth = currentWidth + gap + barWidths[i];
      if (newWidth <= maxWidth) {
        current.push(i);
        currentWidth = newWidth;
      } else {
        systems.push(current);
        current = [i];
        currentWidth = start + barWidths[i];
      }
    }
  }

  if (current.length > 0) {
    systems.push(current);
  }

  return systems;
}

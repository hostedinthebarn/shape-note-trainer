                                                               
import { DEGREES, MAJOR_SEMITONES } from "./degree-types.js";

/** The nearest major-scale degree to `hz`, given the frequency of do.
 *
 *  Method (twelve-tone equal temperament):
 *  1. s = 12 * log2(hz / doHz), the signed distance from do in (fractional) semitones.
 *  2. Every scale tone has a semitone position p = 12 * octave + MAJOR_SEMITONES[index],
 *     for any integer octave (negative too). Pick the scale tone with the smallest |s - p|.
 *     If two are exactly equally near (a chromatic note between two whole-tone degrees),
 *     pick the lower one.
 *  3. cents = 100 * (s - p). It is always within [-100, +100], and within [-50, +50]
 *     when the nearest neighbours are a semitone apart (mi/fa, ti/do).
 *
 *  Throws RangeError if hz or doHz is not a finite number > 0. */
export function hzToDegree(hz        , doHz        )                {
  if (!Number.isFinite(hz) || hz <= 0) {
    throw new RangeError("hz must be a finite number > 0");
  }
  if (!Number.isFinite(doHz) || doHz <= 0) {
    throw new RangeError("doHz must be a finite number > 0");
  }

  const s = 12 * Math.log2(hz / doHz);
  let bestDistance = Infinity;
  let bestDegreeIndex = 0;
  let bestOctave = 0;

  for (let octave = -10; octave <= 10; octave++) {
    for (let i = 0; i < 7; i++) {
      const p = 12 * octave + MAJOR_SEMITONES[i];
      const distance = Math.abs(s - p);
      if (distance < bestDistance || (distance === bestDistance && i < bestDegreeIndex)) {
        bestDistance = distance;
        bestDegreeIndex = i;
        bestOctave = octave;
      }
    }
  }

  const p = 12 * bestOctave + MAJOR_SEMITONES[bestDegreeIndex];
  const cents = 100 * (s - p);

  return {
    degree: DEGREES[bestDegreeIndex],
    index: bestDegreeIndex,
    octave: bestOctave,
    cents
  };
}

/** Frequency of `degree` in `octave` (0 = the octave starting on do), given do's frequency.
 *  hz = doHz * 2 ** ((12 * octave + MAJOR_SEMITONES[index]) / 12).
 *  Throws RangeError if doHz is not a finite number > 0, octave is not an integer,
 *  or degree is not one of the seven degrees. */
export function degreeToHz(degree        , octave        , doHz        )         {
  if (!Number.isFinite(doHz) || doHz <= 0) {
    throw new RangeError("doHz must be a finite number > 0");
  }
  if (!Number.isInteger(octave)) {
    throw new RangeError("octave must be an integer");
  }
  const index = DEGREES.indexOf(degree);
  if (index === -1) {
    throw new RangeError("degree must be one of the seven degrees");
  }

  const semitones = 12 * octave + MAJOR_SEMITONES[index];
  return doHz * Math.pow(2, semitones / 12);
}

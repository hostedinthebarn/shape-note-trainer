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
    newH.window = [];
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

export interface PitchReading {
  /** Fundamental frequency in Hz. */
  hz: number;
  /** Height of the chosen NSDF peak after interpolation, 0..1 (1 = perfectly periodic). */
  clarity: number;
}

export const MIN_HZ = 65;        // lowest pitch searched
export const MAX_HZ = 1200;      // highest pitch searched
export const K = 0.9;            // peak-picking constant
export const CLARITY_GATE = 0.8; // below this clarity, return null
export const RMS_FLOOR = 0.001;  // below this RMS level, return null (silence)

/** The NSDF of the window, one value per lag tau = 0 .. W-1 (W = x.length):
 *    r(tau) = sum over j = 0 .. W-1-tau of x[j] * x[j+tau]
 *    m(tau) = sum over j = 0 .. W-1-tau of (x[j]^2 + x[j+tau]^2)
 *    nsdf[tau] = 2 * r(tau) / m(tau), or 0 where m(tau) is 0.
 *  Values lie in [-1, 1]; nsdf[0] is 1 for any non-silent window. */
export function nsdf(x: Float32Array): Float64Array {
  const W = x.length;
  const n = new Float64Array(W);
  
  // Compute the NSDF values
  for (let tau = 0; tau < W; tau++) {
    let r = 0.0;
    let m = 0.0;
    
    for (let j = 0; j < W - tau; j++) {
      const xj = x[j];
      const xjtau = x[j + tau];
      r += xj * xjtau;
      m += xj * xj + xjtau * xjtau;
    }
    
    if (m > 0) {
      n[tau] = 2 * r / m;
    } else {
      n[tau] = 0;
    }
  }
  
  return n;
}

/** Detect the pitch of one window. `clarityGate` is the clarity cut-off (step 7); each voice part
 *  has its own (the bass is 0.7), and it defaults to CLARITY_GATE.
 *  Throws RangeError if sampleRate is not a finite number > 0, or clarityGate is not a finite
 *  number from 0 to 1 inclusive. */
export function detectPitch(samples: Float32Array, sampleRate: number, clarityGate?: number): PitchReading | null {
  // Validate sample rate
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError("sampleRate must be a finite number > 0");
  }
  
  // Set default clarity gate
  if (clarityGate === undefined) {
    clarityGate = CLARITY_GATE;
  } else {
    if (!Number.isFinite(clarityGate) || clarityGate < 0 || clarityGate > 1) {
      throw new RangeError("clarityGate must be a finite number from 0 to 1 inclusive");
    }
  }
  
  // Compute RMS
  let sum = 0.0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sum / samples.length);
  
  // Check for silence
  if (rms < RMS_FLOOR) {
    return null;
  }
  
  // Compute NSDF
  const n = nsdf(samples);
  
  // Find key maxima
  const keyMaxima: { lag: number; value: number }[] = [];
  let inPositiveRegion = false;
  let regionStart = 0;
  let maxInRegion = -Infinity;
  let maxLagInRegion = 0;
  
  for (let tau = 1; tau < n.length; tau++) {
    if (!inPositiveRegion && n[tau] > 0) {
      // Start of positive region
      inPositiveRegion = true;
      regionStart = tau;
      maxInRegion = -Infinity;
      maxLagInRegion = 0;
    } else if (inPositiveRegion && n[tau] <= 0) {
      // End of positive region
      inPositiveRegion = false;
      if (maxInRegion !== -Infinity) {
        keyMaxima.push({ lag: maxLagInRegion, value: maxInRegion });
      }
    } else if (inPositiveRegion && n[tau] > maxInRegion) {
      // Update maximum in current region
      maxInRegion = n[tau];
      maxLagInRegion = tau;
    }
  }
  
  // Handle case where positive region extends to end of array
  if (inPositiveRegion && maxInRegion !== -Infinity) {
    keyMaxima.push({ lag: maxLagInRegion, value: maxInRegion });
  }
  
  // Filter by lag range
  const minLag = Math.ceil(sampleRate / MAX_HZ);
  const maxLag = Math.floor(sampleRate / MIN_HZ);
  
  const filteredMaxima = keyMaxima.filter(m => m.lag >= minLag && m.lag <= maxLag);
  
  if (filteredMaxima.length === 0) {
    return null;
  }
  
  // Find the highest NSDF value among remaining key maxima
  let nMax = -Infinity;
  for (const m of filteredMaxima) {
    if (m.value > nMax) {
      nMax = m.value;
    }
  }
  
  // Choose first key maximum that meets the K threshold
  let chosenLag: number | null = null;
  for (const m of filteredMaxima) {
    if (m.value >= K * nMax) {
      chosenLag = m.lag;
      break;
    }
  }
  
  if (chosenLag === null) {
    return null;
  }
  
  // Refine the lag using parabolic interpolation
  const t = chosenLag;
  const a = n[t - 1];
  const b = n[t];
  const c = n[t + 1];
  
  let tau: number;
  let clarity: number;
  
  // Check for zero denominator
  const denom = a - 2 * b + c;
  if (Math.abs(denom) < 1e-15) {
    // Skip refinement, use the original lag
    tau = t;
    clarity = b;
  } else {
    const delta = 0.5 * (a - c) / denom;
    tau = t + delta;
    clarity = b - 0.25 * (a - c) * delta;
    
    // Clamp clarity to at most 1
    if (clarity > 1) {
      clarity = 1;
    }
  }
  
  // Apply clarity gate
  if (clarity < clarityGate) {
    return null;
  }
  
  const hz = sampleRate / tau;
  
  return { hz, clarity };
}

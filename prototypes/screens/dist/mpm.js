                               
                                     
             
                                                                                           
                  
 

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
export function nsdf(x              )               {
  const W = x.length;
  const n = new Float64Array(W);
  
  // Compute the sum of squares for each lag
  const m = new Float64Array(W);
  for (let tau = 0; tau < W; tau++) {
    let sum = 0;
    for (let j = 0; j < W - tau; j++) {
      sum += x[j] * x[j] + x[j + tau] * x[j + tau];
    }
    m[tau] = sum;
  }
  
  // Compute the cross-correlation for each lag
  const r = new Float64Array(W);
  for (let tau = 0; tau < W; tau++) {
    let sum = 0;
    for (let j = 0; j < W - tau; j++) {
      sum += x[j] * x[j + tau];
    }
    r[tau] = sum;
  }
  
  // Compute NSDF
  for (let tau = 0; tau < W; tau++) {
    if (m[tau] === 0) {
      n[tau] = 0;
    } else {
      n[tau] = 2 * r[tau] / m[tau];
    }
  }
  
  return n;
}

/** Detect the pitch of one window. Throws RangeError if sampleRate is not a finite number > 0. */
export function detectPitch(samples              , sampleRate        )                      {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError("sampleRate must be a finite number > 0");
  }
  
  // Compute RMS
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sum / samples.length);
  
  if (rms < RMS_FLOOR) {
    return null;
  }
  
  // Compute NSDF
  const n = nsdf(samples);
  
  // Find key maxima
  const keyMaxima                                   = [];
  let inPositiveRegion = false;
  let regionStart = 0;
  let regionMaxLag = 0;
  let regionMaxValue = -Infinity;
  
  for (let tau = 1; tau < n.length; tau++) {
    if (!inPositiveRegion && n[tau] > 0) {
      // Start of positive region
      inPositiveRegion = true;
      regionStart = tau;
      regionMaxLag = tau;
      regionMaxValue = n[tau];
    } else if (inPositiveRegion && n[tau] <= 0) {
      // End of positive region
      inPositiveRegion = false;
      keyMaxima.push({ lag: regionMaxLag, value: regionMaxValue });
    } else if (inPositiveRegion && n[tau] > regionMaxValue) {
      // Update maximum within current region
      regionMaxLag = tau;
      regionMaxValue = n[tau];
    }
  }
  
  // Handle case where positive region extends to end of array
  if (inPositiveRegion) {
    keyMaxima.push({ lag: regionMaxLag, value: regionMaxValue });
  }
  
  // Filter by lag range
  const minLag = Math.ceil(sampleRate / MAX_HZ);
  const maxLag = Math.floor(sampleRate / MIN_HZ);
  
  const filteredMaxima = keyMaxima.filter(m => m.lag >= minLag && m.lag <= maxLag);
  
  if (filteredMaxima.length === 0) {
    return null;
  }
  
  // Find the highest value among remaining key maxima
  let nMax = -Infinity;
  for (const m of filteredMaxima) {
    if (m.value > nMax) nMax = m.value;
  }
  
  // Choose first key maximum that meets the threshold
  let chosenLag = -1;
  let chosenValue = -Infinity;
  
  for (const m of filteredMaxima) {
    if (m.value >= K * nMax) {
      if (chosenLag === -1 || m.lag < chosenLag) {
        chosenLag = m.lag;
        chosenValue = m.value;
      }
    }
  }
  
  if (chosenLag === -1) {
    return null;
  }
  
  // Parabolic interpolation
  let tau = chosenLag;
  let clarity = chosenValue;
  
  const a = n[tau - 1];
  const b = n[tau];
  const c = n[tau + 1];
  
  const denominator = a - 2 * b + c;
  
  if (denominator !== 0) {
    const delta = 0.5 * (a - c) / denominator;
    tau += delta;
    clarity = b - 0.25 * (a - c) * delta;
  }
  
  // Clamp clarity to at most 1
  clarity = Math.min(clarity, 1);
  
  if (clarity < CLARITY_GATE) {
    return null;
  }
  
  const hz = sampleRate / tau;
  
  return { hz, clarity };
}

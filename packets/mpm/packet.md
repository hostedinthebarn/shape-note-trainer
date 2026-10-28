---
component: mpm
root: ../..
target: src/core/mpm.ts
tests: src/core/mpm.test.ts
---

# Packet: mpm-pitch

## Task

Write `src/core/mpm.ts`: a pitch detector for one singing voice (about 70–1100 Hz) using the **McLeod Pitch Method** (MPM): a normalised square difference function (NSDF) plus "key maximum" peak picking. It analyses one window of audio samples (the tests use 2048 samples at 44.1 or 48 kHz) and returns the fundamental frequency and a clarity score, or `null` when there is no clear pitch. Use the plain time-domain NSDF (no FFT).

## Interface

```ts
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
export function nsdf(x: Float32Array): Float64Array;

/** Detect the pitch of one window. `clarityGate` is the clarity cut-off (step 7); each voice part
 *  has its own (the bass is 0.7), and it defaults to CLARITY_GATE.
 *  Throws RangeError if sampleRate is not a finite number > 0, or clarityGate is not a finite
 *  number from 0 to 1 inclusive. */
export function detectPitch(samples: Float32Array, sampleRate: number, clarityGate?: number): PitchReading | null;
```

## The algorithm for `detectPitch`

1. **Silence.** If the window's RMS (`sqrt(mean(x^2))`) is below `RMS_FLOOR`, return `null`.
2. **NSDF.** Compute `n = nsdf(samples)`.
3. **Key maxima.** Scan the **whole** NSDF from lag 1 upward. A positive region starts where the NSDF crosses from `<= 0` to `> 0` and ends where it next falls to `<= 0`. The key maximum of a region is the lag with the highest NSDF value inside it. The region that starts at lag 0 (before the first negative-going crossing) is never used. A region still open when the scan reaches the end also counts.
4. **Lag range.** Keep only key maxima with lag between `sampleRate / MAX_HZ` and `sampleRate / MIN_HZ` inclusive. (Filter after scanning: don't stop the scan at the max lag, or a peak straddling the boundary is lost.) If none remain, return `null`.
5. **Pick.** Let `nMax` be the highest NSDF value among the remaining key maxima. Choose the **first** (smallest-lag) one whose value is `>= K * nMax`.
6. **Refine.** Parabolic interpolation through the chosen lag `t` and its neighbours `a = n[t-1]`, `b = n[t]`, `c = n[t+1]`: `delta = 0.5 * (a - c) / (a - 2b + c)`; refined lag `tau = t + delta`; refined height `clarity = b - 0.25 * (a - c) * delta`. Skip the refinement if the denominator is 0. Clamp clarity to at most 1.
7. **Gate.** If `clarity < clarityGate` (the parameter, default `CLARITY_GATE`), return `null`. Otherwise return `{ hz: sampleRate / tau, clarity }`.

## Test vectors

All signals are synthesised in the test file; pitch errors are measured in cents (1200 × log2(got / expected)).

| Input (2048 samples) | Expect |
|---|---|
| Pure sine at 70, 110, 220, 440, 880, 1100 Hz, at 44.1 and 48 kHz | within ±5 cents, clarity > 0.95 |
| Harmonic tone (1/h, 20 harmonics) at the same frequencies | within ±5 cents |
| Weak fundamental (h1 at 20% of h2) at 73 and 110 Hz | within ±5 cents (no octave-up error) |
| 98 Hz with a strong 3rd harmonic | within ±5 cents |
| Vibrato 5.5 Hz ±60 cents at 82, 196, 523, 1047 Hz | within ±10 cents of the window's mean pitch |
| 220 Hz harmonic tone + noise σ 0.05 | within ±10 cents |
| Sines at 65 and 1200 Hz (range edges) | found, within ±5 cents |
| Sine at 50 Hz (below range) | `null` |
| Silence, DC offset, a sine at amplitude 0.0005, white noise σ 0.3 | `null` |
| 220 Hz sine + noise σ 0.2 (clarity ≈ 0.77) | `null` by default and with gate 0.8; found with gate 0.7 |
| `clarityGate` NaN, −0.1, 1.5, Infinity | throws RangeError |
| `nsdf` of a 480 Hz sine at 48 kHz (period 100) | `n[0] = 1`, `n[100] > 0.95`, `n[50] < -0.9`; silence gives all zeros |

## Constraints

- Pure functions: no I/O, no globals that change, no console output, no randomness.
- No imports at all (no FFT library, no Node modules).
- Export exactly the two functions (with `detectPitch` taking the optional third parameter), the interface and the five constants above, with those values.
- Speed: the tests call `detectPitch` about 80 times on 2048-sample windows; an O(W²) time-domain NSDF is fine.

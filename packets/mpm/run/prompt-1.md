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

## Rules that always apply

- The file runs under Node's built-in TypeScript type stripping, so use erasable syntax only: no `enum`, no `namespace`, no constructor parameter properties, no decorators.
- Relative imports must include the `.ts` extension (e.g. `./note-types.ts`).
- No npm packages and no Node built-in modules unless the packet's constraints allow them.
- Do not change the exported names or signatures given in the interface.
- No module-level mutable state: no top-level `let` or `var`. Exported functions must give the same result for the same arguments however often or in whatever order they are called. Passing a test by remembering earlier calls is a failure.

## Tests `src/core/mpm.test.ts` (run with `node --test`; your file must make these pass)

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPitch, nsdf, MIN_HZ, MAX_HZ, K, CLARITY_GATE, RMS_FLOOR } from "./mpm.ts";

// ── Signal generators (all deterministic). Window = 2048 samples throughout.

const W = 2048;
const RATES = [44100, 48000];

/** Sum of harmonics: amps[h-1] is the amplitude of harmonic h of f0. */
function tone(f0: number, sr: number, amps: number[], n = W, phase = 0.3): Float32Array {
  const x = new Float32Array(n);
  amps.forEach((a, i) => {
    const f = f0 * (i + 1);
    if (a === 0 || f >= sr / 2) return;
    for (let j = 0; j < n; j++) x[j] += a * Math.sin(2 * Math.PI * f * (j / sr) + phase * (i + 1));
  });
  return x;
}
const sine = (f: number, sr: number, amp = 0.5) => tone(f, sr, [amp]);
/** 1/h spectrum with `count` harmonics, scaled to a peak around 0.5. */
const harmonic = (f: number, sr: number, count = 20) => tone(f, sr, Array.from({ length: count }, (_, i) => 0.2 / (i + 1)));

/** Seeded uniform PRNG (mulberry32) and approximately Gaussian noise. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function noise(sigma: number, seed: number, n = W): Float32Array {
  const r = rng(seed);
  const x = new Float32Array(n);
  for (let j = 0; j < n; j++) x[j] = sigma * (r() + r() + r() + r() + r() + r() - 3) * Math.SQRT2;
  return x;
}
const add = (a: Float32Array, b: Float32Array) => a.map((v, i) => v + b[i]);

/** Vibrato tone: f(t) = f0 * 2^((depth/1200) * sin(2 pi rate t)), starting at time t0.
 *  Returns the samples and the mean pitch over the window (geometric mean of f(t)). */
function vibrato(f0: number, sr: number, t0: number, rate = 5.5, depth = 60) {
  const x = new Float32Array(W);
  let phase = 0, logSum = 0;
  for (let j = 0; j < W; j++) {
    const t = t0 + j / sr;
    const f = f0 * 2 ** ((depth / 1200) * Math.sin(2 * Math.PI * rate * t));
    logSum += Math.log2(f);
    for (let h = 1; h <= 8; h++) if (f * h < sr / 2) x[j] += (0.2 / h) * Math.sin(h * phase);
    phase += (2 * Math.PI * f) / sr;
  }
  return { x, meanHz: 2 ** (logSum / W) };
}

const cents = (hz: number, ref: number) => 1200 * Math.log2(hz / ref);
function expectPitch(x: Float32Array, sr: number, expected: number, tol: number, what: string) {
  const r = detectPitch(x, sr);
  assert.ok(r !== null, `${what}: expected about ${expected.toFixed(2)} Hz, got null`);
  assert.ok(Number.isFinite(r.hz) && Number.isFinite(r.clarity), `${what}: non-finite result ${JSON.stringify(r)}`);
  const c = cents(r.hz, expected);
  assert.ok(Math.abs(c) <= tol, `${what}: expected ${expected.toFixed(2)} Hz, got ${r.hz.toFixed(2)} Hz (${c.toFixed(1)} cents off, tolerance ${tol})`);
  return r;
}

// ── Tests

test("constants", () => {
  assert.equal(MIN_HZ, 65);
  assert.equal(MAX_HZ, 1200);
  assert.equal(K, 0.9);
  assert.equal(CLARITY_GATE, 0.8);
  assert.equal(RMS_FLOOR, 0.001);
});

test("nsdf: shape and basic values", () => {
  const x = sine(480, 48000); // period exactly 100 samples
  const n = nsdf(x);
  assert.equal(n.length, x.length, "nsdf has one value per lag 0 .. W-1");
  assert.ok(Math.abs(n[0] - 1) < 1e-9, `nsdf[0] should be 1, got ${n[0]}`);
  assert.ok(n[100] > 0.95, `nsdf at one period (lag 100) should be near 1, got ${n[100]}`);
  assert.ok(n[50] < -0.9, `nsdf at half a period (lag 50) should be near -1, got ${n[50]}`);
  for (let t = 0; t < n.length; t++) assert.ok(n[t] >= -1 - 1e-9 && n[t] <= 1 + 1e-9, `nsdf[${t}] = ${n[t]} is outside [-1, 1]`);
  const z = nsdf(new Float32Array(W));
  assert.ok(z.every((v) => v === 0), "nsdf of silence must be all zeros (0 where m(tau) = 0), not NaN");
});

test("pure sines 70-1100 Hz at 44.1 and 48 kHz: within 5 cents, clarity > 0.95", () => {
  for (const sr of RATES) {
    for (const f of [70, 110, 220, 440, 880, 1100]) {
      const r = expectPitch(sine(f, sr), sr, f, 5, `sine ${f} Hz @ ${sr}`);
      assert.ok(r.clarity > 0.95 && r.clarity <= 1, `sine ${f} Hz @ ${sr}: clarity ${r.clarity}`);
    }
  }
});

test("harmonic-rich tones (1/h, 20 harmonics): within 5 cents", () => {
  for (const sr of RATES) {
    for (const f of [70, 110, 220, 440, 880, 1100]) expectPitch(harmonic(f, sr), sr, f, 5, `harmonic ${f} Hz @ ${sr}`);
  }
});

test("weak fundamental (h1 at 10%, like a bass voice): no octave-up error", () => {
  for (const f of [73, 110]) {
    const amps = [0.02, ...Array.from({ length: 9 }, (_, i) => 0.2 / (i + 2))];
    expectPitch(tone(f, 48000, amps), 48000, f, 5, `weak-fundamental ${f} Hz`);
  }
});

test("octave-plus-fifth trap: strong 3rd harmonic over weak 1st and 2nd at 98 Hz", () => {
  expectPitch(tone(98, 48000, [0.1, 0.1, 0.3, 0.05, 0.03]), 48000, 98, 5, "98 Hz with strong h3");
});

test("vibrato (5.5 Hz, +/-60 cents): each window within 10 cents of its mean pitch", () => {
  for (const f of [82, 196, 523, 1047]) {
    for (const t0 of [0, 0.03, 0.07, 0.11, 0.15]) {
      const { x, meanHz } = vibrato(f, 48000, t0);
      expectPitch(x, 48000, meanHz, 10, `vibrato ${f} Hz from t=${t0}s`);
    }
  }
});

test("tone plus moderate noise (sigma 0.05) is still found", () => {
  const r = expectPitch(add(harmonic(220, 48000), noise(0.05, 11)), 48000, 220, 10, "220 Hz + noise");
  assert.ok(r.clarity >= CLARITY_GATE);
});

test("range edges: 65 Hz and 1200 Hz are found", () => {
  for (const sr of RATES) {
    expectPitch(sine(65, sr), sr, 65, 5, `sine 65 Hz @ ${sr}`);
    expectPitch(sine(1200, sr), sr, 1200, 5, `sine 1200 Hz @ ${sr}`);
  }
});

test("below the range: 50 Hz returns null", () => {
  for (const sr of RATES) assert.equal(detectPitch(sine(50, sr), sr), null, `50 Hz @ ${sr} is below MIN_HZ`);
});

test("silence, DC, very quiet signals and pure noise return null", () => {
  assert.equal(detectPitch(new Float32Array(W), 48000), null, "silence");
  assert.equal(detectPitch(new Float32Array(W).fill(0.5), 48000), null, "DC offset only");
  assert.equal(detectPitch(sine(220, 48000, 0.0005), 48000), null, "RMS below RMS_FLOOR");
  for (const seed of [1, 2, 3, 4, 5]) {
    assert.equal(detectPitch(noise(0.3, seed), 48000), null, `white noise seed ${seed} (clarity must be below the gate)`);
  }
});

test("bad sample rate throws RangeError", () => {
  assert.throws(() => detectPitch(sine(220, 48000), 0), RangeError);
  assert.throws(() => detectPitch(sine(220, 48000), Number.NaN), RangeError);
});

test("clarityGate parameter: the voice part's cut-off replaces the default 0.8", () => {
  // A 220 Hz sine buried in noise sigma 0.2 has clarity about 0.77: under the default gate, over 0.7.
  const x = add(sine(220, 48000), noise(0.2, 1));
  assert.equal(detectPitch(x, 48000), null, "RULE: with no third argument the gate is CLARITY_GATE (0.8), so clarity ~0.77 returns null");
  assert.equal(detectPitch(x, 48000, 0.8), null, "RULE: detectPitch(x, sr, 0.8) behaves exactly like the default");
  const r = detectPitch(x, 48000, 0.7);
  assert.ok(r !== null, "RULE: detectPitch(x, sr, 0.7) returns a reading when clarity >= 0.7 (here about 0.77)");
  assert.ok(Math.abs(cents(r.hz, 220)) < 20, `gate 0.7: expected about 220 Hz, got ${r.hz}`);
  assert.ok(r.clarity >= 0.7 && r.clarity < 0.8, `gate 0.7: clarity should be between 0.7 and 0.8, got ${r.clarity}`);
  // Calls in a different order give the same answers (no state between calls).
  assert.equal(detectPitch(x, 48000), null, "RULE: a previous call with a lower gate must not change the default");
  assert.deepEqual(detectPitch(x, 48000, 0.7), r, "RULE: the same input gives the same reading every time");
  // A clean tone passes any gate up to its clarity.
  expectPitch(sine(440, 48000), 48000, 440, 5, "440 Hz with default gate");
  assert.ok(detectPitch(sine(440, 48000), 48000, 0.95) !== null, "RULE: a pure sine (clarity > 0.95) passes gate 0.95");
});

test("clarityGate must be a number from 0 to 1", () => {
  const x = sine(220, 48000);
  for (const g of [NaN, -0.1, 1.5, Infinity]) assert.throws(() => detectPitch(x, 48000, g), RangeError, `RULE: clarityGate ${g} is outside 0..1 and must throw RangeError`);
  assert.ok(detectPitch(x, 48000, 0) !== null, "RULE: clarityGate 0 is allowed");
});
```

Write `src/core/mpm.ts` now. Reply with exactly one ```ts block containing the whole file.
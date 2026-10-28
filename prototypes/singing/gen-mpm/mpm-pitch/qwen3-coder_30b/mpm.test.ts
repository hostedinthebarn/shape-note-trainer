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

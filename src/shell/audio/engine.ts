// Audio engine (SW-49, written by Claude from the SW-37 prototype).
// One AudioContext, one mic stream, a worklet tap feeding the detector worker, and a tone player.
// Everything it reports is a ScoringEvent on the audio clock (ms), merged into time order.
//
// The SW-37 lessons, each handled here:
// - iOS replays a burst of sound when the mic opens unless the audio session is
//   play-and-record before the first tone: set in start(), before anything plays.
// - The home-screen app asks for the mic on every launch: openMic() is called once, up front,
//   from the mic screen, never mid-exercise.
// - An open mic hears the tone: tones emit toneStart/toneEnd so scoring gates those readings.
// - A second tap while getUserMedia is pending must not open a second mic: callers share one promise.
// - Gary, 2026-11-04: don't hold the mic and the phone's audio for the whole visit. The app calls
//   release() whenever it leaves an exercise or goes to the background; the next exercise starts
//   everything again from a tap. release() also hands the audio session back to the system.
import type { ScoringEvent } from "../../types.ts";
import { createMerger } from "./merge.ts";
import type { Merger } from "./merge.ts";

/** Each tone's length in seconds (SW-49). */
export const TONE_S = 0.9;
/** Lead time before a tone starts, so scheduling never lands in the past. */
const LEAD_S = 0.05;
const ATTACK_S = 0.03;
const RELEASE_S = 0.12;
const VOLUME = 0.35;

export interface EngineOptions {
  /** Base URL of the built shell/audio folder, e.g. new URL("./audio/", import.meta.url). */
  base: URL;
  /** Clarity cut-off for the current voice part (VOICE_PARTS[id].clarityGate). */
  clarityGate: number;
  /** Receives every event in time order. */
  onEvent: (e: ScoringEvent) => void;
}

interface AudioSessionNav { audioSession?: { type: string } }

export class AudioEngine {
  ctx: AudioContext | null = null;
  stream: MediaStream | null = null;
  private tap: AudioWorkletNode | null = null;
  private worker: Worker | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private wave: PeriodicWave | null = null;
  private starting: Promise<void> | null = null;
  private opening: Promise<void> | null = null;
  private merger!: Merger;
  private timer: ReturnType<typeof setInterval> | null = null;
  private opts: EngineOptions;

  constructor(opts: EngineOptions) {
    this.opts = opts;
  }

  /** The audio clock in ms (the clock every event uses). */
  now(): number {
    return this.ctx ? this.ctx.currentTime * 1000 : 0;
  }

  /** Set up the audio graph. Must be called from a tap (user gesture). Safe to call twice. */
  start(): Promise<void> {
    this.starting ??= this.setup().catch((e) => { this.starting = null; throw e; });
    return this.starting;
  }

  private async setup(): Promise<void> {
    const nav = navigator as Navigator & AudioSessionNav;
    if (nav.audioSession) nav.audioSession.type = "play-and-record";
    const ctx = new AudioContext({ latencyHint: "interactive" });
    this.ctx = ctx;
    // A fresh context restarts the audio clock at 0, so events are merged afresh too.
    this.merger = createMerger(this.opts.onEvent);
    await ctx.audioWorklet.addModule(new URL("tap-worklet.js", this.opts.base));
    const tap = new AudioWorkletNode(ctx, "tap", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: "explicit" });
    // The tap must reach the destination to be pulled, but silently.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    tap.connect(sink).connect(ctx.destination);
    this.tap = tap;

    const worker = new Worker(new URL("detector-worker.js", this.opts.base), { type: "module" });
    worker.onmessage = ({ data }) => this.merger.reading({ type: "reading", t: data.t, hz: data.hz });
    const ch = new MessageChannel();
    tap.port.postMessage({ port: ch.port1 }, [ch.port1]);
    worker.postMessage({ port: ch.port2, gate: this.opts.clarityGate }, [ch.port2]);
    this.worker = worker;

    // Harmonics 1/h so a low do (G2 and below) survives a phone speaker.
    const n = 8, real = new Float32Array(n), imag = new Float32Array(n);
    for (let h = 1; h < n; h++) imag[h] = 1 / h;
    this.wave = ctx.createPeriodicWave(real, imag);

    // Tone events must still be released when no readings arrive (mic closed).
    this.timer = setInterval(() => this.merger.flush(this.now()), 50);
    await ctx.resume();
  }

  /** True while the mic is open. */
  get listening(): boolean {
    return !!this.stream;
  }

  /** Ask for the mic and connect it. Call once, up front; a second call joins the first. */
  openMic(): Promise<void> {
    if (this.stream) return Promise.resolve();
    this.opening ??= this.connectMic().finally(() => { this.opening = null; });
    return this.opening;
  }

  private async connectMic(): Promise<void> {
    await this.start();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.stream = stream;
    this.source = this.ctx!.createMediaStreamSource(stream);
    this.tap!.port.postMessage({ reset: true });
    this.source.connect(this.tap!);
  }

  /** Change the clarity cut-off (when the voice part changes). */
  setClarityGate(gate: number): void {
    this.opts.clarityGate = gate;
    this.worker?.postMessage({ gate });
  }

  /** Play one or more tones back to back (an arpeggio is several). Emits toneStart at the first
   *  tone's start and toneEnd at the last one's end, on the audio clock. Resolves after toneEnd. */
  async play(freqs: number | number[], each = TONE_S): Promise<void> {
    await this.start();
    const ctx = this.ctx!;
    const list = Array.isArray(freqs) ? freqs : [freqs];
    const out = ctx.createGain();
    out.gain.value = VOLUME;
    out.connect(ctx.destination);
    const t0 = ctx.currentTime + LEAD_S;
    let t = t0;
    for (const f of list) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.setPeriodicWave(this.wave!);
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + ATTACK_S);
      g.gain.setValueAtTime(1, t + each - RELEASE_S);
      g.gain.linearRampToValueAtTime(0, t + each);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + each + 0.02);
      t += each;
    }
    this.merger.tone({ type: "toneStart", t: t0 * 1000 });
    this.merger.tone({ type: "toneEnd", t: t * 1000 });
    await new Promise((res) => setTimeout(res, (t - ctx.currentTime) * 1000 + 20));
    out.disconnect();
  }

  /** A hint or skip from the UI, stamped on the audio clock and merged in order. */
  ui(type: "hint" | "skip"): void {
    this.merger?.other({ type, t: this.now() });
  }

  /** Close the mic (end of session). The context stays for tones. */
  closeMic(): void {
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.source = null;
  }

  /** Let go of everything: the mic, the audio context (so the speaker and the audio session are
   *  free for other apps) and the detector worker. Safe to call at any time and more than once;
   *  start() or openMic() builds it all again. */
  async release(): Promise<void> {
    const ctx = this.ctx;
    this.closeMic();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.tap?.disconnect();
    this.tap = null;
    this.worker?.terminate();
    this.worker = null;
    this.wave = null;
    this.ctx = null;
    this.starting = null;
    this.opening = null;
    const nav = navigator as Navigator & AudioSessionNav;
    if (nav.audioSession) nav.audioSession.type = "auto";
    if (ctx && ctx.state !== "closed") await ctx.close().catch(() => {});
  }

  /** Tear everything down (same as release). */
  dispose(): Promise<void> {
    return this.release();
  }
}

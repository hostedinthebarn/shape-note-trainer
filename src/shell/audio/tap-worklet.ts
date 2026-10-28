// AudioWorklet tap (SW-49, from the SW-37 prototype). Keeps the last WINDOW mic samples and,
// every HOP samples, hands a copy to the detector worker over a MessagePort, stamped with the
// audio frame at the window's end. Runs on the audio thread: no allocation beyond the copy.
const WINDOW = 2048;
const HOP = 512;

declare const currentFrame: number;
declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

class Tap extends AudioWorkletProcessor {
  buf = new Float32Array(WINDOW);
  filled = 0;
  sinceHop = 0;
  out: MessagePort | null = null;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      if (e.data.port) this.out = e.data.port;
      if (e.data.reset) { this.filled = 0; this.sinceHop = 0; }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const ch = inputs[0] && inputs[0][0];
    if (!ch || !this.out) return true;
    const n = ch.length;
    this.buf.copyWithin(0, n);
    this.buf.set(ch, WINDOW - n);
    this.filled = Math.min(WINDOW, this.filled + n);
    this.sinceHop += n;
    if (this.filled >= WINDOW && this.sinceHop >= HOP) {
      this.sinceHop = 0;
      const w = this.buf.slice();
      this.out.postMessage({ w, frame: currentFrame + n, sr: sampleRate }, [w.buffer]);
    }
    return true;
  }
}

registerProcessor("tap", Tap);

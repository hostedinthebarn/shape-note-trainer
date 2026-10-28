// PROTOTYPE (SW-37): AudioWorklet tap. Keeps the last 2048 mic samples and, every
// `hop` samples, hands a copy to the detector worker over a MessagePort.
class Tap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.W = 2048;
    this.hop = 512;
    this.buf = new Float32Array(this.W);
    this.filled = 0;
    this.sinceHop = 0;
    this.lastFrame = -1;
    this.gaps = 0;
    this.out = null;
    this.port.onmessage = (e) => {
      if (e.data.port) this.out = e.data.port;
      if (e.data.hop) this.hop = e.data.hop;
      if (e.data.reset) { this.filled = 0; this.sinceHop = 0; this.lastFrame = -1; }
    };
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch || !this.out) return true;
    const n = ch.length;
    // A jump in the frame counter means blocks never reached us (WebKit bug 244203).
    if (this.lastFrame >= 0 && currentFrame !== this.lastFrame + n) this.gaps++;
    this.lastFrame = currentFrame;
    this.buf.copyWithin(0, n);
    this.buf.set(ch, this.W - n);
    this.filled = Math.min(this.W, this.filled + n);
    this.sinceHop += n;
    if (this.filled >= this.W && this.sinceHop >= this.hop) {
      this.sinceHop = 0;
      const w = this.buf.slice();
      this.out.postMessage({ w, frame: currentFrame + n, sr: sampleRate, gaps: this.gaps }, [w.buffer]);
    }
    return true;
  }
}
registerProcessor("tap", Tap);

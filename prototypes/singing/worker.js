// PROTOTYPE (SW-37): runs the qwen-written MPM detector off the main thread.
import { detectPitch } from "./dist/mpm.js";

onmessage = (e) => {
  if (!e.data.port) return;
  e.data.port.onmessage = ({ data }) => {
    const { w, frame, sr, gaps } = data;
    let sum = 0;
    for (let i = 0; i < w.length; i++) sum += w[i] * w[i];
    const t0 = performance.now();
    let r = null;
    try { r = detectPitch(w, sr); } catch (err) { r = null; }
    postMessage({ r, frame, sr, gaps, ms: performance.now() - t0, rms: Math.sqrt(sum / w.length) });
  };
};

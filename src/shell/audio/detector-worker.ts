// Detector worker (SW-49): runs the local-model MPM detector off the main thread. Windows come
// straight from the worklet over a MessagePort; results go back to the page as readings on the
// audio clock (ms), with the voice part's clarity cut-off applied.
import { detectPitch, CLARITY_GATE } from "../../core/mpm.ts";

let gate = CLARITY_GATE;

onmessage = (e: MessageEvent) => {
  if (typeof e.data.gate === "number") gate = e.data.gate;
  if (!e.data.port) return;
  (e.data.port as MessagePort).onmessage = ({ data }) => {
    const { w, frame, sr } = data as { w: Float32Array; frame: number; sr: number };
    let r = null;
    try { r = detectPitch(w, sr, gate); } catch { r = null; }
    postMessage({ t: (frame / sr) * 1000, hz: r ? r.hz : null, clarity: r ? r.clarity : 0 });
  };
};

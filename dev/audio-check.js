// Dev-only check page for SW-49: real AudioEngine -> real scoring reducer, on a phone.
import { AudioEngine } from "/js/shell/audio/engine.js";
import { init, step, view } from "/js/core/scoring.js";
import { degreeToHz } from "/js/core/degree.js";
import { DEGREES, VOICE_PARTS } from "/js/types.js";

const $ = (id) => document.getElementById(id);
const STEPS = [0, 1, 2, 1, 0];
const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
for (let m = 43; m <= 72; m++) $("do").add(new Option(`${NAMES[m % 12]}${Math.floor(m / 12) - 1}`, m));
$("do").value = String(VOICE_PARTS.T.defaultDoMidi);
const doHz = () => midiHz(+$("do").value);

const lines = [];
const log = (s) => { lines.unshift(s); lines.length = Math.min(lines.length, 60); $("log").textContent = lines.join("\n"); };
addEventListener("error", (e) => log(`ERROR ${e.message} @ ${e.filename?.split("/").pop()}:${e.lineno}`));
addEventListener("unhandledrejection", (e) => log(`ERROR ${e.reason?.message ?? e.reason}`));

let state = null;
let counts = { reading: 0, voiced: 0 };
const engine = new AudioEngine({
  base: new URL("/js/shell/audio/", location.href),
  clarityGate: VOICE_PARTS.T.clarityGate,
  onEvent(e) {
    if (e.type === "reading") { counts.reading++; if (e.hz) counts.voiced++; }
    else log(`${(e.t / 1000).toFixed(2)}s ${e.type}`);
    if (!state) return;
    const before = view(state).results.length;
    state = step(state, e);
    const v = view(state);
    if (v.results.length > before) {
      const r = v.results.at(-1);
      log(`note ${before + 1}: ${r.outcome}${r.cents !== null ? ` ${r.cents.toFixed(0)}c, settled ${(r.settleMs / 1000).toFixed(1)}s` : ""}`);
    }
  },
});

function render() {
  if (state) {
    const v = view(state);
    $("big").textContent = v.done ? "Done" : DEGREES[((STEPS[v.noteIndex] % 7) + 7) % 7];
    $("status").textContent = v.done
      ? `${v.results.filter((r) => r.outcome === "unaided").length} of ${STEPS.length} unaided`
      : `${v.status}${v.cents !== null ? ` ${v.cents > 0 ? "+" : ""}${v.cents.toFixed(0)}c` : ""}${v.singing ? ` (you're on ${v.singing})` : ""}${v.hintOffered ? " · hint offered" : ""}`;
  }
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
setInterval(() => { if (engine.ctx) log(`readings/s ${counts.reading} (voiced ${counts.voiced}) · ctx ${engine.ctx.state} · session ${navigator.audioSession?.type ?? "n/a"}`); counts = { reading: 0, voiced: 0 }; }, 5000);

$("mic").onclick = async () => {
  $("mic").disabled = true;
  try {
    // Deliberately double-tapped: the second call must join the first, not open a second mic.
    await Promise.all([engine.openMic(), engine.openMic()]);
    log(`mic open · ${engine.ctx.sampleRate} Hz · tracks ${engine.stream.getAudioTracks().length}`);
    for (const id of ["give", "hint", "skip"]) $(id).disabled = false;
  } catch (e) {
    $("mic").disabled = false;
    log(`mic failed: ${e.name} ${e.message}`);
  }
};
$("give").onclick = async () => {
  state = init({ steps: STEPS, doHz: doHz(), strict: false }, engine.now());
  log(`--- new attempt, do ${$("do").selectedOptions[0].text} (${doHz().toFixed(1)} Hz)`);
  await engine.play(doHz());
};
$("hint").onclick = async () => {
  if (!state) return;
  const v = view(state);
  if (v.done) return;
  const s = STEPS[v.noteIndex];
  engine.ui("hint");
  await engine.play(degreeToHz(DEGREES[((s % 7) + 7) % 7], Math.floor(s / 7), doHz()));
};
$("skip").onclick = () => engine.ui("skip");

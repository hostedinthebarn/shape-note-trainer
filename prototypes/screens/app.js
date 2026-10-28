// PROTOTYPE (SW-38, throwaway): the v1 flow with three variants of the exercise screen.
// Exercises come from the qwen-written generator; scoring follows the SW-39 rules roughly
// (hand-written here, not the real packet). Input is the real mic or a fake slider.
import { generateExercise } from "./dist/generator.js";
import { LEVELS } from "./dist/level-types.js";
import { mulberry32 } from "./dist/prng.js";
import { hzToDegree } from "./dist/degree.js";
import { VOICES, renderStaff, posOf, degName, shapeSvg } from "./staff.js";

const $ = (s) => document.querySelector(s);
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];
const LEVEL_TEXT = [
  "do, re, mi: steps only", "do up to sol: steps", "the whole octave: steps", "do, mi, sol, do: chord leaps",
  "thirds", "below do, half notes", "wider leaps", "dotted rhythms",
];
const VARIANTS = { A: "Staff + meter", B: "Scrolling staff", C: "Shape ladder", D: "Ladder early, staff later" };
// D: ladder (C) for levels 1–4, scrolling staff (B) for 5–8, with a switch on the screen.
// Key of do, overridable in settings: [pitch class, letter index, sharps, flats]
const KEYS = { C: [0, 0, 0, 0], D: [2, 1, 2, 0], "E♭": [3, 2, 0, 3], E: [4, 2, 4, 0], F: [5, 3, 0, 1], G: [7, 4, 1, 0], "A♭": [8, 5, 0, 4], A: [9, 5, 3, 0], "B♭": [10, 6, 0, 2] };
const midiOf = (hz) => Math.round(69 + 12 * Math.log2(hz / 440));
function keyVoice(base, name, octave) {
  const [pc, letter, sharps, flats] = KEYS[name], midi = 12 * (octave + 1) + pc;
  return { ...base, keyName: `${name}${octave}`, doDn: octave * 7 + letter, doHz: 440 * 2 ** ((midi - 69) / 12), sharps, flats, midi };
}
function keyChoices(base) {
  const m0 = midiOf(base.doHz), out = [];
  for (const name of Object.keys(KEYS)) for (let o = 1; o <= 5; o++) { const k = keyVoice(base, name, o); if (k.midi >= m0 - 5 && k.midi <= m0 + 9) out.push([name, o, k.midi]); }
  return out.sort((a, b) => a[2] - b[2]);
}
const V = () => (S.doKey ? keyVoice(VOICES[S.voice], ...S.doKey) : { ...VOICES[S.voice], keyName: `${VOICES[S.voice].keyName}${Math.floor(midiOf(VOICES[S.voice].doHz) / 12) - 1}` });
const view = () => (S.variant !== "D" ? S.variant : S.ex?.view ?? (S.ex && S.ex.level <= 4 ? "C" : "B"));

const S = {
  screen: "welcome", voice: null, strict: false, input: "mic", micOk: false,
  variant: new URLSearchParams(location.search).get("variant") || "A",
  streak: {}, best: {}, suggested: 1, ex: null, last: null, events: [],
};
const log = (m) => { S.events.push(`${new Date().toISOString().slice(11, 19)} ${m}`); if (S.events.length > 200) S.events.shift(); };

// ---------- audio ----------
let ctx, tap, worker, stream;
let toneGateUntil = 0, tonePlaying = false;
async function ensureAudio() {
  if (ctx) return;
  if (navigator.audioSession) navigator.audioSession.type = "play-and-record"; // SW-37
  ctx = new AudioContext({ latencyHint: "interactive" });
  await ctx.audioWorklet.addModule("/worklet.js");
  tap = new AudioWorkletNode(ctx, "tap", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: "explicit" });
  const sink = ctx.createGain(); sink.gain.value = 0; tap.connect(sink).connect(ctx.destination);
  worker = new Worker("/worker.js", { type: "module" });
  worker.onmessage = ({ data }) => { if (S.input === "mic") onReading(performance.now(), data.r ? data.r.hz : null); };
  const ch = new MessageChannel();
  tap.port.postMessage({ port: ch.port1, hop: 512 }, [ch.port1]);
  worker.postMessage({ port: ch.port2 }, [ch.port2]);
  await ctx.resume();
}
async function openMic() {
  await ensureAudio();
  if (stream) return;
  stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  ctx.createMediaStreamSource(stream).connect(tap);
  S.micOk = true;
  log("mic open");
}
function playTones(freqs, each = 0.9) {
  const real = new Float32Array(8), imag = new Float32Array(8);
  for (let h = 1; h < 8; h++) imag[h] = 1 / h;
  const wave = ctx.createPeriodicWave(real, imag);
  const out = ctx.createGain(); out.gain.value = 0.35; out.connect(ctx.destination);
  let t = ctx.currentTime + 0.05;
  for (const f of freqs) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.setPeriodicWave(wave); o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.03);
    g.gain.setValueAtTime(1, t + each - 0.12); g.gain.linearRampToValueAtTime(0, t + each);
    o.connect(g).connect(out); o.start(t); o.stop(t + each + 0.02);
    t += each;
  }
  const ms = (t - ctx.currentTime) * 1000 + 30;
  tonePlaying = true;
  toneGateUntil = Infinity;
  return new Promise((res) => setTimeout(() => { tonePlaying = false; toneGateUntil = performance.now() + 150; res(); }, ms));
}

// ---------- fake voice ----------
const fake = { semis: 0, silent: true };
setInterval(() => {
  if (S.input !== "fake") return;
  const v = S.voice && V();
  if (!v) return;
  const wobble = (Math.random() - 0.5) * 0.08;
  onReading(performance.now(), fake.silent ? null : v.doHz * 2 ** ((fake.semis + wobble) / 12));
}, 20);

// ---------- scoring (rough SW-39) ----------
const semisOf = (deg) => 12 * Math.floor(deg / 7) + MAJOR[((deg % 7) + 7) % 7];
const fold = (c) => ((((c + 600) % 1200) + 1200) % 1200) - 600;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
/** Fractional scale position (0 = do, 7 = do above) of a sung frequency. */
function fracPos(hz, doHz) {
  const s = 12 * Math.log2(hz / doHz), o = Math.floor(s / 12), r = s - 12 * o;
  let k = 0; while (k < 6 && MAJOR[k + 1] <= r) k++;
  return 7 * o + k + (r - MAJOR[k]) / (MAJOR[k + 1] - MAJOR[k]);
}

function newExercise(level) {
  const seed = (Math.random() * 2 ** 32) >>> 0;
  const e = generateExercise(LEVELS[level - 1], mulberry32(seed));
  S.ex = {
    level, seed, phase: "intro",
    notes: e.degrees.map((deg, i) => ({ deg, dur: e.rhythm[i], result: null, cents: null, settleMs: null })),
    i: 0, live: { state: "listening", cents: null, hz: null },
    trace: [],
  };
  resetNote();
  log(`exercise L${level} seed ${seed}: ${e.degrees.join(" ")}`);
}
function resetNote() {
  Object.assign(S.ex, { noteClock: 0, hold: 0, holdStartClock: null, holdCents: [], win: [], lastT: null, lastVoicedT: -1e9, hintShown: false, hintUsed: false });
}
function target() { return S.ex.notes[S.ex.i]; }
function onReading(t, hz) {
  const ex = S.ex;
  if (!ex || ex.phase !== "sing" || S.screen !== "exercise") return;
  const v = V();
  const dt = ex.lastT == null ? 0 : Math.min(t - ex.lastT, 100);
  ex.lastT = t;
  if (hz) ex.trace.push({ t, p: fracPos(hz, v.doHz) });
  while (ex.trace.length && ex.trace[0].t < t - 4000) ex.trace.shift();
  if (tonePlaying || t < toneGateUntil) return; // clocks pause, readings ignored
  ex.noteClock += dt;
  if (!ex.hintShown && ex.noteClock >= 8000) { ex.hintShown = true; renderActions(); }
  const live = ex.live;
  if (!hz) {
    if (t - ex.lastVoicedT > 100) { ex.hold = 0; ex.holdStartClock = null; ex.holdCents = []; ex.win = []; live.state = "listening"; live.hz = null; }
    return;
  }
  ex.lastVoicedT = t;
  const tg = target();
  const e = fold(1200 * Math.log2(hz / v.doHz) - 100 * semisOf(tg.deg));
  ex.win.push({ t, e });
  while (ex.win[0].t < t - 200) ex.win.shift();
  const med = median(ex.win.map((w) => w.e));
  live.cents = med; live.hz = hz;
  const band = S.strict ? 25 : 50;
  const on = hzToDegree(hz, v.doHz);
  live.onDegree = on.index !== ((tg.deg % 7) + 7) % 7 && Math.abs(med) > band ? on.degree : null;
  if (Math.abs(med) <= band) {
    if (ex.holdStartClock == null) ex.holdStartClock = ex.noteClock - dt;
    ex.hold += dt; ex.holdCents.push(med); live.state = "holding";
    if (ex.hold >= 300) accept();
  } else {
    ex.hold = 0; ex.holdStartClock = null; ex.holdCents = [];
    live.state = med > 0 ? "sharp" : "flat";
  }
}
function accept() {
  const ex = S.ex, n = target();
  n.result = ex.hintUsed ? "helped" : "unaided";
  n.cents = Math.round(median(ex.holdCents));
  n.settleMs = Math.round(ex.holdStartClock);
  log(`note ${ex.i + 1} ${degName(n.deg)} ${n.result} ${n.cents}c settle ${n.settleMs}ms`);
  advance();
}
function skip() { const n = target(); n.result = "skipped"; log(`note ${S.ex.i + 1} skipped`); advance(); }
function advance() {
  const ex = S.ex;
  ex.i++;
  ex.live = { state: "listening", cents: null, hz: null };
  if (ex.i >= ex.notes.length) { finish(); return; }
  resetNote();
  renderExercise();
}
function finish() {
  const ex = S.ex;
  ex.phase = "done";
  const clean = ex.notes.every((n) => n.result === "unaided");
  S.streak[ex.level] = clean ? (S.streak[ex.level] || 0) + 1 : 0;
  if (S.streak[ex.level] >= 3 && ex.level < 8) S.suggested = Math.max(S.suggested, ex.level + 1);
  S.last = ex;
  go("summary");
}

// ---------- screens ----------
function go(screen) { S.screen = screen; log(`screen ${screen}`); render(); }
function render() {
  const app = $("#app");
  ({ welcome, voice, mic, home, settings, exercise: renderExercise, summary })[S.screen](app);
  renderProto();
}
function welcome(app) {
  app.innerHTML = `
    <h1>Shape-note trainer</h1>
    <p class="dim">Learn to sing the seven shapes by sight. The app gives you do, you sing the notes, and it listens.</p>
    <div class="card" style="text-align:center;margin:18px 0">
      ${[0, 1, 2, 3, 4, 5, 6].map((d) => shapeSvg(d, 40, "black", "margin:0 2px")).join("")}
      <div class="dim small">do re mi fa sol la ti</div>
    </div>
    <button class="primary big" id="go">Get started</button>`;
  $("#go").onclick = () => go("voice");
}
function voice(app) {
  app.innerHTML = `
    <h2>Which part do you sing?</h2>
    <p class="dim small">This sets the pitch range. You can change it later.</p>
    <div class="grid2" style="margin-top:12px">
      ${Object.entries(VOICES).map(([k, v]) => `<button class="big" data-v="${k}" style="${S.voice === k ? "border-color:var(--accent)" : ""}"><b>${v.name}</b><br><span class="dim small">do = ${v.keyName}</span></button>`).join("")}
    </div>`;
  app.querySelectorAll("[data-v]").forEach((b) => b.onclick = () => { S.voice = b.dataset.v; S.doKey = null; go(S.micOk ? "home" : "mic"); });
}
function mic(app) {
  app.innerHTML = `
    <h2>The app needs to hear you</h2>
    <p>It listens to your singing to tell you whether each note is in tune.</p>
    <p class="dim small">Your voice stays on this phone. Nothing is recorded or sent anywhere.</p>
    <p class="dim small">On iPhone you may be asked again each time you open the app. That's iPhone's rule, not ours.</p>
    <button class="primary big" id="allow" style="margin-top:16px">Allow the microphone</button>
    <button class="big" id="fake">Use the fake voice instead (prototype)</button>
    <p id="err" class="small" style="color:var(--warn)"></p>`;
  $("#allow").onclick = async () => { try { await openMic(); S.input = "mic"; go("home"); } catch (e) { $("#err").textContent = `${e.name}: ${e.message}`; } };
  $("#fake").onclick = async () => { await ensureAudio(); S.input = "fake"; S.micOk = true; drawerOpen = true; go("home"); };
}
function home(app) {
  const v = V();
  app.innerHTML = `
    <div class="topbar"><div><b>Levels</b> <span class="dim small">· ${v.name}${S.strict ? " · strict" : ""}</span></div><button class="x" id="set">⚙︎</button></div>
    ${LEVELS.map((L, i) => {
      const n = i + 1, st = S.streak[n] || 0;
      return `<button class="level ${n === S.suggested ? "suggest" : ""}" data-l="${n}">
        <span class="n">${n}</span>
        <span style="flex:1"><span>${LEVEL_TEXT[i]}</span><br><span class="dim small">${n === S.suggested ? "suggested · " : ""}<span class="dots">${"●".repeat(Math.min(st, 3))}${"○".repeat(3 - Math.min(st, 3))}</span> clean in a row</span></span>
        <span>${L.allowed.slice(0, 4).map((d) => shapeSvg(d, 18)).join("")}</span>
      </button>`;
    }).join("")}`;
  $("#set").onclick = () => go("settings");
  app.querySelectorAll("[data-l]").forEach((b) => b.onclick = () => startExercise(+b.dataset.l));
}
function settings(app) {
  app.innerHTML = `
    <div class="topbar"><b>Settings</b><button class="x" id="back">✕</button></div>
    <div class="card" style="margin:10px 0">
      <div class="row spread"><span>Voice part</span><b>${V().name}</b></div>
      <button class="big" id="voice" style="margin-top:10px">Change voice part</button>
    </div>
    <div class="card" style="margin-bottom:10px">
      <div class="row spread"><span>Pitch of do</span><b>${V().keyName}</b></div>
      <p class="dim small">Where your exercises sit. Pick the do that feels comfortable; exercises go a 4th below it and up to an octave above.</p>
      <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px">${keyChoices(VOICES[S.voice]).map(([n, o]) => `<button data-k="${n}|${o}" style="padding:8px 10px;${V().keyName === n + o ? "border-color:var(--accent);font-weight:700" : ""}">${n}${o}</button>`).join("")}</div>
    </div>
    <div class="card">
      <label class="row spread"><span>Strict tuning<br><span class="dim small">Notes must be within a quarter of a semitone instead of half. Applies from your next exercise.</span></span>
      <input type="checkbox" id="strict" ${S.strict ? "checked" : ""} style="width:26px;height:26px"></label>
    </div>`;
  $("#back").onclick = () => go("home");
  $("#voice").onclick = () => go("voice");
  app.querySelectorAll("[data-k]").forEach((b) => b.onclick = () => { const [n, o] = b.dataset.k.split("|"); S.doKey = [n, +o]; log(`do ${n}${o}`); render(); if (ctx) playTones([V().doHz], 1.0); });
  $("#strict").onchange = (e) => { S.strict = e.target.checked; log(`strict ${S.strict}`); };
}
async function startExercise(level) {
  newExercise(level);
  go("exercise");
  await intro();
}
async function intro() {
  const ex = S.ex, v = V();
  ex.phase = "intro"; renderActions(); setSay(`<span class="dim">Listen: do, then your first note…</span>`);
  await playTones([v.doHz, v.doHz * 2 ** (semisOf(ex.notes[0].deg) / 12)], 0.9);
  if (S.ex !== ex) return;
  ex.phase = "sing"; ex.lastT = null; renderActions();
}

// ---------- exercise variants ----------
function stateClass(n, i) {
  if (n.result === "unaided") return "done";
  if (n.result) return n.result;
  return i === S.ex.i ? "cur" : "";
}
let liveEls = {};
function renderExercise(app = $("#app")) {
  if (S.screen !== "exercise") return;
  const ex = S.ex, v = V();
  const head = `<div class="topbar"><div><b>Level ${ex.level}</b> <span class="dim small">· do = ${V().keyName} · note ${Math.min(ex.i + 1, ex.notes.length)} of ${ex.notes.length}${S.strict ? " · strict" : ""}</span></div>${S.variant === "D" ? `<button class="x" id="flip" style="font-size:14px">${view() === "B" ? "ladder" : "staff"}</button>` : ""}<button class="x" id="quit">✕</button></div>`;
  const W = Math.min(app.clientWidth || 390, 520) - 34;
  const VW = view();
  if (VW === "A") {
    const st = renderStaff(ex.notes.map((n, i) => ({ ...n, cls: stateClass(n, i) })), { voice: v, width: W, sp: 8.5, systems: 2 });
    const tg = target();
    app.innerHTML = `${head}
      <div style="margin:4px 0 6px">${st.svg}</div>
      <div class="card" style="text-align:center">
        <div class="row" style="justify-content:center;gap:14px">
          <span style="--line:var(--cur)">${shapeSvg(tg.deg, 56)}</span>
          <span style="font-size:30px;font-weight:700;color:var(--cur)">${degName(tg.deg)}</span>
        </div>
        <div class="say" id="say"></div>
        <div class="meter"><div class="zone" style="left:${50 - (S.strict ? 12.5 : 25)}%;width:${S.strict ? 25 : 50}%"></div><div class="needle" id="needle"></div></div>
        <div class="row spread dim small"><span>flat</span><span>sharp</span></div>
      </div>
      <div class="actions" id="actions"></div>`;
  } else if (VW === "B") {
    const sp = 12;
    const st = renderStaff(ex.notes.map((n, i) => ({ ...n, cls: stateClass(n, i) })), { voice: v, sp, systems: 1, fit: false });
    const cx = st.xs[Math.min(ex.i, ex.notes.length - 1)];
    app.innerHTML = `${head}
      <div class="scroll" id="scroll" style="height:${st.height}px;margin-top:8px">
        <div class="inner" style="transform:translateX(${(W / 2 - cx).toFixed(0)}px)">${st.svg}</div>
        <div class="center"></div>
        <svg class="trace" id="trace" width="${W}" height="${st.height}"></svg>
      </div>
      <div class="say" id="say" style="margin-top:14px"></div>
      <div class="row" style="justify-content:center;gap:18px;margin-top:16px" id="actions"></div>`;
    liveEls.B = { W, st, cx };
  } else {
    const all = [...new Set([...LEVELS[ex.level - 1].allowed, ...ex.notes.map((n) => n.deg)])].sort((a, b) => a - b);
    const lo = all[0], hi = all.at(-1);
    const rungH = Math.max(34, Math.min(52, 380 / (hi - lo + 1)));
    const H = rungH * (hi - lo + 1);
    const tg = target();
    app.innerHTML = `${head}
      <div class="strip">${ex.notes.map((n, i) => `<span class="${stateClass(n, i)}">${shapeSvg(n.deg, 24)}</span>`).join("")}</div>
      <div class="ladder card" id="ladder" style="height:${H + 12}px;padding:0">
        ${Array.from({ length: hi - lo + 1 }, (_, k) => hi - k).map((d) => `
          <div class="rung ${d === tg.deg ? "target" : ""}" style="top:${(hi - d) * rungH}px;height:${rungH}px">
            ${shapeSvg(d, rungH * 0.75)}<span class="lab">${degName(d)}</span>
          </div>`).join("")}
        <div class="ball off" id="ball"></div>
      </div>
      <div class="say" id="say"></div>
      <div class="actions" id="actions"></div>`;
    liveEls.C = { lo, hi, rungH };
  }
  $("#quit").onclick = () => { S.ex = null; go("home"); };
  if ($("#flip")) $("#flip").onclick = () => { S.ex.view = view() === "B" ? "C" : "B"; log(`flip ${S.ex.view}`); renderExercise(); };
  renderActions();
}
function renderActions() {
  const el = $("#actions");
  if (!el || !S.ex) return;
  const ex = S.ex, busy = ex.phase !== "sing";
  const hint = ex.hintShown ? `<button id="hint" class="${view() === "B" ? "round " : ""}hint" ${busy ? "disabled" : ""}>Play this note</button>`
    : `<button id="hint" ${view() === "B" ? 'class="round" style="visibility:hidden"' : 'disabled style="visibility:hidden"'}>Play this note</button>`;
  const cls = view() === "B" ? ' class="round"' : "";
  el.innerHTML = `<button id="replay"${cls} ${busy ? "disabled" : ""}>Replay do</button>${hint}<button id="skip"${cls} ${busy ? "disabled" : ""}>Skip</button>`;
  $("#replay").onclick = async () => { log("replay do"); await playTones([V().doHz], 1.0); };
  $("#hint").onclick = async () => { if (!ex.hintShown) return; ex.hintUsed = true; log("play this note"); await playTones([V().doHz * 2 ** (semisOf(target().deg) / 12)], 1.0); };
  $("#skip").onclick = () => { if (!busy) skip(); };
}
function setSay(html) { const s = $("#say"); if (s) s.innerHTML = html; }

function liveFrame() {
  requestAnimationFrame(liveFrame);
  if (S.screen !== "exercise" || !S.ex) return;
  const ex = S.ex, live = ex.live, tg = target();
  if (!tg) return;
  const v = V();
  if (ex.phase === "sing") {
    const name = degName(tg.deg);
    let msg;
    if (tonePlaying) msg = `<span class="dim">Listen…</span>`;
    else if (live.state === "listening") msg = `<span class="dim">Sing <b>${name}</b></span>`;
    else if (live.state === "holding") msg = `<span style="color:var(--ok)">Hold it…</span>`;
    else if (live.onDegree) msg = `You're on <b>${live.onDegree}</b>. Go ${live.cents < 0 ? "up" : "down"} to <b>${name}</b>`;
    else msg = `A little ${live.state}: go ${live.state === "flat" ? "up ↑" : "down ↓"}`;
    setSay(msg);
  }
  const VW = view();
  if (VW === "A") {
    const n = $("#needle");
    if (n) { const c = live.cents; n.style.opacity = c == null || live.state === "listening" ? 0.15 : 1; n.style.left = `${50 + Math.max(-50, Math.min(50, (c ?? 0) / 2))}%`; }
  } else if (VW === "B" && liveEls.B) {
    const { W, st, cx } = liveEls.B, svg = $("#trace");
    if (!svg) return;
    const now = performance.now(), sys = 0;
    const doPos = posOf(v, 0);
    const pts = ex.trace.map((r) => {
      let p = r.p; p += 7 * Math.round((tg.deg - p) / 7); // octave-fold onto the target
      return `${(W / 2 - (now - r.t) * 0.06).toFixed(1)},${st.yOf(doPos + p, sys).toFixed(1)}`;
    });
    const col = live.state === "holding" ? "var(--ok)" : "var(--warn)";
    svg.innerHTML = pts.length > 1 ? `<polyline points="${pts.join(" ")}" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".8"/>` : "";
  } else if (VW === "C" && liveEls.C) {
    const { lo, hi, rungH } = liveEls.C, ball = $("#ball");
    if (!ball) return;
    const last = ex.trace.at(-1);
    if (!last || performance.now() - last.t > 250 || live.state === "listening") { ball.classList.add("off"); return; }
    let p = last.p; p += 7 * Math.round((tg.deg - p) / 7);
    p = Math.max(lo - 0.4, Math.min(hi + 0.4, p));
    ball.classList.remove("off");
    ball.classList.toggle("in", live.state === "holding");
    ball.style.top = `${(hi - p) * rungH + rungH / 2}px`;
  }
}
requestAnimationFrame(liveFrame);

// ---------- summary ----------
function summary(app) {
  const ex = S.last, v = V();
  const n = ex.notes.length;
  const un = ex.notes.filter((x) => x.result === "unaided").length;
  const he = ex.notes.filter((x) => x.result === "helped").length;
  const sk = ex.notes.filter((x) => x.result === "skipped").length;
  const sung = ex.notes.filter((x) => x.cents != null);
  const lean = sung.length ? sung.reduce((a, x) => a + x.cents, 0) / sung.length : 0;
  const trouble = ex.notes.map((x, i) => ({ ...x, i })).filter((x) => x.result !== "unaided");
  const st = renderStaff(ex.notes.map((x) => ({ ...x, cls: x.result === "unaided" ? "" : x.result })), { voice: v, width: Math.min(app.clientWidth || 390, 520) - 34, sp: 8.5, systems: 2 });
  const streak = S.streak[ex.level] || 0;
  const suggestNext = streak >= 3 && ex.level < 8;
  app.innerHTML = `
    <div class="topbar"><b>Level ${ex.level}</b><button class="x" id="quit">✕</button></div>
    <h1 style="margin-top:6px">${un} of ${n} unaided</h1>
    <p class="dim">${[he && `${he} helped`, sk && `${sk} skipped`].filter(Boolean).join(" · ") || "Every note on your own."}</p>
    <div style="margin:8px 0">${st.svg}</div>
    ${trouble.length ? `<div class="card"><b>Worth another look</b>${trouble.map((x) => `<div class="row" style="margin-top:6px"><span style="--line:var(--${x.result === "helped" ? "help" : "skip"})">${shapeSvg(x.deg, 28)}</span><span><b>${degName(x.deg)}</b>, note ${x.i + 1} <span class="dim small">(${x.result})</span></span></div>`).join("")}</div>` : ""}
    ${Math.abs(lean) > 15 ? `<p style="margin-top:12px">You tend to sing a little <b>${lean < 0 ? "flat" : "sharp"}</b>.</p>` : ""}
    ${un === n ? `<p style="margin-top:12px;color:var(--ok)"><b>Clean attempt.</b> ${streak} in a row at this level.</p>` : ""}
    ${suggestNext ? `<div class="card" style="margin-top:12px;border-color:var(--accent)">Ready for level ${ex.level + 1}? <i>${LEVEL_TEXT[ex.level]}</i><button class="primary big" id="up" style="margin-top:10px">Try level ${ex.level + 1}</button></div>` : ""}
    <button class="${suggestNext ? "" : "primary "}big" id="again" style="margin-top:14px">Next exercise</button>
    <button class="big" id="levels">Levels</button>`;
  $("#quit").onclick = $("#levels").onclick = () => go("home");
  $("#again").onclick = () => startExercise(ex.level);
  if (suggestNext) $("#up").onclick = () => startExercise(ex.level + 1);
}

// ---------- prototype chrome: variant switcher + input drawer ----------
let drawerOpen = false;
function setVariant(k) {
  S.variant = k;
  const u = new URL(location.href); u.searchParams.set("variant", k); history.replaceState(null, "", u);
  log(`variant ${k}`);
  render();
}
function renderProto() {
  const keys = Object.keys(VARIANTS), i = keys.indexOf(S.variant);
  $("#proto").innerHTML = `<button id="pv">◀</button><span class="lab">${S.variant} · ${VARIANTS[S.variant]}</span><button id="nv">▶</button><button id="dr">${S.input === "mic" ? "🎤" : "🎚"}</button>`;
  $("#pv").onclick = () => setVariant(keys[(i + keys.length - 1) % keys.length]);
  $("#nv").onclick = () => setVariant(keys[(i + 1) % keys.length]);
  $("#dr").onclick = () => { drawerOpen = !drawerOpen; renderDrawer(); };
  renderDrawer();
}
function renderDrawer() {
  const d = $("#drawer");
  d.classList.toggle("open", drawerOpen);
  if (!drawerOpen) return;
  const tg = S.ex && S.screen === "exercise" ? target() : null;
  d.innerHTML = `
    <div class="row spread"><b>Prototype controls</b><span>input: <button id="im">${S.input === "mic" ? "mic" : "fake"}</button></span></div>
    ${S.input === "fake" ? `
      <p>Fake voice: <span id="fv">${fake.silent ? "silent" : `${fake.semis.toFixed(2)} semitones from do`}</span></p>
      <input type="range" id="fs" min="-6" max="14" step="0.05" value="${fake.semis}">
      <div class="row" style="margin-top:6px"><button id="fon">Sing the target</button><button id="ffl">Target, flat</button><button id="fsil">${fake.silent ? "Unmute" : "Silence"}</button></div>` : `<p class="dim">Using the real microphone.</p>`}
    <p style="margin-top:10px">What do you like or dislike? (sent with the state)</p>
    <textarea id="fb"></textarea>
    <div class="row" style="margin-top:6px"><button id="send">Send</button><span id="sent" class="dim"></span></div>`;
  $("#im").onclick = async () => {
    if (S.input === "mic") S.input = "fake";
    else { try { await openMic(); S.input = "mic"; } catch (e) { alertLine(`${e.name}: ${e.message}`); } }
    log(`input ${S.input}`); renderProto();
  };
  if (S.input === "fake") {
    const tgSemis = () => (S.ex && S.screen === "exercise" ? semisOf(target().deg) : 0);
    $("#fs").oninput = (e) => { fake.semis = +e.target.value; fake.silent = false; $("#fv").textContent = `${fake.semis.toFixed(2)} semitones from do`; };
    $("#fon").onclick = () => { fake.semis = tgSemis() + 0.1; fake.silent = false; renderDrawer(); };
    $("#ffl").onclick = () => { fake.semis = tgSemis() - 0.7; fake.silent = false; renderDrawer(); };
    $("#fsil").onclick = () => { fake.silent = !fake.silent; renderDrawer(); };
  }
  $("#send").onclick = async () => {
    $("#send").disabled = true;
    const body = { when: new Date().toISOString(), notes: $("#fb").value, variant: S.variant, screen: S.screen, voice: S.voice, strict: S.strict, input: S.input,
      ua: navigator.userAgent, standalone: matchMedia("(display-mode: standalone)").matches || navigator.standalone === true,
      last: S.last && { level: S.last.level, notes: S.last.notes }, ex: S.ex && { level: S.ex.level, i: S.ex.i, notes: S.ex.notes }, events: S.events.slice(-80) };
    try { const r = await fetch("/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); $("#sent").textContent = r.ok ? "sent ✓" : `failed ${r.status}`; if (r.ok) $("#fb").value = ""; }
    finally { $("#send").disabled = false; }
  };
}
function alertLine(m) { log(m); const s = $("#sent"); if (s) s.textContent = m; }
addEventListener("error", (e) => log(`error ${e.message} @ ${e.filename?.split("/").pop()}:${e.lineno}`));
addEventListener("unhandledrejection", (e) => log(`unhandled ${e.reason?.message ?? e.reason}`));
addEventListener("keydown", (e) => {
  if (e.target.closest("input,textarea,[contenteditable]")) return;
  const keys = Object.keys(VARIANTS), i = keys.indexOf(S.variant);
  if (e.key === "ArrowLeft") setVariant(keys[(i + keys.length - 1) % keys.length]);
  if (e.key === "ArrowRight") setVariant(keys[(i + 1) % keys.length]);
});
addEventListener("resize", () => { if (S.screen === "exercise" || S.screen === "summary") render(); });

document.fonts.load("40px Bravura").finally(render);

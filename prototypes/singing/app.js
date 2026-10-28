// PROTOTYPE (SW-37, throwaway): page shell around the qwen-written detector
// (dist/mpm.js, run in worker.js) and Hz -> degree (dist/degree.js).
import { hzToDegree } from "./dist/degree.js";

const $ = (id) => document.getElementById(id);
const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const SCALE = [0, 2, 4, 5, 7, 9, 11];
const DEG = ["do", "re", "mi", "fa", "sol", "la", "ti"];
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
for (let m = 43; m <= 72; m++) $("key").add(new Option(`do = ${NAMES[m % 12]}${Math.floor(m / 12) - 1}`, m));
$("key").value = "55";
const doHz = () => midiHz(+$("key").value);

let ctx, tap, sink, worker, stream, src;
let pending = null;          // the current mic start being timed
let target = null;           // { index, shownAt, holdStart }
let lastResultAt = 0;
const readings = [];         // { t, hz, clarity, s } or { t, hz: null, rms }
const S = { starts: [], detectMs: [], pipeMs: [], frames: 0, pitched: 0, gaps: 0, octaveJumps: 0, bigJumps: 0, hits: [], events: [] };

const push = (arr, v, max = 400) => { arr.push(v); if (arr.length > max) arr.shift(); };
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const pct = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f0 = (v) => (Number.isFinite(v) ? v.toFixed(0) : "?");
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "?");
const log = (msg) => { push(S.events, `${new Date().toISOString().slice(11, 19)} ${msg}`, 60); };
const status = (msg) => { $("status").textContent = msg; if (msg) log(msg); };
const where = (e) => (e?.stack || "").split("\n").find((l) => l.includes(".js")) || "";
const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { status(`${e.name}: ${e.message} @ ${where(e)}`); } };
addEventListener("error", (e) => status(`${e.message} @ ${e.filename?.split("/").pop()}:${e.lineno}`));
addEventListener("unhandledrejection", (e) => status(`unhandled: ${e.reason?.message ?? e.reason} @ ${where(e.reason)}`));

async function setupAudio() {
  if (ctx) { try { await ctx.close(); } catch {} }
  stopMic();
  ctx = new AudioContext({ latencyHint: "interactive" });
  ctx.onstatechange = () => log(`ctx state ${ctx.state}`);
  await ctx.audioWorklet.addModule("/worklet.js");
  tap = new AudioWorkletNode(ctx, "tap", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: "explicit" });
  sink = ctx.createGain();
  sink.gain.value = 0;
  tap.connect(sink).connect(ctx.destination);
  if (worker) worker.terminate();
  worker = new Worker("/worker.js", { type: "module" });
  worker.onerror = (e) => status(`worker error: ${e.message}`);
  worker.onmessage = onResult;
  const ch = new MessageChannel();
  tap.port.postMessage({ port: ch.port1, hop: +$("hop").value }, [ch.port1]);
  worker.postMessage({ port: ch.port2 }, [ch.port2]);
  await ctx.resume();
  log(`AudioContext ${ctx.sampleRate} Hz, baseLatency ${f0(ctx.baseLatency * 1000)} ms, outputLatency ${f0(ctx.outputLatency * 1000)} ms`);
}

// A second tap while getUserMedia is still pending used to start a second mic
// and trip over `pending` (TypeError on iPhone, round 2); now it joins the first.
let starting = null;
function startMic() {
  if (stream) return;
  starting ??= openMic().finally(() => { starting = null; });
  return starting;
}

async function openMic() {
  const ec = $("ec").checked;
  const p = { t0: performance.now(), mode: $("micMode").value, ec, key: $("key").selectedOptions[0].text };
  pending = p;
  stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: ec, noiseSuppression: false, autoGainControl: false } });
  p.gumMs = performance.now() - p.t0;
  const track = stream.getAudioTracks()[0];
  S.settings = track.getSettings();
  track.onended = () => log("mic track ended");
  track.onmute = () => log("mic track muted");
  src = ctx.createMediaStreamSource(stream);
  tap.port.postMessage({ reset: true });
  src.connect(tap);
  buttons();
}

function stopMic() {
  if (!stream) return;
  if (pending) { S.starts.push(pending); pending = null; }
  src?.disconnect();
  stream.getTracks().forEach((t) => t.stop());
  stream = src = null;
  buttons();
}

function onResult({ data }) {
  const { r, frame, sr, gaps, ms, rms } = data;
  const now = performance.now();
  lastResultAt = now;
  S.frames++;
  S.gaps = gaps;
  push(S.detectMs, ms);
  push(S.pipeMs, (ctx.currentTime - frame / sr) * 1000);
  if (pending && pending.firstFrameMs == null) pending.firstFrameMs = now - pending.t0;
  const t = frame / sr;
  if (r) {
    S.pitched++;
    if (pending && pending.firstPitchMs == null) { pending.firstPitchMs = now - pending.t0; S.starts.push(pending); pending = null; }
    const s = 12 * Math.log2(r.hz / doHz());
    const prev = readings.at(-1);
    if (prev && prev.hz && t - prev.t < 0.1) {
      const d = Math.abs(s - prev.s);
      if (d > 7) S.bigJumps++;
      if (d > 10.5 && d < 13.5) S.octaveJumps++;
    }
    readings.push({ t, hz: r.hz, clarity: r.clarity, s });
  } else {
    readings.push({ t, hz: null, rms });
  }
  while (readings.length && readings[0].t < t - 90) readings.shift();
}

// 200 ms median of the sung position (semitones from do), or null in silence.
function smoothed() {
  if (!readings.length || performance.now() - lastResultAt > 300) return null;
  const tEnd = readings.at(-1).t;
  const win = readings.filter((r) => r.t >= tEnd - 0.2);
  const ok = win.filter((r) => r.hz).map((r) => r.s).sort((a, b) => a - b);
  if (ok.length < Math.max(2, win.length / 2)) return null;
  const med = ok[Math.floor(ok.length / 2)];
  return { s: med, t: tEnd, hz: doHz() * 2 ** (med / 12), ...hzToDegree(doHz() * 2 ** (med / 12), doHz()) };
}

function playTone(freqs, each) {
  const n = 8;
  const real = new Float32Array(n), imag = new Float32Array(n);
  for (let h = 1; h < n; h++) imag[h] = 1 / h; // harmonics so a low do survives a phone speaker
  const wave = ctx.createPeriodicWave(real, imag);
  const out = ctx.createGain();
  out.gain.value = 0.35;
  out.connect(ctx.destination);
  let t = ctx.currentTime + 0.05;
  for (const f of freqs) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.setPeriodicWave(wave);
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 0.03);
    g.gain.setValueAtTime(1, t + each - 0.12);
    g.gain.linearRampToValueAtTime(0, t + each);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + each + 0.02);
    t += each;
  }
  return new Promise((res) => setTimeout(res, (t - ctx.currentTime) * 1000 + 60));
}

async function giveDo() {
  if ($("micMode").value === "close") stopMic();
  const d = doHz();
  const arp = $("arp").checked;
  log(`give do ${f1(d)} Hz${arp ? " (arpeggio)" : ""}, mic ${stream ? "open" : "closed"}`);
  await playTone(arp ? [d, d * 2 ** (4 / 12), d * 2 ** (7 / 12), d * 2] : [d], arp ? 0.6 : 1.2);
  await startMic();
}

function newTarget() {
  let i;
  do i = Math.floor(Math.random() * 7); while (target && i === target.index);
  target = { index: i, shownAt: performance.now(), holdStart: null, cents: [] };
}

function buttons() {
  const ready = !!ctx;
  for (const id of ["give", "listen", "newTarget", "suspendResume", "recreate"]) $(id).disabled = !ready;
  $("stop").disabled = !stream;
  $("listen").disabled = !ready || !!stream;
}

// ---- drawing ----
const cv = $("trace"), g2 = cv.getContext("2d");
const LO = -8, HI = 20, SPAN = 6;
function draw() {
  const dpr = devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  g2.setTransform(dpr, 0, 0, dpr, 0, 0);
  g2.clearRect(0, 0, w, h);
  const y = (s) => h - ((s - LO) / (HI - LO)) * h;
  g2.font = "11px system-ui";
  for (let p = LO; p <= HI; p++) {
    const k = ((p % 12) + 12) % 12, idx = SCALE.indexOf(k);
    if (idx < 0) continue;
    g2.strokeStyle = idx === 0 ? "#555" : "#2c2c2c";
    g2.beginPath(); g2.moveTo(28, y(p)); g2.lineTo(w, y(p)); g2.stroke();
    g2.fillStyle = idx === 0 ? "#aaa" : "#666";
    g2.fillText(DEG[idx], 2, y(p) + 4);
  }
  if (!readings.length) return;
  const tEnd = readings.at(-1).t;
  for (const r of readings) {
    if (!r.hz || r.t < tEnd - SPAN) continue;
    const x = 28 + ((r.t - (tEnd - SPAN)) / SPAN) * (w - 28);
    g2.fillStyle = r.clarity > 0.93 ? "#6cf" : "#468";
    g2.fillRect(x - 1.5, y(r.s) - 1.5, 3, 3);
  }
}

function frame() {
  const tol = +$("tol").value;
  $("zone").style.left = `${50 - tol / 2}%`;
  $("zone").style.width = `${tol}%`;
  const sm = smoothed();
  if (sm) {
    const inTune = Math.abs(sm.cents) <= tol;
    $("deg").textContent = sm.degree;
    $("deg").style.color = inTune ? "var(--ok)" : "var(--warn)";
    $("oct").textContent = sm.octave === 0 ? "" : sm.octave > 0 ? `+${sm.octave} oct` : `${sm.octave} oct`;
    $("needle").style.left = `${50 + Math.max(-50, Math.min(50, sm.cents / 2))}%`;
    const last = readings.at(-1);
    $("cents").textContent = `${sm.cents >= 0 ? "+" : ""}${f0(sm.cents)} cents · ${f1(sm.hz)} Hz · clarity ${last.clarity ? last.clarity.toFixed(2) : "–"}`;
    if (target) {
      if (sm.index === target.index && inTune) {
        target.holdStart ??= performance.now();
        target.cents.push(sm.cents);
        if (performance.now() - target.holdStart >= 300) {
          const hit = { degree: DEG[target.index], ms: Math.round(target.holdStart - target.shownAt), meanCents: Math.round(avg(target.cents)), tol };
          S.hits.push(hit);
          $("target").textContent = `✓ ${hit.degree} in ${(hit.ms / 1000).toFixed(1)} s`;
          target = null;
          setTimeout(() => { if (!target) newTarget(); }, 1200);
        }
      } else if (target) { target.holdStart = null; target.cents = []; }
    }
  } else {
    $("deg").textContent = "–";
    $("deg").style.color = "var(--dim)";
    $("oct").textContent = "";
    if (target) { target.holdStart = null; target.cents = []; }
  }
  if (target) $("target").textContent = `Sing: ${DEG[target.index].toUpperCase()}`;
  draw();
  requestAnimationFrame(frame);
}

function standalone() {
  return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function statsText() {
  const sc = navigator.mediaDevices?.getSupportedConstraints?.() ?? {};
  const starts = S.starts.slice(-4).map((s) => `  gUM ${f0(s.gumMs)} · first frame ${f0(s.firstFrameMs)} · first pitch ${f0(s.firstPitchMs)} ms (${s.mode}${s.ec ? ", ec" : ""})`);
  return [
    `standalone ${standalone()} · ${navigator.userAgent.replace(/^Mozilla\/5.0 /, "")}`,
    ctx ? `ctx ${ctx.state} ${ctx.sampleRate} Hz · base ${f0(ctx.baseLatency * 1000)} ms · out ${f0(ctx.outputLatency * 1000)} ms` : "ctx –",
    `audioSession ${navigator.audioSession ? navigator.audioSession.type : "n/a"} · mic ${stream ? "open" : "closed"}`,
    `settings ${S.settings ? JSON.stringify(S.settings) : "–"}`,
    `supported ec:${!!sc.echoCancellation} ns:${!!sc.noiseSuppression} agc:${!!sc.autoGainControl} voiceIsolation:${!!sc.voiceIsolation}`,
    `mic starts (last 4):`, ...(starts.length ? starts : ["  –"]),
    `detect ${f1(avg(S.detectMs))} ms avg, ${f1(Math.max(0, ...S.detectMs))} max · pipeline ${f0(avg(S.pipeMs))} ms avg, ${f0(pct(S.pipeMs, 0.95))} p95`,
    `frames ${S.frames} · pitched ${S.frames ? f0((100 * S.pitched) / S.frames) : 0}% · dropped-block gaps ${S.gaps}`,
    `jumps >7 st ${S.bigJumps} · octave jumps ${S.octaveJumps}`,
    `hits ${S.hits.length}${S.hits.length ? ` · avg ${(avg(S.hits.map((h) => h.ms)) / 1000).toFixed(1)} s · ${S.hits.map((h) => `${h.degree} ${(h.ms / 1000).toFixed(1)}s ${h.meanCents >= 0 ? "+" : ""}${h.meanCents}c`).join(", ")}` : ""}`,
    `events:`, ...S.events.slice(-8).map((e) => `  ${e}`),
  ].join("\n");
}
setInterval(() => { $("stats").textContent = statsText(); }, 500);

async function sendReport() {
  const tEnd = readings.length ? readings.at(-1).t : 0;
  const body = {
    when: new Date().toISOString(), notes: $("notes").value, ua: navigator.userAgent, standalone: standalone(),
    ctx: ctx && { sampleRate: ctx.sampleRate, baseLatency: ctx.baseLatency, outputLatency: ctx.outputLatency, state: ctx.state },
    audioSession: navigator.audioSession?.type ?? null,
    supported: navigator.mediaDevices?.getSupportedConstraints?.(),
    settings: S.settings, key: $("key").selectedOptions[0].text, doHz: doHz(),
    hop: +$("hop").value, tol: +$("tol").value, micMode: $("micMode").value, ec: $("ec").checked,
    starts: S.starts, hits: S.hits, events: S.events,
    detectMs: { avg: avg(S.detectMs), max: Math.max(0, ...S.detectMs) },
    pipeMs: { avg: avg(S.pipeMs), p95: pct(S.pipeMs, 0.95) },
    frames: S.frames, pitched: S.pitched, gaps: S.gaps, bigJumps: S.bigJumps, octaveJumps: S.octaveJumps,
    stats: statsText(),
    last60s: readings.filter((r) => r.t >= tEnd - 60).map((r) => r.hz ? [+r.t.toFixed(3), +r.hz.toFixed(2), +r.clarity.toFixed(3)] : [+r.t.toFixed(3), null, +r.rms.toFixed(4)]),
  };
  $("send").disabled = true;
  $("sent").textContent = "sending…";
  try {
    const res = await fetch("/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    $("sent").textContent = res.ok ? `sent ${new Date().toLocaleTimeString()}` : `failed ${res.status}`;
  } finally { $("send").disabled = false; }
}

async function wakeLock() {
  try { await navigator.wakeLock?.request("screen"); } catch {}
}

$("start").onclick = guard(async () => { await setupAudio(); await wakeLock(); $("start").textContent = "Audio on"; $("start").disabled = true; buttons(); });
$("give").onclick = guard(giveDo);
$("listen").onclick = guard(startMic);
$("stop").onclick = guard(stopMic);
$("newTarget").onclick = guard(async () => newTarget());
$("send").onclick = guard(sendReport);
$("hop").onchange = () => tap?.port.postMessage({ hop: +$("hop").value });
$("session").onchange = () => { if (navigator.audioSession && $("session").value) { navigator.audioSession.type = $("session").value; log(`audioSession -> ${navigator.audioSession.type}`); } };
$("suspendResume").onclick = guard(async () => { await ctx.suspend(); await ctx.resume(); log("ctx suspended + resumed"); });
$("recreate").onclick = guard(async () => { await setupAudio(); log("ctx recreated"); buttons(); });
$("key").onchange = () => log(`key ${$("key").selectedOptions[0].text}`);
document.addEventListener("visibilitychange", () => { log(`page ${document.visibilityState}`); if (document.visibilityState === "visible") wakeLock(); });
buttons();
requestAnimationFrame(frame);

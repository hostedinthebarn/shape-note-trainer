// Screens and controller (SW-50, written by Claude from the SW-38 prototype, variant D).
// Flow: welcome -> voice part -> microphone -> levels -> exercise -> summary, plus settings.
// All music logic is the local-model core; this file only wires it to the audio engine and the DOM.
import type { Settings, Exercise, Attempt, VoicePartId, Key, Clef } from "../types.ts";
import { VOICE_PARTS, LEVELS, DEGREES } from "../types.ts";
import { generateMelody } from "../core/generator.ts";
import { mulberry32 } from "../core/prng.ts";
import { pickKey, keyForDo, noteMidi } from "../core/keys.ts";
import { init, step, view } from "../core/scoring.ts";
import type { ScoringState } from "../core/scoring.ts";
import { summarize, progress, TOP_LEVEL } from "../core/summary.ts";
import { scalePosition } from "../core/degree.ts";
import { degreeFromStep } from "../core/shapes.ts";
import { layoutStaff } from "../core/layout.ts";
import type { StaffLayout } from "../core/layout.ts";
import { staffPosition } from "../core/staff.ts";
import { AudioEngine } from "./audio/engine.ts";
import { staffSvg, shapeSvg } from "./staff-svg.ts";
import { loadSettings, saveSettings, defaultSettings, loadAttempts, saveAttempt } from "./store.ts";

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T | null;
const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);
const degName = (step: number) => degreeFromStep(step);
const LEVEL_TEXT = [
  "do, re, mi: steps only", "do up to sol: steps", "the whole octave: steps", "do, mi, sol, do: chord leaps",
  "thirds", "below do, half notes", "wider leaps", "dotted rhythms",
];
const ACC = { [-1]: "♭", 0: "", 1: "♯" } as Record<number, string>;
const keyName = (k: Key) => `${k.tonic}${ACC[k.accidental]}`;
const pitchName = (midi: number) => `${keyName(keyForDo(midi))}${Math.floor((midi - keyForDo(midi).accidental) / 12) - 1}`;
const LADDER_MAX_LEVEL = 4;

/** Where do sits, in words, for the key-change caption. */
function doPlace(key: Key, clef: Clef): string {
  const p = staffPosition(0, key, clef);
  const ORD = ["bottom", "second", "middle", "fourth", "top"];
  const SPACE = ["first", "second", "third", "fourth"];
  if (p >= 0 && p <= 8) return p % 2 === 0 ? `on the ${ORD[p / 2]} line` : `in the ${SPACE[(p - 1) / 2]} space`;
  // Outside the staff, even positions are ledger lines and odd ones the spaces between them (SW-58).
  if (p === -1) return "just below the staff";
  if (p === 9) return "just above the staff";
  const where = p < 0 ? "below the staff" : "above the staff";
  return p % 2 === 0 ? `${where}, on a ledger line` : `${where}, in a space between ledger lines`;
}

// ── state ────────────────────────────────────────────────────────────────────

interface Run {
  exercise: Exercise;
  scoring: ScoringState;
  phase: "intro" | "sing" | "done";
  /** Voice positions (scale steps from do) for the ladder ball and the staff line. */
  trace: Array<{ t: number; pos: number }>;
  showStaff: boolean;
  keyChanged: boolean;
}
type Screen = "welcome" | "voice" | "mic" | "home" | "settings" | "exercise" | "summary";

const S = {
  screen: "welcome" as Screen,
  settings: loadSettings() as Settings | null,
  attempts: loadAttempts(),
  run: null as Run | null,
  last: null as { attempt: Attempt; streak: number; suggestUp: boolean } | null,
  lastKeyDo: null as number | null,
  micReady: false,
};

const engine = new AudioEngine({
  base: new URL("./audio/", import.meta.url),
  clarityGate: S.settings ? VOICE_PARTS[S.settings.voicePart].clarityGate : 0.8,
  onEvent(e) {
    const run = S.run;
    if (!run || run.phase === "done") return;
    if (e.type === "reading" && e.hz) {
      run.trace.push({ t: e.t, pos: scalePosition(e.hz, midiHz(run.exercise.key.doMidi)) });
      while (run.trace.length && run.trace[0].t < e.t - 4000) run.trace.shift();
    }
    const before = view(run.scoring).noteIndex;
    run.scoring = step(run.scoring, e);
    const v = view(run.scoring);
    if (v.done) finish();
    else if (v.noteIndex !== before) renderExercise();
  },
});

// ── navigation ───────────────────────────────────────────────────────────────

function go(screen: Screen) {
  // Gary, 2026-11-04: hold the mic and the phone's audio only during an exercise.
  if (screen !== "exercise") void engine.release();
  S.screen = screen;
  render();
  window.scrollTo(0, 0);
}
function render() {
  const app = $("#app")!;
  ({ welcome, voice, mic, home, settings, exercise: renderExercise, summary })[S.screen](app);
}

// ── first run ────────────────────────────────────────────────────────────────

function welcome(app: HTMLElement) {
  app.innerHTML = `
    <h1>Sing the Shapes</h1>
    <p class="dim">Learn to sing the seven shapes by sight. The app gives you do, you sing the notes, and it listens.</p>
    <div class="card" style="text-align:center;margin:18px 0">
      ${[0, 1, 2, 3, 4, 5, 6].map((d) => shapeSvg(d, 40, "black", "margin:0 2px")).join("")}
      <div class="dim small">do re mi fa sol la ti</div>
    </div>
    <button class="primary big" id="go">Get started</button>
    <p class="dim small" style="margin-top:14px">Free, with no account. What you sing is heard by the app on your phone and never sent anywhere. We count visits with Cloudflare's cookie-free analytics; your practice history stays on your phone.</p>
    <p class="dim small"><a href="/?about">What is this?</a> Made by <a href="https://hostedinthebarn.com/">Hosted in the Barn</a>. <a href="https://github.com/hostedinthebarn/shape-note-trainer">Source code</a> (MIT).</p>`;
  $("#go")!.onclick = () => go("voice");
}

function voice(app: HTMLElement) {
  app.innerHTML = `
    <h2>Which part do you sing?</h2>
    <p class="dim small">This sets your clef and pitch range. You can change it later in settings.</p>
    <div class="grid2" style="margin-top:12px">
      ${Object.values(VOICE_PARTS).map((v) => `<button class="big ${S.settings?.voicePart === v.id ? "chosen" : ""}" data-v="${v.id}"><b>${v.name}</b><br><span class="dim small">${v.clef} clef · do ${pitchName(v.defaultDoMidi)}</span></button>`).join("")}
    </div>`;
  app.querySelectorAll<HTMLElement>("[data-v]").forEach((b) => b.onclick = () => {
    const id = b.dataset.v as VoicePartId;
    const prev = S.settings;
    S.settings = { ...defaultSettings(id), strict: prev?.strict ?? false, alwaysMyDo: prev?.alwaysMyDo ?? false };
    saveSettings(S.settings);
    engine.setClarityGate(VOICE_PARTS[id].clarityGate);
    go(S.micReady ? "home" : "mic");
  });
}

function mic(app: HTMLElement) {
  const returning = !!S.settings && S.attempts.length > 0;
  app.innerHTML = returning ? `
    <h1>Ready to sing?</h1>
    <p class="dim">The app needs the microphone to hear you.</p>
    <p class="dim small">On iPhone you may be asked again each time you open the app. That's iPhone's rule, not ours.</p>
    <button class="primary big" id="allow" style="margin-top:16px">Start</button>
    <p id="err" class="small warn"></p>` : `
    <h2>The app needs to hear you</h2>
    <p>It listens to your singing to tell you whether each note is in tune.</p>
    <p class="dim small">Your voice stays on this phone. Nothing is recorded or sent anywhere.</p>
    <p class="dim small">On iPhone you may be asked again each time you open the app. That's iPhone's rule, not ours.</p>
    <button class="primary big" id="allow" style="margin-top:16px">Allow the microphone</button>
    <p id="err" class="small warn"></p>`;
  $("#allow")!.onclick = async () => {
    $<HTMLButtonElement>("#allow")!.disabled = true;
    try {
      await engine.openMic();
      S.micReady = true;
      go("home");
    } catch (e) {
      const err = e as Error;
      $<HTMLButtonElement>("#allow")!.disabled = false;
      $("#err")!.textContent = err.name === "NotAllowedError"
        ? "The microphone was blocked. Allow it for this site in your browser's settings, then try again."
        : `${err.name}: ${err.message}`;
    }
  };
}

// ── levels ───────────────────────────────────────────────────────────────────

function suggestedLevel(): number {
  let best = 1;
  for (let l = 1; l <= TOP_LEVEL; l++) {
    const p = progress(S.attempts, l);
    if (p.suggestUp) best = Math.max(best, l + 1);
  }
  if (best === 1 && S.attempts.length) best = S.attempts.at(-1)!.exercise.level;
  return best;
}

function home(app: HTMLElement) {
  const s = S.settings!, vp = VOICE_PARTS[s.voicePart], sug = suggestedLevel();
  app.innerHTML = `
    <div class="topbar"><div><b>Levels</b> <span class="dim small">· ${vp.name} · do ${pitchName(s.doMidi)}${s.strict ? " · strict" : ""}</span></div><button class="x" id="set" aria-label="Settings">⚙︎</button></div>
    ${LEVELS.map((L, i) => {
      const n = i + 1, st = Math.min(progress(S.attempts, n).cleanStreak, 3);
      return `<button class="level ${n === sug ? "suggest" : ""}" data-l="${n}">
        <span class="n">${n}</span>
        <span style="flex:1"><span>${LEVEL_TEXT[i]}</span><br><span class="dim small">${n === sug ? "suggested · " : ""}<span class="dots" aria-label="${st} clean in a row">${"●".repeat(st)}${"○".repeat(3 - st)}</span> clean in a row</span></span>
        <span>${L.allowed.slice(0, 4).map((d) => shapeSvg(d, 18)).join("")}</span>
      </button>`;
    }).join("")}`;
  $("#set")!.onclick = () => go("settings");
  app.querySelectorAll<HTMLElement>("[data-l]").forEach((b) => b.onclick = () => startExercise(+b.dataset.l!));
}

// ── settings ─────────────────────────────────────────────────────────────────

function settings(app: HTMLElement) {
  const s = S.settings!, vp = VOICE_PARTS[s.voicePart];
  const choices = Array.from({ length: 13 }, (_, i) => vp.defaultDoMidi - 6 + i);
  app.innerHTML = `
    <div class="topbar"><b>Settings</b><button class="x" id="back" aria-label="Close">✕</button></div>
    <div class="card gap">
      <div class="row spread"><span>Voice part</span><b>${vp.name}</b></div>
      <button class="big" id="voice" style="margin-top:10px">Change voice part</button>
    </div>
    <div class="card gap">
      <div class="row spread"><span>Pitch of do</span><b>${pitchName(s.doMidi)}</b></div>
      <p class="dim small">Where your exercises sit: from sol below do up to do above. Tap one to hear it, and pick the do that feels comfortable.</p>
      <div class="row wrap">${choices.map((m) => `<button class="chip ${m === s.doMidi ? "chosen" : ""}" data-m="${m}">${pitchName(m)}</button>`).join("")}</div>
    </div>
    <div class="card gap">
      <label class="row spread"><span>Always my do<br><span class="dim small">Every exercise in your own key. Off: the key moves around your do, so you practise reading different key signatures.</span></span>
      <input type="checkbox" id="mydo" ${s.alwaysMyDo ? "checked" : ""}></label>
    </div>
    <div class="card gap">
      <label class="row spread"><span>Strict tuning<br><span class="dim small">Notes must be within a quarter of a semitone instead of half. Applies from your next exercise.</span></span>
      <input type="checkbox" id="strict" ${s.strict ? "checked" : ""}></label>
    </div>`;
  const save = () => saveSettings(S.settings!);
  $("#back")!.onclick = () => go("home");
  $("#voice")!.onclick = () => go("voice");
  app.querySelectorAll<HTMLElement>("[data-m]").forEach((b) => b.onclick = () => {
    S.settings = { ...S.settings!, doMidi: +b.dataset.m! };
    save();
    render();
    previewDo(midiHz(S.settings.doMidi));
  });
  $<HTMLInputElement>("#mydo")!.onchange = (e) => { S.settings = { ...S.settings!, alwaysMyDo: (e.target as HTMLInputElement).checked }; save(); };
  $<HTMLInputElement>("#strict")!.onchange = (e) => { S.settings = { ...S.settings!, strict: (e.target as HTMLInputElement).checked }; save(); };
}

/** Settings' do preview: release the audio afterwards unless something newer is using it. */
let previews = 0;
function previewDo(hz: number) {
  const mine = ++previews;
  void engine.play(hz).then(() => {
    if (mine === previews && S.screen === "settings" && !engine.listening) void engine.release();
  });
}

// ── exercise ─────────────────────────────────────────────────────────────────

function newExercise(level: number): Exercise {
  const s = S.settings!;
  const rand = mulberry32((Math.random() * 2 ** 32) >>> 0);
  const melody = generateMelody(LEVELS[level - 1], rand);
  const key = pickKey(melody, s.doMidi, s.alwaysMyDo, rand);
  return { level, key, clef: VOICE_PARTS[s.voicePart].clef, melody };
}

const noteHz = (ex: Exercise, stepFromDo: number) => midiHz(noteMidi(stepFromDo, ex.key.doMidi));

async function startExercise(level: number) {
  // Called from a tap, so the mic and the audio context can start here. The mic opens before the
  // first tone (the SW-37 burst lesson) and is released when the exercise screen is left.
  try {
    await engine.openMic();
    S.micReady = true;
  } catch {
    S.micReady = false;
    go("mic");
    return;
  }
  const exercise = newExercise(level);
  const s = S.settings!;
  const keyChanged = S.lastKeyDo !== exercise.key.doMidi;  // the first exercise of a visit counts as a change
  S.lastKeyDo = exercise.key.doMidi;
  const run: Run = {
    exercise,
    scoring: init({ steps: exercise.melody.degrees, doHz: midiHz(exercise.key.doMidi), strict: s.strict }, engine.now()),
    phase: "intro",
    trace: [],
    showStaff: level > LADDER_MAX_LEVEL,
    keyChanged,
  };
  S.run = run;
  go("exercise");
  // The intro: do, then the first note. Both are tones, so scoring ignores the mic meanwhile.
  await engine.play([noteHz(exercise, 0), noteHz(exercise, exercise.melody.degrees[0])]);
  if (S.run !== run) return;
  run.phase = "sing";
  renderExercise();
}

function finish() {
  const run = S.run!;
  run.phase = "done";
  const v = view(run.scoring);
  const attempt: Attempt = { exercise: run.exercise, results: v.results, strict: S.settings!.strict, finishedAt: new Date().toISOString() };
  S.attempts = saveAttempt(attempt);
  const p = progress(S.attempts, attempt.exercise.level);
  S.last = { attempt, streak: p.cleanStreak, suggestUp: p.suggestUp };
  S.run = null;
  go("summary");
}

function noteClass(run: Run, i: number): string {
  const v = view(run.scoring);
  const r = v.results[i];
  if (r) return r.outcome === "unaided" ? "done" : r.outcome;
  return i === v.noteIndex ? "cur" : "";
}

let live: { kind: "ladder"; lo: number; hi: number; rungH: number } | { kind: "staff"; W: number; doPos: number; yOfPos: (p: number) => number } | null = null;

function renderExercise(app = $("#app")!) {
  const run = S.run;
  if (S.screen !== "exercise" || !run) return;
  const ex = run.exercise, v = view(run.scoring), n = ex.melody.degrees.length;
  const W = Math.min(app.clientWidth || 390, 520) - 34;
  const busy = run.phase !== "sing";
  const head = `<div class="topbar"><div><b>Level ${ex.level}</b> <span class="dim small">· ${keyName(ex.key)} major · note ${Math.min(v.noteIndex + 1, n)} of ${n}${S.settings!.strict ? " · strict" : ""}</span></div>
    <div class="row"><button class="flip" id="flip">${run.showStaff ? "ladder" : "staff"}</button><button class="x" id="quit" aria-label="Stop">✕</button></div></div>
    ${run.keyChanged && run.phase === "intro" ? `<div class="caption"><b>${keyName(ex.key)} major</b>: do is ${doPlace(ex.key, ex.clef)}.</div>` : ""}`;
  const target = ex.melody.degrees[Math.min(v.noteIndex, n - 1)];
  const actions = `<div class="actions">
      <button id="replay" ${busy ? "disabled" : ""}>Replay do</button>
      <button id="hint" class="${v.hintOffered ? "hint" : "invisible"}" ${busy || !v.hintOffered ? "disabled" : ""}>Play this note</button>
      <button id="skip" ${busy ? "disabled" : ""}>Skip</button>
    </div>`;

  if (run.showStaff) {
    // Scrolling staff: one long system, the current note centred, clef and key pinned at the left.
    const sp = 12, padTop = 8, padBottom = 4;
    const layout = layoutStaff(ex.melody, ex.clef, ex.key, 1e6);
    const st = staffSvg(layout, { sp, padTop, padBottom, classOf: (i) => noteClass(run, i) });
    const pin = staffSvg(headerOnly(layout), { sp, padTop, padBottom, className: "pin" });
    const cx = st.anchor(Math.min(v.noteIndex, n - 1)).x;
    app.innerHTML = `${head}
      <div class="scroll" style="height:${st.height}px;margin-top:8px">
        <div class="inner" style="transform:translateX(${(W / 2 - cx).toFixed(0)}px)">${st.svg}</div>
        <div class="center"></div>
        <svg class="trace" id="trace" width="${W}" height="${st.height}"></svg>
        <div class="pinbox">${pin.svg}</div>
      </div>
      <div class="say" id="say"></div>
      ${actions}`;
    live = { kind: "staff", W, doPos: staffPosition(0, ex.key, ex.clef), yOfPos: (p) => st.yOfPos(p) };
  } else {
    // Shape ladder, with a small staff header showing the clef, key signature and do.
    const all = [...new Set([...LEVELS[ex.level - 1].allowed, ...ex.melody.degrees])].sort((a, b) => a - b);
    const lo = all[0], hi = all.at(-1)!;
    const rungH = Math.max(34, Math.min(52, 380 / (hi - lo + 1)));
    const H = rungH * (hi - lo + 1);
    const doStaff = staffSvg(layoutStaff({ degrees: [0], rhythm: [4] }, ex.clef, ex.key, 100), { sp: 8, padTop: 4, padBottom: 3 });
    app.innerHTML = `${head}
      <div class="keyhead row"><span class="keystaff">${doStaff.svg}</span><span class="dim small">${keyName(ex.key)} major · ${ex.clef} clef<br>do is ${doPlace(ex.key, ex.clef)}</span></div>
      <div class="strip">${ex.melody.degrees.map((d, i) => `<span class="${noteClass(run, i)}">${shapeSvg(d, 24)}</span>`).join("")}</div>
      <div class="ladder card" style="height:${H + 12}px;padding:0">
        ${Array.from({ length: hi - lo + 1 }, (_, k) => hi - k).map((d) => `
          <div class="rung ${d === target ? "target" : ""}" style="top:${(hi - d) * rungH}px;height:${rungH}px">
            ${shapeSvg(d, rungH * 0.75)}<span class="lab">${degName(d)}</span>
          </div>`).join("")}
        <div class="ball off" id="ball"></div>
      </div>
      <div class="say" id="say"></div>
      ${actions}`;
    live = { kind: "ladder", lo, hi, rungH };
  }

  $("#quit")!.onclick = () => { S.run = null; go("home"); };
  $("#flip")!.onclick = () => { run.showStaff = !run.showStaff; renderExercise(); };
  $("#replay")!.onclick = () => { if (run.phase === "sing" && !engine.busy) void engine.play(noteHz(ex, 0)); };
  $("#hint")!.onclick = () => {
    const now = view(run.scoring);
    if (run.phase !== "sing" || !now.hintOffered || now.done || engine.busy) return;
    engine.ui("hint");
    void engine.play(noteHz(ex, ex.melody.degrees[now.noteIndex]));
  };
  $("#skip")!.onclick = () => { if (run.phase === "sing") engine.ui("skip"); };
}

/** Just the clef, key signature and staff lines of the first system, for the pinned header. */
function headerOnly(layout: StaffLayout): StaffLayout {
  const sys = layout.systems[0];
  // Up to just before the first note: the clef and key signature with a little staff after them.
  const keyEnd = Math.max(4, layout.anchors[0].x - 1.5);
  return {
    systems: [{
      glyphs: sys.glyphs.filter((g) => g.kind === "clef" || g.kind === "key"),
      lines: sys.lines.filter((l) => l.kind === "staff").map((l) => ({ ...l, x2: keyEnd })),
      width: keyEnd, firstNote: 0, lastNote: 0,
    }],
    anchors: [],
  };
}

function liveFrame() {
  requestAnimationFrame(liveFrame);
  const run = S.run;
  if (S.screen !== "exercise" || !run || !live) return;
  const ex = run.exercise, v = view(run.scoring);
  if (v.done) return;
  const target = ex.melody.degrees[v.noteIndex];
  const say = $("#say");
  if (say) {
    const name = degName(target);
    let msg: string;
    if (run.phase === "intro") msg = `<span class="dim">Listen: do, then your first note…</span>`;
    else if (v.status === "listening") msg = `<span class="dim">Sing <b>${name}</b></span>`;
    else if (v.status === "holding") msg = `<span class="ok">Hold it…</span>`;
    else if (v.singing) msg = `You're on <b>${v.singing}</b>. Go ${v.status === "flat" ? "up" : "down"} to <b>${name}</b>`;
    else msg = `A little ${v.status}: go ${v.status === "flat" ? "up ↑" : "down ↓"}`;
    if (say.innerHTML !== msg) say.innerHTML = msg;
  }
  // The voice, folded onto the target's octave (judging is octave-forgiving).
  const fold = (pos: number) => pos + 7 * Math.round((target - pos) / 7);
  const now = engine.now();
  if (live.kind === "ladder") {
    const ball = $("#ball");
    if (!ball) return;
    const last = run.trace.at(-1);
    if (!last || now - last.t > 300 || v.status === "listening") { ball.classList.add("off"); return; }
    const p = Math.max(live.lo - 0.4, Math.min(live.hi + 0.4, fold(last.pos)));
    ball.classList.remove("off");
    ball.classList.toggle("in", v.status === "holding");
    ball.style.top = `${(live.hi - p) * live.rungH + live.rungH / 2}px`;
  } else {
    const svg = $("#trace");
    if (!svg) return;
    const { W, doPos, yOfPos } = live;
    const pts = run.trace.filter((r) => now - r.t < 3500).map((r) => `${(W / 2 - (now - r.t) * 0.06).toFixed(1)},${yOfPos(doPos + fold(r.pos)).toFixed(1)}`);
    const col = v.status === "holding" ? "var(--ok)" : "var(--warn)";
    svg.innerHTML = pts.length > 1 ? `<polyline points="${pts.join(" ")}" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".8"/>` : "";
  }
}
requestAnimationFrame(liveFrame);

// Re-render once a second while singing so the hint button appears on time.
setInterval(() => {
  const run = S.run;
  if (S.screen !== "exercise" || !run || run.phase !== "sing") return;
  const hintBtn = $("#hint");
  if (hintBtn && view(run.scoring).hintOffered && hintBtn.classList.contains("invisible")) renderExercise();
}, 500);

// ── summary ──────────────────────────────────────────────────────────────────

function summary(app: HTMLElement) {
  const { attempt, streak, suggestUp } = S.last!;
  const ex = attempt.exercise, sm = summarize(attempt.results);
  const W = Math.min(app.clientWidth || 390, 520) - 34, sp = 8.5;
  const st = staffSvg(layoutStaff(ex.melody, ex.clef, ex.key, W / sp), {
    sp, padTop: 5, padBottom: 5,
    classOf: (i) => { const r = attempt.results[i]; return r && r.outcome !== "unaided" ? r.outcome : ""; },
  });
  app.innerHTML = `
    <div class="topbar"><b>Level ${ex.level}</b><button class="x" id="quit" aria-label="Close">✕</button></div>
    <h1 style="margin-top:6px">${sm.unaided} of ${sm.total} unaided</h1>
    <p class="dim">${[sm.helped && `${sm.helped} helped`, sm.skipped && `${sm.skipped} skipped`].filter(Boolean).join(" · ") || "Every note on your own."}</p>
    <div style="margin:8px 0;overflow-x:auto">${st.svg}</div>
    ${sm.trouble.length ? `<div class="card"><b>Worth another look</b>${sm.trouble.slice(0, 5).map((i) => {
      const r = attempt.results[i], d = ex.melody.degrees[i];
      return `<div class="row" style="margin-top:6px"><span class="${r.outcome}">${shapeSvg(d, 28)}</span><span><b>${degName(d)}</b>, note ${i + 1} <span class="dim small">(${r.outcome})</span></span></div>`;
    }).join("")}${sm.trouble.length > 5 ? `<div class="dim small" style="margin-top:6px">and ${sm.trouble.length - 5} more</div>` : ""}</div>` : ""}
    ${sm.lean ? `<p style="margin-top:12px">You tend to sing a little <b>${sm.lean}</b>.</p>` : ""}
    ${sm.clean ? `<p class="ok" style="margin-top:12px"><b>Clean attempt.</b> ${streak} in a row at this level.</p>` : ""}
    ${suggestUp ? `<div class="card" style="margin-top:12px;border-color:var(--accent)">Ready for level ${ex.level + 1}? <i>${LEVEL_TEXT[ex.level]}</i><button class="primary big" id="up" style="margin-top:10px">Try level ${ex.level + 1}</button></div>` : ""}
    <button class="${suggestUp ? "" : "primary "}big" id="again" style="margin-top:14px">Next exercise</button>
    <button class="big" id="levels">Levels</button>`;
  $("#quit")!.onclick = $("#levels")!.onclick = () => go("home");
  $("#again")!.onclick = () => startExercise(ex.level);
  if (suggestUp) $("#up")!.onclick = () => startExercise(ex.level + 1);
}

// ── start ────────────────────────────────────────────────────────────────────

addEventListener("resize", () => { if (S.screen === "exercise" || S.screen === "summary") render(); });
S.screen = S.settings ? "home" : "welcome";

// Gary, 2026-11-04: let go of the mic and speaker as soon as the app isn't on screen (another app,
// the Home Screen, a locked phone). An exercise in progress is abandoned, not saved, and the app
// comes back on the levels screen; the next exercise asks for the mic again from its tap.
function background() {
  if (document.visibilityState === "visible") return;
  if (S.run) S.run = null;
  if (S.screen === "exercise") S.screen = "home";
  void engine.release();
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") render();
  else background();
});
addEventListener("pagehide", () => void engine.release());
// Bravura must be loaded before the first staff is drawn (SW-51 handles the offline font).
document.fonts.load("40px Bravura").finally(render);
// SW-51: work offline once it has been opened. Production only: the dev server (localhost or a
// cloudflared quick tunnel to the phone) must always show the latest edit.
if ("serviceWorker" in navigator && location.hostname === "sing.hostedinthebarn.com") {
  navigator.serviceWorker.register("/sw.js").catch(() => { /* offline support is a bonus, never a blocker */ });
}

// For the dev check in Chrome (no effect on the app).
(globalThis as unknown as { __snt: unknown }).__snt = { S, go, engine, DEGREES };

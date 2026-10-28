// PROTOTYPE (SW-38, throwaway): a tiny SVG staff renderer using Bravura glyphs, as the
// notation research (SW-32) proposed. Shapes come from the qwen-written shape table.
import { shapeFor, glyphChar, degreeFromStep, fillForDuration } from "./dist/shapes.js";

// Sounding do per voice part (⚠️ prototype guesses; voice ranges are still fog).
export const VOICES = {
  S: { name: "Soprano", clef: "treble", doDn: 29, doHz: 293.66, sharps: 2, flats: 0, keyName: "D" },
  A: { name: "Alto", clef: "treble", doDn: 27, doHz: 233.08, sharps: 0, flats: 2, keyName: "B♭" },
  T: { name: "Tenor", clef: "bass", doDn: 25, doHz: 196.0, sharps: 1, flats: 0, keyName: "G" }, // bass clef, as in Songs of Faith and Praise (Gary, SW-38)
  B: { name: "Bass", clef: "bass", doDn: 21, doHz: 130.81, sharps: 0, flats: 0, keyName: "C" },
};
const BOTTOM = { treble: 30, treble8vb: 30, bass: 18 };
const CLEF = { treble: ["", 2], treble8vb: ["", 2], bass: ["", 6] };
const SHARP_POS = [8, 5, 9, 6, 3, 7, 4];
const FLAT_POS = [4, 7, 3, 6, 2, 5, 1];
// Bravura anchors in staff spaces: [stemUpSE, stemDownNW]
const ANCHORS = {
  "triangle-up": [[1.424, -0.5], [0, -0.5]],
  moon: [[1.444, 0.068], [0, 0.072]],
  diamond: [[1.436, 0], [0, 0]],
  "triangle-left": [[1.436, -0.5], [0, -0.5]],
  "triangle-right": [[1.436, 0.476], [0, 0.476]],
  round: [[1.456, 0.192], [0, -0.168]],
  square: [[1.44, -0.46], [0, 0.46]],
  "triangle-round": [[1.424, 0.172], [0, 0.172]],
};
const HEAD_W = 1.44;

export const posOf = (voice, deg) => voice.doDn + deg - BOTTOM[voice.clef];
export const degName = (deg) => degreeFromStep(deg);

/** A glyph for a degree as a standalone shape (black, no stem). */
export function shapeChar(deg, fill = "black") {
  return glyphChar(shapeFor(degreeFromStep(deg), fill, "none"));
}

/**
 * Render notes on a staff. notes: [{ deg, dur, cls }]. Returns { svg, xs, yOf, height }.
 * opts: { voice, width, sp, systems (1 or 2), fit (scale to width) }
 */
export function renderStaff(notes, opts) {
  const { voice, sp = 9, systems = 1, fit = true } = opts;
  const pos = (n) => posOf(voice, n.deg);
  // split into bars of 4 quarters
  const bars = [];
  let cur = [], acc = 0;
  notes.forEach((n, i) => { cur.push({ ...n, i }); acc += n.dur; if (acc >= 4 - 1e-9) { bars.push(cur); cur = []; acc = 0; } });
  if (cur.length) bars.push(cur);
  const perSys = Math.ceil(bars.length / systems);
  const head = sp * (3.6 + 1.1 * (voice.sharps + voice.flats) + 0.8);
  const sysH = sp * 12.5;
  const xs = [], parts = [];
  const gl = (ch, x, y, cls = "") => `<text class="g ${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${4 * sp}">${ch}</text>`;
  const line = (x1, y1, x2, y2, w, cls = "") => `<line class="${cls}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke-width="${(w * sp).toFixed(2)}"/>`;
  let maxW = 0;
  for (let s = 0; s * perSys < bars.length; s++) {
    const sysBars = bars.slice(s * perSys, (s + 1) * perSys);
    const base = sysH * s + sp * 8.5; // y of bottom staff line
    const y = (p) => base - (p * sp) / 2;
    // natural widths
    const natural = sysBars.map((b) => b.map((n) => sp * (2.6 + 1.5 * Math.sqrt(n.dur))));
    const natTotal = natural.flat().reduce((a, b) => a + b, 0) + sysBars.length * sp * 1.2;
    const avail = (opts.width ?? natTotal + head + sp) - head - sp;
    const k = fit ? avail / natTotal : 1;
    let x = head;
    const sysW = fit ? opts.width : natTotal + head + sp;
    maxW = Math.max(maxW, sysW);
    for (let l = 0; l < 5; l++) parts.push(line(0, y(2 * l), sysW - 1, y(2 * l), 0.13, "staffline"));
    const [cg, cp] = CLEF[voice.clef];
    parts.push(gl(cg, sp * 0.6, y(cp)));
    const accPos = voice.sharps ? SHARP_POS.slice(0, voice.sharps) : FLAT_POS.slice(0, voice.flats);
    const shift = voice.clef === "bass" ? -2 : 0;
    accPos.forEach((p, j) => parts.push(gl(voice.sharps ? "" : "", sp * (3.8 + 1.1 * j), y(p + shift))));
    sysBars.forEach((bar, bi) => {
      bar.forEach((n, ni) => {
        const w = natural[bi][ni] * k;
        const nx = x + sp * 0.6;
        xs[n.i] = nx + (HEAD_W * sp) / 2;
        const p = pos(n);
        const stem = n.dur >= 4 ? "none" : p >= 4 ? "down" : "up";
        const glyph = shapeFor(degreeFromStep(n.deg), fillForDuration(n.dur), stem);
        const g = [];
        for (let lp = -2; lp >= p; lp -= 2) g.push(line(nx - 0.4 * sp, y(lp), nx + (HEAD_W + 0.4) * sp, y(lp), 0.16, "ledger"));
        for (let lp = 10; lp <= p; lp += 2) g.push(line(nx - 0.4 * sp, y(lp), nx + (HEAD_W + 0.4) * sp, y(lp), 0.16, "ledger"));
        g.push(gl(glyphChar(glyph), nx, y(p), "head"));
        if (stem !== "none") {
          const a = ANCHORS[glyph.shape][stem === "up" ? 0 : 1];
          const sx = nx + a[0] * sp, sy = y(p) - a[1] * sp;
          const ey = stem === "up" ? sy - 3.5 * sp : sy + 3.5 * sp;
          g.push(line(sx, sy, sx, ey, 0.12, "stem"));
          if (n.dur === 0.5) g.push(gl(stem === "up" ? "" : "", sx - 0.06 * sp, ey));
        }
        if (n.dur === 1.5 || n.dur === 3) g.push(gl("", nx + (HEAD_W + 0.5) * sp, y(p % 2 === 0 ? p + 1 : p)));
        parts.push(`<g class="note ${n.cls ?? ""}" data-i="${n.i}">${g.join("")}</g>`);
        x += w;
      });
      x += sp * 1.2 * k;
      const bx = Math.min(x - sp * 0.6 * k, sysW - 1);
      parts.push(line(bx, y(0), bx, y(8), bi === sysBars.length - 1 && (s + 1) * perSys >= bars.length ? 0.5 : 0.16, "barline"));
    });
  }
  const height = sysH * Math.ceil(bars.length / perSys);
  return {
    svg: `<svg class="staff" viewBox="0 0 ${maxW.toFixed(0)} ${height}" width="${maxW.toFixed(0)}" height="${height}">${parts.join("")}</svg>`,
    xs, width: maxW, height,
    yOf: (p, sys = 0) => sysH * sys + sp * 8.5 - (p * sp) / 2,
    sysOf: (i) => { let acc = 0, b = 0; for (let j = 0; j < i; j++) { acc += notes[j].dur; if (acc >= 4 - 1e-9) { b++; acc = 0; } } return Math.floor(b / perSys); },
  };
}

/** A shape as a small inline SVG, centred vertically (HTML text puts SMuFL glyphs off-centre). */
export function shapeSvg(deg, size = 28, fill = "black", style = "") {
  const ch = glyphChar(shapeFor(degreeFromStep(deg), fill, "none"));
  return `<svg class="shp" width="${size}" height="${size * 0.8}" viewBox="-0.1 -0.8 1.7 1.6" style="vertical-align:middle;${style}"><text class="g" x="0" y="0" font-size="4">${ch}</text></svg>`;
}

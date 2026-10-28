// Layout -> SVG (SW-50, written by Claude). src/core/layout.ts gives glyphs and lines in staff
// spaces; this turns them into an SVG string at `sp` pixels per staff space. Bravura glyphs are
// placed as <text> at font-size 4 * sp, whose origin sits on the staff position (SMuFL), so a
// glyph's (x, y) in staff spaces is exactly its text position. Each note's parts are grouped in
// <g class="note ..." data-i="n"> so the screen can colour a note by its state.
import type { StaffLayout, Glyph, Line } from "../core/layout.ts";
import { shapeFor, glyphChar, degreeFromStep } from "../core/shapes.ts";
import type { HeadFill } from "../core/shapes.ts";

export interface SvgOptions {
  /** Pixels per staff space. */
  sp: number;
  /** Staff spaces above the top line and below the bottom line (room for ledger lines and stems). */
  padTop?: number;
  padBottom?: number;
  /** Extra class names for note i (e.g. "cur", "done", "helped"). */
  classOf?: (i: number) => string;
  className?: string;
}

export interface StaffSvg {
  svg: string;
  width: number;
  height: number;
  /** Pixel position of note i's head centre. */
  anchor(i: number): { x: number; y: number };
  /** Pixel y of a (fractional) staff position p on system s. */
  yOfPos(p: number, s?: number): number;
}

const f = (n: number) => Number(n.toFixed(2));

export function staffSvg(layout: StaffLayout, o: SvgOptions): StaffSvg {
  const sp = o.sp, padTop = o.padTop ?? 5, padBottom = o.padBottom ?? 5;
  const sysH = padTop + 4 + padBottom;
  const width = Math.max(...layout.systems.map((s) => s.width)) * sp + 2;
  const height = sysH * layout.systems.length * sp;
  const X = (x: number) => f(x * sp + 1);
  const Y = (y: number, s: number) => f((s * sysH + padTop + y) * sp);
  const glyph = (g: Glyph, s: number) =>
    `<text class="g" x="${X(g.x)}" y="${Y(g.y, s)}" font-size="${4 * sp}">${String.fromCodePoint(g.codepoint)}</text>`;
  const line = (l: Line, s: number) =>
    `<line class="${l.kind}" x1="${X(l.x1)}" y1="${Y(l.y1, s)}" x2="${X(l.x2)}" y2="${Y(l.y2, s)}" stroke-width="${f(l.thickness * sp)}"/>`;

  const parts: string[] = [];
  layout.systems.forEach((sys, s) => {
    const byNote = new Map<number, string[]>();
    const add = (i: number | null, html: string) => {
      if (i === null) { parts.push(html); return; }
      if (!byNote.has(i)) byNote.set(i, []);
      byNote.get(i)!.push(html);
    };
    for (const l of sys.lines) add(l.note, line(l, s));
    for (const g of sys.glyphs) add(g.note, glyph(g, s));
    for (const [i, html] of byNote) parts.push(`<g class="note ${o.classOf?.(i) ?? ""}" data-i="${i}">${html.join("")}</g>`);
  });
  return {
    svg: `<svg class="staff ${o.className ?? ""}" viewBox="0 0 ${f(width)} ${f(height)}" width="${f(width)}" height="${f(height)}">${parts.join("")}</svg>`,
    width,
    height,
    anchor(i) {
      const a = layout.anchors[i];
      return { x: X(a.x), y: Y(a.y, a.system) };
    },
    yOfPos(p, s = 0) {
      return Y(4 - p / 2, s);
    },
  };
}

/** A single shape as a small inline SVG, centred (HTML text puts SMuFL glyphs off-centre). */
export function shapeSvg(step: number, size = 28, fill: HeadFill = "black", extra = ""): string {
  const ch = glyphChar(shapeFor(degreeFromStep(step), fill, "none"));
  return `<svg class="shp" width="${size}" height="${f(size * 0.8)}" viewBox="-0.1 -0.8 1.7 1.6" style="vertical-align:middle;${extra}"><text class="g" x="0" y="0" font-size="4">${ch}</text></svg>`;
}

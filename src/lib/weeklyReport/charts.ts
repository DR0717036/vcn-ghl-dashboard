// Server-rendered PNG charts for the weekly report's four-week trend, drawn with the image
// renderer that ships inside Next.js (next/og: Satori lays out text with the Manrope files in
// public/fonts, resvg rasterises the result). No extra dependency. Each chart is rendered at 2x
// for sharp phones and shown at 560 px wide; the lines and dots are an inline SVG image, the
// labels are real text so they stay crisp. Attached to the email as inline cid: images, never
// embedded in the HTML. Only draws the numbers it is given; every figure comes from data.ts.

import fs from "node:fs";
import path from "node:path";
import { createElement as h, type ReactElement } from "react";
import type { ReportTheme } from "./config";
import type { TrendWeek, WeeklyReportData } from "./data";

export interface ChartImage {
  cid: string;
  filename: string;
  contentType: "image/png";
  data: Buffer;
  /** CSS pixels (the PNG is twice this). */
  width: number;
  height: number;
  alt: string;
}

/** What the HTML needs to place a chart. */
export type ChartRef = Pick<ChartImage, "cid" | "width" | "height" | "alt">;

interface Series {
  name: string;
  color: string;
  values: (number | null)[];
  /** Value label; "n/a" is drawn for null. */
  fmt: (v: number) => string;
}

interface Panel {
  series: Series[];
  /** CSS pixel height of the plot area including its labels. */
  height: number;
}

const SCALE = 2;
const WIDTH = 560;
const PAD_X = 56;
const AXIS_H = 28;
/** Title line and legend row above the plot. */
const TITLE_H = 54;

const THEMES = {
  light: { bg: "#ffffff", grid: "#dde5ee", axis: "#c3cfdd", ink: "#182536", muted: "#5b6b7f", series: ["#1677ff", "#0a8db4"], highlight: "#ffd51f", highlightText: "#7a6200", band: "rgba(255, 213, 31, 0.16)" },
  dark: { bg: "#0c1d33", grid: "#1b2e47", axis: "#223750", ink: "#ffffff", muted: "#8b98a9", series: ["#4d95ff", "#19c6f4"], highlight: "#ffd51f", highlightText: "#ffd51f", band: "rgba(255, 213, 31, 0.10)" },
};

let fontCache: { name: string; data: Buffer; weight: 500 | 700; style: "normal" }[] | null = null;
function fonts() {
  if (fontCache) return fontCache;
  const dir = path.join(process.cwd(), "public", "fonts");
  fontCache = [
    { name: "Manrope", data: fs.readFileSync(path.join(dir, "Manrope-Medium.ttf")), weight: 500, style: "normal" },
    { name: "Manrope", data: fs.readFileSync(path.join(dir, "Manrope-Bold.ttf")), weight: 700, style: "normal" },
  ];
  return fontCache;
}

const n = (v: number) => v.toLocaleString("en-US");

/**
 * A smooth curve through the points that never overshoots them (monotone cubic Hermite,
 * Fritsch–Carlson tangents, written as cubic Béziers): two equal weeks draw a flat segment and
 * a line never dips below zero or above a peak the data does not have.
 */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  const k = pts.length;
  const dx = pts.slice(1).map((p, i) => p.x - pts[i].x);
  const slope = pts.slice(1).map((p, i) => (p.y - pts[i].y) / (dx[i] || 1));
  const m: number[] = new Array(k).fill(0);
  m[0] = slope[0];
  m[k - 1] = slope[k - 2];
  for (let i = 1; i < k - 1; i++) m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  for (let i = 0; i < k - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const t = a * a + b * b;
    if (t > 9) {
      const tau = 3 / Math.sqrt(t);
      m[i] = tau * a * slope[i];
      m[i + 1] = tau * b * slope[i];
    }
  }
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < k - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const third = dx[i] / 3;
    d += ` C${(p1.x + third).toFixed(1)},${(p1.y + m[i] * third).toFixed(1)} ${(p2.x - third).toFixed(1)},${(p2.y - m[i + 1] * third).toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

/**
 * One PNG: the panels stacked, a shared x-axis of week labels under them, the last week
 * highlighted with a band, a yellow dot, and yellow labels. Each panel has its own y scale
 * from zero to its largest value (two panels, not two axes, when the units differ).
 */
async function chartPng(opts: { cid: string; title: string; alt: string; panels: Panel[]; labels: string[]; highlight: number; theme: ReportTheme }): Promise<ChartImage> {
  const T = THEMES[opts.theme];
  const count = opts.labels.length;
  const height = TITLE_H + opts.panels.reduce((s, p) => s + p.height, 0) + AXIS_H;
  const xAt = (i: number) => (count <= 1 ? WIDTH / 2 : PAD_X + (i * (WIDTH - 2 * PAD_X)) / (count - 1));
  const s = (v: number) => v * SCALE;

  // SVG: band, grid, lines, dots (geometry only; text is laid out by Satori below).
  const svg: string[] = [];
  const texts: ReactElement[] = [];
  if (opts.highlight >= 0 && opts.highlight < count) {
    const bx = xAt(opts.highlight) - 34;
    svg.push(`<rect x="${bx}" y="${TITLE_H - 8}" width="68" height="${height - AXIS_H - TITLE_H + 12}" rx="8" fill="${T.band}"/>`);
  }
  // title, then the legend row under it
  texts.push(h("div", { key: "title", style: { position: "absolute", left: s(PAD_X - 16), top: s(6), fontSize: s(17), fontWeight: 700, color: T.ink } }, opts.title));
  let top = TITLE_H;
  opts.panels.forEach((panel, pi) => {
    // room above the top dot and below the bottom dot for their value labels
    const plotTop = top + 26;
    const plotBottom = top + panel.height - 26;
    const plotH = plotBottom - plotTop;
    const max = Math.max(1, ...panel.series.flatMap((se) => se.values.filter((v): v is number => v !== null)));
    const yAt = (v: number) => plotBottom - (v / max) * plotH;
    // grid: baseline plus two light lines
    svg.push(`<line x1="${PAD_X - 16}" y1="${plotBottom}" x2="${WIDTH - PAD_X + 16}" y2="${plotBottom}" stroke="${T.axis}" stroke-width="1"/>`);
    for (const f of [0.5, 1]) svg.push(`<line x1="${PAD_X - 16}" y1="${yAt(max * f).toFixed(1)}" x2="${WIDTH - PAD_X + 16}" y2="${yAt(max * f).toFixed(1)}" stroke="${T.grid}" stroke-width="1" stroke-dasharray="3 4"/>`);
    // legend row for the panel
    let lx = PAD_X - 16;
    panel.series.forEach((se, si) => {
      const color = se.color || T.series[si % T.series.length];
      texts.push(
        h("div", { key: `lg${pi}${si}`, style: { position: "absolute", left: s(lx), top: s(pi === 0 ? 32 : top + 2), display: "flex", alignItems: "center", fontSize: s(11), fontWeight: 700, color: T.muted } }, h("div", { style: { width: s(9), height: s(9), borderRadius: s(5), background: color, marginRight: s(6) } }), se.name),
      );
      lx += 14 + se.name.length * 7.2 + 18;
    });
    // lines and dots
    panel.series.forEach((se, si) => {
      const color = se.color || T.series[si % T.series.length];
      const runs: { x: number; y: number }[][] = [[]];
      se.values.forEach((v, i) => {
        if (v === null) {
          if (runs[runs.length - 1].length) runs.push([]);
          return;
        }
        runs[runs.length - 1].push({ x: xAt(i), y: yAt(v) });
      });
      for (const run of runs) if (run.length > 1) svg.push(`<path d="${smoothPath(run)}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`);
      se.values.forEach((v, i) => {
        const x = xAt(i);
        const hl = i === opts.highlight;
        if (v === null) {
          texts.push(h("div", { key: `na${pi}${si}${i}`, style: { position: "absolute", left: s(x - 40), top: s(plotBottom - 16), width: s(80), display: "flex", justifyContent: "center", fontSize: s(10), fontWeight: 500, color: T.muted } }, "n/a"));
          return;
        }
        const y = yAt(v);
        svg.push(hl ? `<circle cx="${x}" cy="${y.toFixed(1)}" r="6" fill="${T.highlight}" stroke="${T.ink}" stroke-width="2"/>` : `<circle cx="${x}" cy="${y.toFixed(1)}" r="4.5" fill="${color}" stroke="${T.bg}" stroke-width="2"/>`);
        // value label on the side away from the other line: the higher point labels above, the lower below (a lone series labels above)
        const others = panel.series.filter((_, j) => j !== si).map((o) => o.values[i]).filter((o): o is number => o !== null);
        const above = others.length === 0 ? true : others.every((o) => v > o) || (others.every((o) => v === o) && si === 0);
        texts.push(
          h("div", { key: `v${pi}${si}${i}`, style: { position: "absolute", left: s(x - 40), top: s(above ? y - 20 : y + 8), width: s(80), display: "flex", justifyContent: "center", fontSize: s(hl ? 12 : 11), fontWeight: 700, color: hl ? T.highlightText : T.ink } }, se.fmt(v)),
        );
      });
    });
    top += panel.height;
  });
  // x-axis labels
  opts.labels.forEach((lab, i) => {
    const hl = i === opts.highlight;
    // a label box centred on the dot, pulled inside the image at the edges
    const boxW = hl ? 130 : 100;
    const left = Math.max(2, Math.min(WIDTH - boxW - 2, xAt(i) - boxW / 2));
    texts.push(h("div", { key: `x${i}`, style: { position: "absolute", left: s(left), top: s(height - AXIS_H + 8), width: s(boxW), display: "flex", justifyContent: "center", fontSize: s(11), fontWeight: 700, color: hl ? T.highlightText : T.muted } }, hl ? `${lab} · this week` : lab));
  });

  const svgDoc = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">${svg.join("")}</svg>`;
  const img = h("img", { src: `data:image/svg+xml;base64,${Buffer.from(svgDoc).toString("base64")}`, width: s(WIDTH), height: s(height), style: { position: "absolute", left: 0, top: 0 } });
  const root = h("div", { style: { width: s(WIDTH), height: s(height), display: "flex", position: "relative", background: T.bg, fontFamily: "Manrope" } }, img, ...texts);
  // next/og's ImageResponse: Satori + resvg bundled with Next; the fonts are the Manrope files in public/fonts.
  const { ImageResponse } = await import("next/og");
  const res = new ImageResponse(root, { width: s(WIDTH), height: s(height), fonts: fonts() });
  const data = Buffer.from(await res.arrayBuffer());
  return { cid: opts.cid, filename: `${opts.cid}.png`, contentType: "image/png", data, width: WIDTH, height, alt: opts.alt };
}

/** The three trend charts for section 6: submissions and won together; dials; appointments booked. */
export async function renderTrendCharts(d: WeeklyReportData, theme: ReportTheme): Promise<ChartImage[]> {
  const weeks: TrendWeek[] = d.trend;
  const labels = weeks.map((w) => w.shortLabel);
  const highlight = weeks.length - 1;
  const T = THEMES[theme];
  const count = (v: number) => n(v);
  const subsWon = await chartPng({
    cid: "trend-submissions-won",
    title: "Combined Submissions & Won Opportunities",
    alt: `Combined submissions and won opportunities per week: ${weeks.map((w) => `${w.shortLabel} ${w.combined === null ? "n/a" : n(w.combined)} submissions, ${n(w.won)} won`).join("; ")}`,
    panels: [{ height: 190, series: [{ name: "Combined submissions", color: T.series[0], values: weeks.map((w) => w.combined), fmt: count }, { name: "Won opportunities", color: T.series[1], values: weeks.map((w) => w.won), fmt: count }] }],
    labels,
    highlight,
    theme,
  });
  const dials = await chartPng({
    cid: "trend-dials",
    title: "Dials",
    alt: `Dials per week: ${weeks.map((w) => `${w.shortLabel} ${n(w.dials)}`).join("; ")}`,
    panels: [{ height: 150, series: [{ name: "Dials", color: T.series[0], values: weeks.map((w) => w.dials), fmt: count }] }],
    labels,
    highlight,
    theme,
  });
  const booked = await chartPng({
    cid: "trend-booked",
    title: "Appointments Booked",
    alt: `Appointments booked per week: ${weeks.map((w) => `${w.shortLabel} ${w.booked === null ? "n/a" : n(w.booked)}`).join("; ")}`,
    panels: [{ height: 150, series: [{ name: "Appointments booked", color: T.series[1], values: weeks.map((w) => w.booked), fmt: count }] }],
    labels,
    highlight,
    theme,
  });
  return [subsWon, dials, booked];
}

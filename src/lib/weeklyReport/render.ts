// Renders the weekly report as a branded HTML email (table layout, inline
// styles, Intelagent colors from src/styles/tokens.css, VCN logo as an
// inline image) plus a plain-text alternative. Pure formatting: every figure
// arrives already computed in WeeklyReportData; the optional narrative adds
// the trend commentary, the projections wording, and the three tips.

import { fmtDateTime } from "@/lib/dates";
import { fmtValue, type Flag, type Headline, type Kind, type RepRow, type WeeklyReportData } from "./data";
import type { ReportTheme } from "./config";
import type { Narrative } from "./narrative";

export const LOGO_CID = "vcn-logo";

// Brand tokens (tokens.css): page #05080d, card surfaces #f4f7fb/#ffffff, ink #182536/#46566a/#5b6b7f,
// blue #1677ff, yellow #ffd51f, status good #15803d / warn #8a5b00 / bad #c62828 on light surfaces.
// Manrope where the client loads web fonts (Apple Mail, iPhone Mail, Outlook for Mac); Gmail and Outlook for Windows fall back to Helvetica Neue / Arial.
const FONT = "Manrope,'Helvetica Neue',Arial,sans-serif";
const FONT_URL = "https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap";
/** The email's colors. Light = the dashboard's light bands; dark = its dark bands (tokens.css). */
interface Palette {
  scheme: ReportTheme;
  page: string;
  card: string;
  /** CSS background-image for cards and the header ("" = flat). Clients that ignore it fall back to `card`. */
  cardImage: string;
  dark: string;
  inset: string;
  border: string;
  rowLine: string;
  neutralBg: string;
  ink: string;
  body: string;
  secondary: string;
  muted: string;
  /** Section kicker ("1 · Headline numbers"): muted on light, yellow on dark, as the dashboard's eyebrows. */
  kicker: string;
  onDark: string;
  headerSub: string;
  /** Rank badge and initials circle background. */
  badge: string;
  blue: string;
  /** In-progress goal bar fill: blue on light, cyan on dark (blue is too dim on navy). */
  bar: string;
  blueText: string;
  yellow: string;
  good: string;
  goodBg: string;
  warn: string;
  warnBg: string;
  bad: string;
  badBg: string;
  info: string;
  infoBg: string;
  /** Pace / projection markers on bars. */
  marker: string;
  /** Funnel bar colors, one blue step per stage (top to bottom). */
  funnel: string[];
}

const LIGHT: Palette = {
  scheme: "light",
  page: "#e4eaf1",
  card: "#ffffff",
  cardImage: "",
  dark: "#0c1d33",
  inset: "#f4f7fb",
  border: "#d0d9e4",
  rowLine: "#eef2f6",
  neutralBg: "#eef2f6",
  ink: "#182536",
  body: "#2f3f52",
  secondary: "#46566a",
  muted: "#5b6b7f",
  kicker: "#5b6b7f",
  onDark: "#ffffff",
  headerSub: "#aab6c4",
  badge: "#0c1d33",
  blue: "#1677ff",
  bar: "#1677ff",
  blueText: "#0f5fd1",
  yellow: "#ffd51f",
  good: "#15803d",
  goodBg: "#e6f4ea",
  warn: "#8a5b00",
  warnBg: "#fdf3d6",
  bad: "#c62828",
  badBg: "#fbe9e9",
  info: "#0f5fd1",
  infoBg: "#e8f0fe",
  marker: "#182536",
  funnel: ["#5598e7", "#3987e5", "#256abf", "#1c5cab", "#184f95"],
};

const DARK: Palette = {
  scheme: "dark",
  page: "#05080d",
  card: "#0c1d33",
  cardImage: "linear-gradient(135deg, #0f2342 0%, #091730 45%, #060d19 100%)",
  dark: "#0c1d33",
  inset: "#13263d",
  border: "#223750",
  rowLine: "#1b2e47",
  neutralBg: "#1c2f47",
  ink: "#ffffff",
  body: "#c6cfda",
  secondary: "#a7b3c2",
  muted: "#8b98a9",
  kicker: "#ffd51f",
  onDark: "#ffffff",
  headerSub: "#aab6c4",
  badge: "#1677ff",
  blue: "#1677ff",
  bar: "#19c6f4",
  blueText: "#7fb0ff",
  yellow: "#ffd51f",
  good: "#3ccf7a",
  goodBg: "#143826",
  warn: "#ffc83d",
  warnBg: "#3a2d0f",
  bad: "#ff7676",
  badBg: "#3d1c22",
  info: "#7fb0ff",
  infoBg: "#16294a",
  marker: "#ffffff",
  funnel: ["#7fb0ff", "#5a9cf5", "#3d86ea", "#2a79d6", "#1677ff"],
};

// The active palette and the table-cell styles derived from it. renderHtml sets them for the
// theme it was asked for and restores light afterwards; rendering is synchronous, so nothing
// else can observe the switch.
let C: Palette = LIGHT;
let TH = "";
let THL = "";
let TD = "";
let TDL = "";
let TDB = "";

function applyTheme(theme: ReportTheme): void {
  C = theme === "dark" ? DARK : LIGHT;
  TH = `style="font:700 11px/1.3 ${FONT};letter-spacing:0.04em;text-transform:uppercase;color:${C.muted};text-align:right;padding:6px 6px;border-bottom:1px solid ${C.border};white-space:nowrap"`;
  THL = TH.replace("text-align:right", "text-align:left");
  TD = `style="font:500 13px/1.35 ${FONT};color:${C.body};text-align:right;padding:7px 6px;border-bottom:1px solid ${C.rowLine}"`;
  TDL = TD.replace("text-align:right", "text-align:left");
  TDB = TD.replace("font:500", "font:800").replace(C.body, C.ink);
}
applyTheme("light");

/** Card surface: flat on light, the dashboard's deep-navy gradient on dark (with a flat fallback). */
function cardBg(): string {
  return `background:${C.card};${C.cardImage ? `background-image:${C.cardImage};` : ""}`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => v.toLocaleString("en-US");

interface Change {
  text: string;
  arrow: "▲" | "▼" | "■";
  color: string;
}

/** Week-over-week change for a value and its prior, in the metric's unit, colored by whether it is an improvement. */
export function change(kind: Kind, value: number | null, prev: number | null, lowerIsBetter = false): Change | null {
  if (value === null || prev === null) return null;
  const diff = value - prev;
  if (Math.abs(diff) < (kind === "pct" ? 0.005 : 0.5)) return { text: "no change", arrow: "■", color: C.muted };
  const good = lowerIsBetter ? diff < 0 : diff > 0;
  const abs = Math.abs(diff);
  let text: string;
  if (kind === "pct") text = `${Math.round(abs * 100)} pts`;
  else if (kind === "minutes") text = fmtValue("minutes", abs);
  else if (kind === "usd") text = fmtValue("usd", abs);
  else text = n(Math.round(abs));
  const pct = prev !== 0 && kind !== "pct" ? ` (${Math.round((abs / Math.abs(prev)) * 100)}%)` : "";
  return { text: `${diff > 0 ? "+" : "−"}${text}${pct}`, arrow: diff > 0 ? "▲" : "▼", color: good ? C.good : C.bad };
}

/** Goal cell: the goal and attainment, colored met / missed (or on track for the week in progress is not needed: the week is judged whole). */
function goalCell(h: Headline): { text: string; color: string } {
  if (h.goal === null) return { text: "no goal", color: C.muted };
  if (h.value === null) return { text: fmtValue(h.kind, h.goal), color: C.muted };
  const pct = h.goal > 0 ? Math.round((h.value / h.goal) * 100) : null;
  const goalText = h.kind === "count" ? n(Math.round(h.goal)) : fmtValue(h.kind, h.goal);
  return { text: `${goalText}${pct === null ? "" : ` · ${n(pct)}%`}`, color: h.value >= h.goal - 1e-9 ? C.good : C.bad };
}

/** "3h", "2 days", "6 weeks" for a wait in minutes. */
function waitText(minutes: number): string {
  const h = minutes / 60;
  if (h < 48) return `${Math.round(h)}h`;
  const d = h / 24;
  return d < 14 ? `${Math.round(d)} days` : `${Math.round(d / 7)} weeks`;
}

const levelColor = (l: Flag["level"]) => (l === "bad" ? { fg: C.bad, bg: C.badBg } : l === "warn" ? { fg: C.warn, bg: C.warnBg } : { fg: C.info, bg: C.infoBg });

// ---- HTML --------------------------------------------------------------------------------------

function section(kicker: string, title: string, body: string, subtitle?: string): string {
  return `<tr><td style="padding:0 0 12px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${cardBg()}border:1px solid ${C.border};border-radius:14px"><tr><td style="padding:18px 20px;font:500 13px/1.4 ${FONT};color:${C.body}">
<div style="font-size:11px;font-weight:700;line-height:1.2;letter-spacing:.12em;color:${C.kicker};margin-bottom:4px">${esc(kicker.toUpperCase())}</div>
<div style="font-size:18px;font-weight:800;line-height:1.15;letter-spacing:-.02em;color:${C.ink};margin-bottom:${subtitle ? "2px" : "12px"}">${esc(title)}</div>${subtitle ? `<div style="font-size:13px;font-weight:600;line-height:1.3;color:${C.muted};margin-bottom:12px">${esc(subtitle)}</div>` : ""}
${body}
</td></tr></table></td></tr>`;
}

function table(head: string[], rows: string[][], opts: { firstLeft?: boolean; boldFirst?: boolean } = { firstLeft: true }): string {
  const h = head.map((x, i) => `<th ${i === 0 && opts.firstLeft !== false ? THL : TH}>${x}</th>`).join("");
  const r = rows.map((cells) => `<tr>${cells.map((c, i) => `<td ${i === 0 && opts.firstLeft !== false ? (opts.boldFirst ? TDL.replace("font:500", "font:700") : TDL) : TD}>${c}</td>`).join("")}</tr>`).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><thead><tr>${h}</tr></thead><tbody>${r}</tbody></table>`;
}

function changeHtml(c: Change | null, unavailable?: string): string {
  if (!c) return `<span style="color:${C.muted}" title="${esc(unavailable ?? "")}">unavailable</span>`;
  return `<span style="color:${c.color};font-weight:700">${c.arrow} ${esc(c.text)}</span>`;
}

function note(text: string): string {
  return `<p style="font-size:12px;font-weight:400;line-height:1.5;color:${C.muted};margin:10px 0 0">${text}</p>`;
}

function pill(text: string, fg: string, bg: string): string {
  return `<span style="display:inline-block;font:700 11px/1 ${FONT};color:${fg};background:${bg};border-radius:999px;padding:5px 9px;white-space:nowrap">${esc(text)}</span>`;
}

function paragraph(text: string): string {
  return `<p style="font-size:14px;font-weight:400;line-height:1.55;color:${C.body};margin:0 0 10px">${esc(text)}</p>`;
}

/** A numbers-only "week in brief" for when the narrative is unavailable; every figure is copied from the data. */
export function briefFallback(d: WeeklyReportData): string {
  const h = (key: string) => d.headlines.find((x) => x.key === key)!;
  const c = h("combined");
  const goal = c.goal === null ? "" : ` of a ${n(Math.round(c.goal))} goal`;
  return `${fmtValue("count", c.value)} combined submissions${goal} (Army ${fmtValue("count", h("army").value)}, Veteran ${fmtValue("count", h("iau").value)}), ${fmtValue("count", h("booked").value)} appointments booked, ${fmtValue("count", h("newLeads").value)} leads created, ${fmtValue("count", h("won").value)} won.`;
}

// Size discipline (Gmail clips HTML over about 102 KB): every table cell that holds text sets the
// font family once, and the text inside uses <b>, <span>, <br>, and plain divs that inherit it.
// Nothing repeats the family on inline elements.

/** Small green / red / gray change pill vs last week (inherits the font family from its cell). */
function changePill(h: Headline): string {
  return changePillFor(h.kind, h.value, h.prev, h.lowerIsBetter);
}

function changePillFor(kind: Kind, value: number | null, prev: number | null, lowerIsBetter = false): string {
  const c = change(kind, value, prev, lowerIsBetter);
  const base = "display:inline-block;font-weight:700;font-size:11px;line-height:1;border-radius:999px;padding:4px 8px;white-space:nowrap;vertical-align:middle";
  if (!c) return `<span style="${base};color:${C.muted};background:${C.neutralBg}">no comparison</span>`;
  const bg = c.arrow === "■" ? C.neutralBg : c.color === C.good ? C.goodBg : C.badBg;
  return `<span style="${base};color:${c.color};background:${bg}">${c.arrow} ${esc(c.text)}</span>`;
}

/** An uppercase muted label; no font family (inherits from the cell). */
function label(text: string, px = 11, inheritColor = false): string {
  return `<b style="font-size:${px}px;letter-spacing:.08em${inheritColor ? "" : `;color:${C.muted}`}">${esc(text.toUpperCase())}</b>`;
}

/** A big figure. */
function big(text: string, px: number, color = C.ink): string {
  return `<b style="font-size:${px}px;line-height:1.1;letter-spacing:-.02em;color:${color}">${esc(text)}</b>`;
}

/** An inset tile: one cell that carries the font family, so everything inside inherits it. */
function box(inner: string, extra = "", padding = "12px 14px"): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.inset};border:1px solid ${C.border};border-radius:12px${extra}"><tr><td style="padding:${padding};font:500 12px/1.45 ${FONT};color:${C.secondary}">${inner}</td></tr></table>`;
}

/** Thin goal-progress bar (table cells, no images) with "x of goal · y%" under it; nothing without a goal. */
function goalBar(h: Headline): string {
  if (h.goal === null || h.goal <= 0) return "";
  const v = h.value ?? 0;
  const goalText = h.kind === "count" ? n(Math.round(h.goal)) : fmtValue(h.kind, h.goal);
  return `<div style="margin-top:8px">${bar(v / h.goal, v >= h.goal - 1e-9 ? C.good : C.bar)}</div><span style="font-size:11px;color:${C.muted}">${esc(fmtValue(h.kind, h.value))} of ${esc(goalText)} goal · ${n(Math.round((v / h.goal) * 100))}%</span>`;
}

/** "Opportunity Value $X (last week $Y)" for a headline that carries one; empty otherwise. */
function oppValueLine(h: Headline): string {
  const o = h.oppValue;
  if (!o) return "";
  return `Opportunity Value ${fmtValue("usd", o.value)}${o.prev !== null ? ` (last week ${fmtValue("usd", o.prev)})` : ""}`;
}

/** One KPI tile: label, big number, change pill, one or more sub-lines, goal bar when there is a goal. */
function tile(h: Headline, sub: string | string[]): string {
  const value = h.value === null ? `<b style="font-size:18px;color:${C.muted}" title="${esc(h.unavailable ?? "")}">unavailable</b>` : big(fmtValue(h.kind, h.value), 28);
  const subs = (Array.isArray(sub) ? sub : [sub]).filter(Boolean).map((s) => `<br>${esc(s)}`).join("");
  return box(`${label(h.label)}<div style="margin:6px 0 4px;line-height:1.3">${value} &nbsp;${changePill(h)}</div>${subs.replace(/^<br>/, "")}${goalBar(h)}`);
}

/** Inline-image id for a rep's photo (attached as cid:<id> in the email; served from /public in the browser preview). */
export function repPhotoCid(userId: string): string {
  return `rep-${userId.replace(/[^A-Za-z0-9]/g, "")}`;
}

/** The rep photos the HTML references, as {cid, publicPath} (publicPath like "/reps/jane-doe.jpg"). */
export function repPhotoAssets(d: WeeklyReportData): { cid: string; publicPath: string }[] {
  const seen = new Set<string>();
  const out: { cid: string; publicPath: string }[] = [];
  for (const r of d.reps) {
    if (!r.photo) continue;
    const cid = repPhotoCid(r.userId);
    if (seen.has(cid)) continue;
    seen.add(cid);
    out.push({ cid, publicPath: r.photo });
  }
  return out;
}

/** Round rep photo, or an initials circle when there is no photo. Plain img / table cell, so it renders everywhere. */
function avatar(r: { userId: string; photo: string | null; initials: string }, size: number): string {
  if (r.photo) return `<img src="cid:${repPhotoCid(r.userId)}" width="${size}" height="${size}" alt="${esc(r.initials)}" style="display:block;border-radius:50%;border:0">`;
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="${size}" height="${size}" align="center" valign="middle" bgcolor="${C.badge}" style="width:${size}px;height:${size}px;border-radius:50%;font:800 ${Math.round(size * 0.36)}px/1 ${FONT};color:${C.onDark}">${esc(r.initials)}</td></tr></table>`;
}

/** Green at or above goal, yellow from half, red below half (the leaderboard's attainment colors). */
function attainColor(att: number | null): string {
  if (att === null) return C.border;
  return att >= 1 ? C.good : att >= 0.5 ? C.yellow : C.bad;
}

/** Thin bar filled to `pct` (0 to 1, more is capped) in `color`; table cells only, no images. */
function bar(pct: number, color: string, height = 6): string {
  const fill = Math.max(pct > 0 ? 2 : 0, Math.min(100, Math.min(100, Math.round(pct * 100))));
  const s = "font-size:0;line-height:0";
  const open = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>`;
  if (fill === 0) return `${open}<td height="${height}" bgcolor="${C.border}" style="${s}">&nbsp;</td></tr></table>`;
  if (fill >= 100) return `${open}<td height="${height}" bgcolor="${color}" style="${s}">&nbsp;</td></tr></table>`;
  return `${open}<td height="${height}" width="${fill}%" bgcolor="${color}" style="${s}">&nbsp;</td><td height="${height}" bgcolor="${C.border}" style="${s}">&nbsp;</td></tr></table>`;
}

/** A numbers-only sentence on the spread across reps for when the narrative is unavailable; every figure is copied from the data. */
export function leaderboardFallback(d: WeeklyReportData): string {
  if (d.reps.length === 0) return "No sales reps are configured.";
  const top = d.reps[0];
  const bottom = d.reps[d.reps.length - 1];
  const met = d.reps.filter((r) => r.attainment !== null && r.attainment >= 1).length;
  return `${top.name} led with ${n(top.combined)} submissions and ${bottom.name} had ${n(bottom.combined)}; ${n(met)} of ${n(d.reps.length)} reps met their weekly goal.`;
}

/** A small labelled statistic cell for mini rows (label, value, optional sub-line); the cell carries the font. */
function statCell(title: string, value: string, sub: string, width: string, last: boolean): string {
  return `<td width="${width}" valign="top" style="padding:8px 6px 8px 10px;${last ? "" : `border-right:1px solid ${C.border};`}font:500 11px/1.4 ${FONT};color:${C.muted}">${label(title, 10, true)}<br><b style="font-size:15px;color:${C.ink}">${esc(value)}</b>${sub ? `<br>${esc(sub)}` : ""}</td>`;
}

/**
 * A progress bar made of table cells (no images): filled to `fillPct` (0..1) in `color`, with an
 * optional solid marker (where pace should be) and an optional hollow marker (a projection),
 * each given as 0..1 of the track. Anything past the end of the track is pinned to the end.
 */
function markedBar(fillPct: number, color: string, opts: { solid?: number | null; hollow?: number | null; height?: number } = {}): string {
  const h = opts.height ?? 8;
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v * 100)));
  const f = clamp(fillPct);
  const marks: { at: number; kind: "solid" | "hollow" }[] = [];
  if (typeof opts.solid === "number") marks.push({ at: clamp(opts.solid), kind: "solid" });
  if (typeof opts.hollow === "number") marks.push({ at: clamp(opts.hollow), kind: "hollow" });
  marks.sort((a, b) => a.at - b.at);
  const segs: { w: number; kind: "fill" | "track" | "solid" | "hollow" }[] = [];
  let pos = 0;
  const advance = (to: number) => {
    if (to <= pos) return;
    if (pos < f && to > f) {
      segs.push({ w: f - pos, kind: "fill" });
      segs.push({ w: to - f, kind: "track" });
    } else segs.push({ w: to - pos, kind: pos < f ? "fill" : "track" });
    pos = to;
  };
  for (const m of marks) {
    const at = Math.max(pos, Math.min(m.at, 97));
    advance(at);
    segs.push({ w: 3, kind: m.kind });
    pos = at + 3;
  }
  advance(100);
  const base = "font-size:0;line-height:0";
  const cells = segs
    .map((s) => {
      if (s.kind === "hollow") return `<td width="${s.w}%" height="${h}" style="${base};border:2px solid ${C.marker};background:transparent">&nbsp;</td>`;
      const bg = s.kind === "fill" ? color : s.kind === "solid" ? C.marker : C.border;
      return `<td width="${s.w}%" height="${h}" bgcolor="${bg}" style="${base}">&nbsp;</td>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${cells}</tr></table>`;
}

/** Green at or above the quota, yellow from half, red below half (the pace table's rule). */
function paceColor(pct: number | null): string {
  return pct === null ? C.border : pct >= 1 ? C.good : pct >= 0.5 ? C.yellow : C.bad;
}

/** Drops the newlines and indentation between tags and shortens #ffffff; the HTML is for machines, the plain-text part is for people. */
function minify(html: string): string {
  return html.replace(/>\s*\n\s*</g, "><").replace(/#ffffff/g, "#fff");
}

export function renderHtml(d: WeeklyReportData, narrative: Narrative | null, theme: ReportTheme = "light"): string {
  applyTheme(theme);
  try {
    return minify(renderHtmlBody(d, narrative));
  } finally {
    applyTheme("light");
  }
}

function renderHtmlBody(d: WeeklyReportData, narrative: Narrative | null): string {
  const dash = d.dashboardUrl;
  const link = (path: string, label: string) => (dash ? `<a href="${esc(dash + path)}" style="color:${C.blueText};font-weight:700">${esc(label)}</a>` : esc(label));
  const parts: string[] = [];

  // 1. headline numbers: week in brief, six KPI tiles in three rows (submissions and won; Army and Veteran submissions; booked and leads created), one-line note
  const H = (key: string) => d.headlines.find((x) => x.key === key)!;
  const brief = narrative?.brief ?? briefFallback(d);
  const briefHtml = `<div style="border-left:4px solid ${C.yellow};background:${C.inset};border-radius:0 10px 10px 0;padding:10px 14px;margin:0 0 14px;font-size:15px;font-weight:600;line-height:1.45;color:${C.ink}">${esc(brief)}</div>`;
  const wonValue = H("wonValue");
  const iau = H("iau");
  const semesterLine = (iau.parts ?? []).map((p) => `${p.short} ${fmtValue("count", p.value)}`).join(" · ");
  const tileRows = [
    [tile(H("combined"), oppValueLine(H("combined"))), tile(H("won"), `Opportunity Value ${fmtValue("usd", wonValue.value)}${wonValue.prev !== null ? ` (last week ${fmtValue("usd", wonValue.prev)})` : ""}`)],
    [tile(H("army"), oppValueLine(H("army"))), tile(iau, [semesterLine, oppValueLine(iau)])],
    [tile(H("booked"), `last week ${fmtValue("count", H("booked").prev)}`), tile(H("newLeads"), `last week ${fmtValue("count", H("newLeads").prev)}`)],
  ];
  const tileTable = (rows: string[][]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.map((r) => `<tr>${r.map((t, i) => `<td width="50%" valign="top" style="padding:0 ${i === 0 ? "5px" : "0"} 10px ${i === 0 ? "0" : "5px"}">${t}</td>`).join("")}</tr>`).join("")}</table>`;
  parts.push(section("1 · Headline numbers", d.rangeShort, briefHtml + tileTable(tileRows) + note(`Goals are the dashboard's weekly rates summed across reps${d.partial ? ", pro-rated to the week so far" : ""}; change is against the previous Monday-to-Sunday week${d.partial ? " over the same elapsed portion" : ""}; submissions count CA 101 plus IAU App for every semester.`), `vs ${d.prevRangeShort}`));

  // 2. leaderboard: two highlight tiles with photos, one sentence on the spread, then one full-width card per rep
  const highlight = (title: string, r: RepRow | null, line: string, empty: string) =>
    box(`${label(title)}<div style="margin-top:6px">${r ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="middle" style="padding:0 10px 0 0">${avatar(r, 40)}</td><td valign="middle" style="font:500 12px/1.4 ${FONT};color:${C.secondary}"><b style="font-size:15px;color:${C.ink}">${esc(r.name)}</b><br>${esc(line)}</td></tr></table>` : esc(empty)}</div>`, "", "10px 12px");
  const tp = d.topPerformer;
  const bi = d.biggestImprover;
  const calloutsHtml = tileTable([[highlight("Top performer", tp, tp ? `${n(tp.combined)} submissions · ${n(tp.dials)} dials · ${n(tp.booked)} booked` : "", "No rep submitted or dialed this week."), highlight("Biggest improver", bi?.rep ?? null, bi ? `+${n(bi.delta)} submissions vs last week (${n(bi.rep.combinedPrev ?? 0)} → ${n(bi.rep.combined)})` : "", "No rep submitted more than last week.")]]);
  const spreadHtml = paragraph(narrative?.leaderboard ?? leaderboardFallback(d));
  const cellFont = `font:500 12px/1.4 ${FONT};color:${C.secondary}`;
  const repCards = d.reps.map((r) => {
    const att = r.attainment;
    const goalText = r.combinedGoal === null ? "no goal" : `of ${n(Math.round(r.combinedGoal))} goal`;
    const hero =
      `<div style="line-height:1.3">${big(n(r.combined), 30)} <span style="font-weight:600;font-size:13px;color:${C.muted}">${esc(goalText)}</span> &nbsp;${changePillFor("count", r.combined, r.combinedPrev)}</div>` +
      (r.combinedGoal !== null && r.combinedGoal > 0 ? `<div style="margin:8px 0 4px">${bar(r.combined / r.combinedGoal, attainColor(att))}</div>` : "") +
      (att === null ? "" : `<b style="font-size:11px;color:${att >= 1 ? C.good : att >= 0.5 ? C.warn : C.bad}">${n(Math.round(att * 100))}% of goal</b><br>`) +
      `<b style="font-size:13px;color:${C.ink}">Army ${n(r.ca101)} · Veteran ${n(r.iau)}</b>`;
    const left = `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="middle" style="padding:0 8px 0 0;font:800 16px/1 ${FONT};color:${C.muted}">${n(r.rank)}</td><td valign="middle">${avatar(r, 48)}</td></tr></table><div style="margin-top:8px;line-height:1.3"><b style="font-size:15px;color:${C.ink}">${esc(r.name)}</b><br><span style="font-weight:600;font-size:11px;color:${C.muted}">${esc(r.role.toLowerCase())}</span></div>`;
    const dialsSub = r.dialsGoal !== null && r.dialsGoal > 0 ? `of ${n(Math.round(r.dialsGoal))} · ${n(Math.round((r.dials / r.dialsGoal) * 100))}%` : "no goal";
    const miniRow = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid ${C.border}"><tr>${statCell("Dials", n(r.dials), dialsSub, "25%", false)}${statCell("Talk time", fmtValue("minutes", r.talkMinutes), "", "25%", false)}${statCell("Appointments booked", n(r.booked), "", "25%", false)}${statCell("Won", n(r.won), r.won > 0 ? `${fmtValue("usd", r.wonValue)} Opportunity Value` : "", "25%", true)}</tr></table>`;
    const showLine =
      r.showRate === null
        ? ""
        : `<tr><td colspan="2" style="padding:0 14px 10px;${cellFont}"><div style="padding-top:8px;border-top:1px solid ${C.border}">Show rate <b style="color:${C.ink}">${esc(fmtValue("pct", r.showRate))}</b> · ${n(r.showed)} showed of ${n(r.showed + r.noshow)} marked${r.showRatePrev !== null ? ` (last week ${esc(fmtValue("pct", r.showRatePrev))})` : ""}</div></td></tr>`;
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.inset};border:1px solid ${C.border};border-radius:12px;margin-bottom:10px"><tr><td width="150" valign="top" style="padding:14px 10px 12px 14px;${cellFont}">${left}</td><td valign="top" style="padding:14px 14px 12px 6px;${cellFont}">${hero}</td></tr><tr><td colspan="2" style="padding:0 8px${r.showRate === null ? " 4px" : ""}">${miniRow}</td></tr>${showLine}</table>`;
  });
  parts.push(
    section(
      "2 · Rep leaderboard",
      "Ranked by combined submissions",
      calloutsHtml + spreadHtml + repCards.join("") + note("Submissions = CA 101 + IAU App (every semester) credited to the rep; the goal is the rep's own weekly rate (green at goal, yellow from half, red below half). Show rate is of the rep's appointments scheduled this week that were marked, shown only when there were any. Won is Opportunity Value, not cash."),
    ),
  );

  // 3. month-to-date pace: team hero tile with a pace marker, the narrative, one slim row per rep, semester tiles
  const p = d.pace;
  const t = p.team;
  const teamPct = t.quota > 0 ? t.mtd / t.quota : null;
  const needText = (mtd: number, quota: number, need: number | null) => (need === null ? (quota > 0 && mtd >= quota ? "quota met" : "no working days left") : `${need.toFixed(1)}/day`);
  const expected = p.expectedToday;
  const heroHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.inset};border:1px solid ${C.border};border-radius:12px;margin-bottom:12px"><tr><td style="padding:14px 14px 10px;font:500 11px/1.4 ${FONT};color:${C.muted}">${label(`Team · ${p.monthShort}`, 11, true)}<div style="margin:6px 0 10px;line-height:1.3">${big(n(t.mtd), 30)} <span style="font-weight:600;font-size:14px">of ${n(t.quota)} quota${teamPct === null ? "" : ` · ${n(Math.round(teamPct * 100))}%`}</span></div>${markedBar(teamPct ?? 0, paceColor(teamPct), { solid: expected !== null && t.quota > 0 ? expected / t.quota : null, height: 10 })}<div style="margin-top:4px">${expected !== null ? `▮ marker = on pace today (${n(Math.round(expected))} after ${n(p.workingDaysElapsed)} of ${n(p.workingDaysTotal)} working days)` : "no quota configured"}${t.othersMtd > 0 ? ` · plus ${n(t.othersMtd)} by users who are not configured reps` : ""}</div></td></tr><tr><td style="padding:0 4px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid ${C.border}"><tr>${statCell("Projected month-end", t.projected === null ? "unavailable" : n(t.projected), "at the current pace", "34%", false)}${statCell("Needed per working day", needText(t.mtd, t.quota, t.neededPerDay), "to reach quota", "33%", false)}${statCell("Working days left", n(p.workingDaysRemaining), `of ${n(p.workingDaysTotal)} this month`, "33%", true)}</tr></table></td></tr></table>`;
  const colHead = `padding:0 0 4px;font:700 10px/1.2 ${FONT};letter-spacing:.06em;color:${C.muted}`;
  const repPaceRows = p.reps
    .map((r, i) => {
      const pct = r.quotaPct;
      const proj = r.projected !== null && r.quota > 0 ? r.projected / r.quota : null;
      return `<tr${i ? ` style="border-top:1px solid ${C.border}"` : ""}><td width="32" valign="middle" style="padding:8px 8px 8px 0">${avatar(r, 32)}</td><td width="112" valign="middle" style="padding:8px 8px 8px 0;font:600 11px/1.3 ${FONT};color:${C.muted}"><b style="font-size:13px;color:${C.ink}">${esc(r.name)}</b><br>${esc(r.role.toLowerCase())}</td><td valign="middle" style="padding:8px 8px 8px 0;font:600 11px/1.4 ${FONT};color:${C.secondary}">${markedBar(pct ?? 0, paceColor(pct), { hollow: proj })}<div style="margin-top:4px">${n(r.mtd)} / ${n(r.quota)} quota${pct === null ? "" : ` · ${n(Math.round(pct * 100))}%`} · need ${esc(needText(r.mtd, r.quota, r.neededPerDay))}${r.projected !== null ? ` · ▢ projected ${n(r.projected)}` : ""}</div></td><td width="104" align="right" valign="middle" style="padding:8px 0 8px 6px;font:500 10px/1.3 ${FONT};color:${C.muted}"><b style="font-size:13px">${r.commissionMtd === null ? "—" : esc(fmtValue("usd", r.commissionMtd))}</b><br>${esc(r.commissionLabel)}</td></tr>`;
    })
    .join("");
  const repPaceHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td colspan="3" style="${colHead}">SUBMISSIONS VS MONTHLY QUOTA</td><td align="right" style="${colHead}">EST. COMMISSION</td></tr>${repPaceRows}</table>`;
  const semTile = (s: (typeof p.semesters)[number]) =>
    box(`${label(s.label)}<div style="margin:6px 0;white-space:nowrap">${big(fmtValue("count", s.submittedMtd), 24)} <span style="font-weight:600;font-size:11px;color:${C.muted}">submitted</span> &nbsp; ${big(fmtValue("count", s.acceptedMtd), 24)} <span style="font-weight:600;font-size:11px;color:${C.muted}">accepted</span></div><span style="font-size:11px;color:${C.muted}">month to date · since ${esc(p.toDateSince ?? "tracking began")}: ${esc(fmtValue("count", s.submittedToDate))} submitted, ${esc(fmtValue("count", s.acceptedToDate))} accepted</span>`);
  const semTiles = p.semesters.map(semTile);
  const semRowsHtml: string[][] = [];
  for (let i = 0; i < semTiles.length; i += 2) semRowsHtml.push(semTiles.slice(i, i + 2));
  parts.push(
    section(
      "3 · Month-to-date pace",
      p.monthShort,
      heroHtml +
        (narrative ? paragraph(narrative.projections) : "") +
        repPaceHtml +
        `<div style="font-size:14px;font-weight:800;line-height:1.3;color:${C.ink};margin:14px 0 8px">Semester totals (Veteran G.I. Bill)</div>` +
        tileTable(semRowsHtml) +
        `<div style="font-size:13px;font-weight:700;line-height:1.4;color:${C.ink};margin-top:2px">Estimated commission to date: ${esc(fmtValue("usd", p.commissionMtd))} <span style="font-weight:500;color:${C.muted}">(estimates from dashboard counts; the official calculation is done outside the dashboard)</span></div>` +
        note("Projection = month-to-date submissions ÷ working days elapsed × working days in the month (Monday to Friday); need/day = the gap to quota over the working days left; the pace marker = quota × working days elapsed ÷ working days in the month; quota and commission count every semester."),
      `as of ${fmtDateTime(p.asOf)}`,
    ),
  );

  // 4. funnel: five bars shrinking with the count, the step-to-step rate between them, last week beside each; two cohort cards
  const steps = d.funnel.steps;
  const maxCur = Math.max(1, ...steps.map((s) => s.cur ?? 0));
  const ratePct = (a: number | null, b: number | null) => (a === null || b === null || b <= 0 ? null : Math.round((a / b) * 100));
  const shortLabel = (text: string) => text.replace(/\s*\(.*\)\s*$/, "");
  const funnelRows = steps
    .map((s, i) => {
      const w = s.cur === null ? 0 : Math.max(12, Math.round((s.cur / maxCur) * 100));
      const color = C.funnel[Math.min(i, C.funnel.length - 1)];
      const barCells =
        s.cur === null
          ? `<td style="font:600 12px/1.3 ${FONT};color:${C.muted}" title="${esc(s.unavailable ?? "")}">unavailable</td>`
          : `<td width="${w}%" height="24" bgcolor="${color}" style="height:24px;border-radius:4px;font-size:0;line-height:0">&nbsp;</td><td style="font:800 14px/24px ${FONT};color:${C.ink};padding:0 0 0 8px;white-space:nowrap">${n(s.cur)}</td>`;
      const barRow = `<tr><td width="150" valign="middle" style="padding:5px 10px 5px 0;font:700 12px/1.3 ${FONT};color:${C.ink}">${esc(shortLabel(s.label))}</td><td valign="middle" style="padding:5px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${barCells}<td align="right" style="font:500 11px/1.3 ${FONT};color:${C.muted};padding:0 0 0 10px;white-space:nowrap">last wk ${esc(fmtValue("count", s.prev))}</td></tr></table></td></tr>`;
      if (i === 0) return barRow;
      const cur = ratePct(s.cur, steps[i - 1].cur);
      const prev = ratePct(s.prev, steps[i - 1].prev);
      // A step that can exceed the one above it (Won includes Army CA, which never passes IAU Accepted) has no step-to-step rate.
      const subset = (cur === null || cur <= 100) && (prev === null || prev <= 100);
      const rateText = subset
        ? `↓ ${cur === null ? "—" : `${n(cur)}%`} of the step above <span style="font-weight:500;color:${C.muted}">(last wk ${prev === null ? "—" : `${n(prev)}%`})</span>`
        : `↓ <span style="font-weight:500;color:${C.muted}">n/a: not a subset of the step above (Won includes Army CA, which never passes IAU Accepted)</span>`;
      return `<tr><td></td><td style="padding:0;font:600 11px/1.3 ${FONT};color:${C.secondary}">${rateText}</td></tr>` + barRow;
    })
    .join("");
  const funnelHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:12px">${funnelRows}</table>`;
  const cohortCard = (c: (typeof d.funnel.cohort)[number]) => {
    const pct = (v: number) => (c.leads > 0 ? `${n(Math.round((v / c.leads) * 100))}%` : "—");
    return box(`${label(c.label, 10)}<div style="margin:2px 0">${big(n(c.leads), 18)} <span style="font-weight:600;font-size:11px;color:${C.muted}">leads</span></div>${n(c.appointment)} booked an appointment (${pct(c.appointment)}) · ${n(c.submitted)} submitted (${pct(c.submitted)}) · ${n(c.won)} won (${pct(c.won)})${c.historyUnavailable > 0 ? ` · history unavailable for ${n(c.historyUnavailable)}` : ""}`, "", "10px 12px");
  };
  const cohortTiles = d.funnel.cohort.slice(0, 2).map(cohortCard);
  parts.push(
    section(
      "4 · Funnel conversion",
      "Leads → appointments → submissions → accepted → won",
      funnelHtml +
        (cohortTiles.length ? `<div style="font-size:14px;font-weight:800;line-height:1.3;color:${C.ink};margin:0 0 8px">Matched cohorts (Lead Outcomes), as of today</div>` + tileTable([cohortTiles]) : "") +
        note("Each bar is the week's own event count (different contacts at each step), so read the funnel as throughput, not one group followed through; the cohort cards do follow one week's new leads. Submissions = CA 101 + IAU App, Accepted = IAU App Accepted, Won = Army CA + Veteran G.I. Bill, every semester."),
    ),
  );

  // 5. pipeline health: six tiles, left edge colored by severity (thresholds in the note)
  const ph = d.pipeline;
  const share = (num: number, den: number) => (den > 0 ? num / den : 0);
  type Sev = "good" | "warn" | "bad";
  const sevColor = (s: Sev) => (s === "good" ? C.good : s === "warn" ? C.yellow : C.bad);
  const bucketText = ph.approval.buckets
    .filter((b) => b.count > 0)
    .map((b) => `${n(b.count)} ${b.label}`)
    .join(", ");
  const healthTiles: { label: string; value: string; sub: string; sev: Sev }[] = [
    {
      label: "Stale leads",
      value: n(ph.stale.count),
      sub: `in New Lead over ${n(ph.stale.staleAfterDays)} days${ph.stale.byUser.length ? ` · ${ph.stale.byUser.slice(0, 3).map((u) => `${u.name} ${n(u.count)}`).join(", ")}` : ""}${ph.stale.estimated ? ` · ${n(ph.stale.estimated)} estimated from creation time` : ""}`,
      sev: ph.stale.count === 0 ? "good" : share(ph.stale.count, ph.untouched.cohort) <= 0.05 ? "warn" : "bad",
    },
    {
      label: `Untouched ${n(ph.untouched.days)} days`,
      value: n(ph.untouched.count),
      sub: `of ${n(ph.untouched.cohort)} leads with no call, SMS, or email in the last ${n(ph.untouched.days)} days`,
      sev: share(ph.untouched.count, ph.untouched.cohort) < 0.25 ? "good" : share(ph.untouched.count, ph.untouched.cohort) < 0.5 ? "warn" : "bad",
    },
    {
      label: "Awaiting supervisor approval",
      value: n(ph.approval.inStage),
      sub: `${fmtValue("usd", ph.approval.value)} Opportunity Value${ph.approval.oldestDays !== null ? ` · oldest ${n(Math.round(ph.approval.oldestDays))} days` : ""}${bucketText ? ` · ${bucketText}` : ""}${ph.approval.unknownAge ? ` · ${n(ph.approval.unknownAge)} with no stage-entry time` : ""}`,
      sev: ph.approval.inStage === 0 || ph.approval.oldestDays === null || ph.approval.oldestDays < 7 ? "good" : ph.approval.oldestDays < 14 ? "warn" : "bad",
    },
    {
      label: "Unassigned leads",
      value: n(ph.unassigned.fourWeeks),
      sub: `of the last four weeks' new leads · ${n(ph.unassigned.thisWeek)} from this week`,
      sev: ph.unassigned.fourWeeks === 0 ? "good" : share(ph.unassigned.fourWeeks, ph.untouched.cohort) <= 0.01 ? "warn" : "bad",
    },
    {
      label: "Dead-end / lost",
      value: n(ph.deadEnd.parked),
      sub: `parked in a dead-end stage · ${n(ph.deadEnd.lost)} lost · ${n(ph.deadEnd.stillNewLead)} still in New Lead · of ${n(ph.deadEnd.cohort)} leads`,
      sev: share(ph.deadEnd.parked, ph.deadEnd.cohort) < 0.05 ? "good" : share(ph.deadEnd.parked, ph.deadEnd.cohort) < 0.15 ? "warn" : "bad",
    },
    {
      label: "Stale conversations",
      value: n(ph.staleConversations.conversations),
      sub: `${n(ph.staleConversations.unread)} unread inbound messages waiting over ${n(ph.staleConversations.afterMinutes)} min${ph.staleConversations.oldestMinutes !== null ? ` · oldest ${waitText(ph.staleConversations.oldestMinutes)}` : ""}`,
      sev: ph.staleConversations.conversations === 0 ? "good" : ph.staleConversations.conversations < 10 ? "warn" : "bad",
    },
  ];
  const healthTile = (x: (typeof healthTiles)[number]) => box(`${label(x.label)}<div style="margin:6px 0 4px">${big(x.value, 26)}</div><span style="font-size:11px">${esc(x.sub)}</span>`, `;border-left:4px solid ${sevColor(x.sev)}`);
  const healthRows: string[][] = [];
  for (let i = 0; i < healthTiles.length; i += 2) healthRows.push(healthTiles.slice(i, i + 2).map(healthTile));
  parts.push(
    section(
      "5 · Pipeline health",
      `Leads created ${ph.windowShort}`,
      tileTable(healthRows) +
        note(
          "Stale, untouched, unassigned, and dead-end figures follow the Leads row rules (config/leads.json) over leads created in the last four weeks; approval aging uses GHL's stage-entry time. Edge color green / yellow / red: stale leads none / up to 5% of the leads / more; untouched under 25% / under 50% / more; approval oldest under 7 / under 14 / more days; unassigned none / up to 1% / more; dead-end under 5% / under 15% / more parked; stale conversations none / under 10 / more.",
        ),
      "Snapshot as of the last sync",
    ),
  );

  // 6. trend
  const trendRows = d.trend.map((w, i) => {
    const last = i === d.trend.length - 1;
    const b = (s: string) => (last ? `<b style="color:${C.ink}">${s}</b>` : s);
    return [`<span style="font-weight:700;color:${C.ink}">${esc(w.label)}${last ? ` <span style="color:${C.blueText}">(this week)</span>` : ""}</span>`, b(esc(fmtValue("count", w.combined))), b(n(w.dials)), b(esc(fmtValue("minutes", w.talkMinutes))), b(esc(fmtValue("count", w.booked))), b(esc(fmtValue("count", w.completed))), b(esc(fmtValue("pct", w.showRate))), b(esc(fmtValue("count", w.newLeads))), b(`${n(w.won)}${w.wonValue > 0 ? ` · ${esc(fmtValue("usd", w.wonValue))}` : ""}`)];
  });
  parts.push(section("6 · Four-week trend", "Headline metrics by week", (narrative ? paragraph(narrative.trend) : "") + table(["Week", "Subs", "Dials", "Talk", "Booked", "Showed", "Show rate", "Leads", "Won"], trendRows)));

  // 7. flags
  const flagsHtml = d.flags.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${d.flags
        .map((f) => {
          const c = levelColor(f.level);
          return `<tr><td style="padding:0 0 8px"><div style="background:${c.bg};border-left:4px solid ${c.fg};border-radius:8px;padding:9px 12px;font:500 13px/1.45 ${FONT};color:${C.body}"><b style="color:${c.fg};text-transform:uppercase;font-size:11px;letter-spacing:0.06em">${f.level === "bad" ? "Attention" : f.level === "warn" ? "Watch" : "Note"}</b> &nbsp;${esc(f.text)}</div></td></tr>`;
        })
        .join("")}</table>`
    : paragraph("Nothing to flag this week: every rep is at or above half of goal, show rates held, no bounces or opt-outs, no unmarked past appointments, and every sync finished.");
  parts.push(section("7 · Flags", "What needs attention", flagsHtml));

  // 8. tips
  const tipsHtml = narrative
    ? `<ol style="font:400 14px/1.55 ${FONT};color:${C.body};margin:0;padding-left:20px">${narrative.tips.map((t) => `<li style="margin:0 0 8px">${esc(t)}</li>`).join("")}</ol>` + note(`Written by ${esc(narrative.model)} from the numbers above; every figure it mentions was checked against the data.`)
    : paragraph("Tips are unavailable this week: the narrative could not be generated, so this email shows the numbers only.");
  parts.push(section("8 · Three tips for the coming week", "From this week's numbers", tipsHtml));

  // 9. footer
  const footer = `<tr><td style="padding:4px 4px 0">
<div style="font:400 12px/1.6 ${FONT};color:${C.muted}">
<b style="color:${C.secondary}">Period:</b> ${esc(d.rangeText)} (Monday to Sunday, America/New_York)${d.partial ? ", week in progress" : ""} · <b style="color:${C.secondary}">Compared with:</b> ${esc(d.prevRangeText)}<br>
<b style="color:${C.secondary}">Data as of:</b> ${d.dataAsOf ? esc(fmtDateTime(d.dataAsOf)) : "no completed sync"} (last successful sync) · generated ${esc(fmtDateTime(d.generatedAt))}<br>
${link("/?range=last_week", "Open the live dashboard")} · ${link("/mapping", "Mapping page (sync status and definitions)")}<br>
${d.notes.map((x) => esc(x)).join("<br>")}
<br>Read-only view of Go High Level. This dashboard never changes CRM data.
</div></td></tr>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="${C.scheme}"><meta name="supported-color-schemes" content="${C.scheme}"><!--[if !mso]><!--><link rel="preconnect" href="https://fonts.googleapis.com"><link href="${FONT_URL}" rel="stylesheet"><style>@import url('${FONT_URL}');</style><!--<![endif]--><title>${esc(`VCN Weekly Sales Report: ${d.rangeText}`)}</title></head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%">
<tr><td style="padding:0 0 12px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.dark};${C.cardImage ? `background-image:${C.cardImage};border:1px solid ${C.border};` : ""}border-radius:14px"><tr>
<td style="padding:18px 20px" valign="middle"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td valign="middle" style="padding-right:12px"><img src="cid:${LOGO_CID}" width="44" height="44" alt="Veteran Careers Network" style="display:block;border:0;border-radius:8px"></td>
<td valign="middle"><div style="font:800 20px/1.15 ${FONT};letter-spacing:-0.02em;color:${C.onDark}">VCN Weekly Sales Report</div><div style="font:700 13px/1.4 ${FONT};color:${C.yellow}">${esc(d.rangeText)}</div><div style="font:500 11px/1.4 ${FONT};color:${C.headerSub}">by Intelagent Media · data as of ${d.dataAsOf ? esc(fmtDateTime(d.dataAsOf)) : "no completed sync"}</div></td>
</tr></table></td></tr></table></td></tr>
${parts.join("\n")}
${footer}
</table></td></tr></table>
</body></html>`;
}

// ---- plain text ---------------------------------------------------------------------------------

function pad(s: string, w: number, right = false): string {
  const t = s.length > w ? s.slice(0, w - 1) + "…" : s;
  return right ? t.padStart(w) : t.padEnd(w);
}

function textTable(head: string[], rows: string[][], widths: number[]): string {
  const line = (cells: string[]) => cells.map((c, i) => pad(c, widths[i], i > 0)).join("  ");
  return [line(head), widths.map((w) => "-".repeat(w)).join("  "), ...rows.map(line)].join("\n");
}

export function renderText(d: WeeklyReportData, narrative: Narrative | null): string {
  const out: string[] = [];
  const H = (s: string) => out.push("", s.toUpperCase(), "=".repeat(s.length));
  out.push(`VCN WEEKLY SALES REPORT`, `${d.rangeText} (Monday to Sunday, America/New_York)${d.partial ? ", week in progress" : ""}`, `Compared with ${d.prevRangeText}. Data as of ${d.dataAsOf ? fmtDateTime(d.dataAsOf) : "no completed sync"}.`);

  H("1. Headline numbers");
  out.push(narrative?.brief ?? briefFallback(d), "");
  const chg = (kind: Kind, v: number | null, p: number | null, lower?: boolean) => {
    const c = change(kind, v, p, lower);
    return c ? `${c.arrow === "■" ? "=" : c.arrow === "▲" ? "+" : "-"} ${c.text.replace(/^[+−]/, "")}` : "n/a";
  };
  const rows: string[][] = [];
  for (const h of d.headlines) {
    const g = goalCell(h);
    rows.push([h.label, fmtValue(h.kind, h.value), h.prevUnavailable && h.prev === null ? "n/a" : fmtValue(h.kind, h.prev), chg(h.kind, h.value, h.prev, h.lowerIsBetter), g.text]);
    for (const p of h.parts ?? []) rows.push([`  - ${p.label}`, fmtValue(h.kind, p.value), fmtValue(h.kind, p.prev), chg(h.kind, p.value, p.prev), ""]);
    if (h.oppValue) rows.push(["  Opportunity Value", fmtValue("usd", h.oppValue.value), h.oppValue.prev === null ? "n/a" : fmtValue("usd", h.oppValue.prev), chg("usd", h.oppValue.value, h.oppValue.prev), ""]);
  }
  out.push(textTable(["Metric", "This wk", "Last wk", "Change", "Goal"], rows, [34, 10, 10, 16, 16]));

  H("2. Rep leaderboard");
  if (d.topPerformer) out.push(`Top performer: ${d.topPerformer.name} (${n(d.topPerformer.combined)} submissions, ${n(d.topPerformer.dials)} dials, ${n(d.topPerformer.booked)} booked)`);
  out.push(d.biggestImprover ? `Biggest improver: ${d.biggestImprover.rep.name} (+${n(d.biggestImprover.delta)} submissions vs last week)` : "Biggest improver: no rep submitted more than last week.");
  out.push(narrative?.leaderboard ?? leaderboardFallback(d), "");
  out.push(
    textTable(
      ["Rep", "Subs", "Goal", "Attain", "vs last", "Dials", "Talk", "Booked", "Show", "Won"],
      d.reps.map((r) => [`${r.rank}. ${r.name} (${r.role.toLowerCase()})`, n(r.combined), r.combinedGoal === null ? "-" : String(Math.round(r.combinedGoal)), r.attainment === null ? "-" : `${Math.round(r.attainment * 100)}%`, chg("count", r.combined, r.combinedPrev), n(r.dials), fmtValue("minutes", r.talkMinutes), n(r.booked), r.showRate === null ? "-" : fmtValue("pct", r.showRate), n(r.won)]),
      [30, 5, 5, 7, 12, 6, 8, 7, 5, 4],
    ),
  );

  H("3. Month-to-date pace");
  const t = d.pace.team;
  out.push(`${d.pace.monthLabel}, as of ${fmtDateTime(d.pace.asOf)}. Team: ${n(t.mtd)} of ${n(t.quota)} quota (${t.quota > 0 ? Math.round((t.mtd / t.quota) * 100) : 0}%). Projected month end at current pace: ${t.projected === null ? "n/a" : n(t.projected)}. Needed per working day: ${t.neededPerDay === null ? "n/a" : t.neededPerDay.toFixed(1)}. ${n(d.pace.workingDaysRemaining)} of ${n(d.pace.workingDaysTotal)} working days left.`);
  if (narrative) out.push(narrative.projections);
  out.push(textTable(["Rep", "MTD/quota", "Pace", "Proj.", "Need/day", "Est. commission"], d.pace.reps.map((r) => [r.name, `${n(r.mtd)}/${n(r.quota)}`, r.quotaPct === null ? "-" : `${Math.round(r.quotaPct * 100)}%`, r.projected === null ? "-" : n(r.projected), r.neededPerDay === null ? "-" : r.neededPerDay.toFixed(1), r.commissionMtd === null ? "-" : fmtValue("usd", r.commissionMtd)]), [18, 10, 6, 6, 9, 16]));
  out.push("Semester totals (Veteran G.I. Bill):");
  out.push(textTable(["Semester", "Sub MTD", "Acc MTD", `Sub since ${d.pace.toDateSince ?? "start"}`, `Acc since ${d.pace.toDateSince ?? "start"}`], d.pace.semesters.map((s) => [s.label, fmtValue("count", s.submittedMtd), fmtValue("count", s.acceptedMtd), fmtValue("count", s.submittedToDate), fmtValue("count", s.acceptedToDate)]), [22, 8, 8, 20, 20]));
  out.push(`Estimated commission to date: ${fmtValue("usd", d.pace.commissionMtd)} (estimated from dashboard counts).`);

  H("4. Funnel conversion");
  out.push(textTable(["Step", "This wk", "Last wk", "Change"], d.funnel.steps.map((s) => [s.label, fmtValue("count", s.cur), fmtValue("count", s.prev), chg("count", s.cur, s.prev)]), [44, 8, 8, 14]));
  for (const c of d.funnel.cohort) out.push(`${c.label} (${n(c.leads)}): ${n(c.appointment)} booked, ${n(c.submitted)} submitted, ${n(c.won)} won, as of today.`);

  H("5. Pipeline health");
  const ph = d.pipeline;
  out.push(`Stale leads (in New Lead over ${ph.stale.staleAfterDays} days): ${n(ph.stale.count)}${ph.stale.byUser.length ? ` (${ph.stale.byUser.map((u) => `${u.name} ${n(u.count)}`).join(", ")})` : ""}`);
  out.push(`Not touched in the last ${ph.untouched.days} days: ${n(ph.untouched.count)} of ${n(ph.untouched.cohort)} leads`);
  out.push(`Awaiting Supervisor Approval now: ${n(ph.approval.inStage)} (${ph.approval.buckets.map((b) => `${n(b.count)} ${b.label}`).join(", ")})${ph.approval.oldestDays !== null ? `, oldest ${n(ph.approval.oldestDays)} days` : ""}`);
  out.push(`Unassigned leads: ${n(ph.unassigned.fourWeeks)} of the last four weeks' new leads (${n(ph.unassigned.thisWeek)} from this week)`);
  out.push(`Dead-end: ${n(ph.deadEnd.parked)} parked, ${n(ph.deadEnd.lost)} lost, ${n(ph.deadEnd.stillNewLead)} still in New Lead, of ${n(ph.deadEnd.cohort)} leads`);
  out.push(`Stale conversations (unread inbound over ${ph.staleConversations.afterMinutes} min): ${n(ph.staleConversations.conversations)}`);

  H("6. Four-week trend");
  if (narrative) out.push(narrative.trend);
  out.push(textTable(["Week", "Subs", "Dials", "Talk", "Booked", "Showed", "Show", "Leads", "Won"], d.trend.map((w) => [w.label, fmtValue("count", w.combined), n(w.dials), fmtValue("minutes", w.talkMinutes), fmtValue("count", w.booked), fmtValue("count", w.completed), fmtValue("pct", w.showRate), fmtValue("count", w.newLeads), n(w.won)]), [16, 5, 6, 8, 7, 7, 5, 6, 4]));

  H("7. Flags");
  if (d.flags.length === 0) out.push("Nothing to flag this week.");
  for (const f of d.flags) out.push(`[${f.level === "bad" ? "ATTENTION" : f.level === "warn" ? "WATCH" : "NOTE"}] ${f.text}`);

  H("8. Three tips for the coming week");
  if (narrative) narrative.tips.forEach((tip, i) => out.push(`${i + 1}. ${tip}`));
  else out.push("Tips are unavailable this week: the narrative could not be generated, so this email shows the numbers only.");

  out.push("", "---", `Period: ${d.rangeText}. Data as of ${d.dataAsOf ? fmtDateTime(d.dataAsOf) : "no completed sync"}. Generated ${fmtDateTime(d.generatedAt)}.`);
  if (d.dashboardUrl) out.push(`Dashboard: ${d.dashboardUrl}/?range=last_week`, `Mapping page: ${d.dashboardUrl}/mapping`);
  out.push(...d.notes, "Read-only view of Go High Level. This dashboard never changes CRM data.");
  return out.join("\n");
}

// Renders the weekly report as a branded HTML email (table layout, inline
// styles, Intelagent colors from src/styles/tokens.css, VCN logo as an
// inline image) plus a plain-text alternative. Pure formatting: every figure
// arrives already computed in WeeklyReportData; the optional narrative adds
// the trend commentary, the projections wording, and the three tips.

import { fmtDateTime } from "@/lib/dates";
import { fmtValue, type Flag, type Headline, type Kind, type WeeklyReportData } from "./data";
import type { Narrative } from "./narrative";

export const LOGO_CID = "vcn-logo";

// Brand tokens (tokens.css): page #05080d, card surfaces #f4f7fb/#ffffff, ink #182536/#46566a/#5b6b7f,
// blue #1677ff, yellow #ffd51f, status good #15803d / warn #8a5b00 / bad #c62828 on light surfaces.
const C = {
  page: "#e4eaf1",
  dark: "#0c1d33",
  card: "#ffffff",
  inset: "#f4f7fb",
  border: "#d0d9e4",
  ink: "#182536",
  body: "#2f3f52",
  secondary: "#46566a",
  muted: "#5b6b7f",
  blue: "#1677ff",
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
};
const FONT = "Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

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

function section(kicker: string, title: string, body: string): string {
  return `<tr><td style="padding:0 0 12px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.border};border-radius:14px"><tr><td style="padding:18px 20px">
<div style="font:700 11px/1.2 ${FONT};letter-spacing:0.12em;text-transform:uppercase;color:${C.muted};margin-bottom:4px">${esc(kicker)}</div>
<div style="font:800 18px/1.15 ${FONT};letter-spacing:-0.02em;color:${C.ink};margin-bottom:12px">${esc(title)}</div>
${body}
</td></tr></table></td></tr>`;
}

const TH = `style="font:700 11px/1.3 ${FONT};letter-spacing:0.04em;text-transform:uppercase;color:${C.muted};text-align:right;padding:6px 6px;border-bottom:1px solid ${C.border};white-space:nowrap"`;
const THL = TH.replace("text-align:right", "text-align:left");
const TD = `style="font:500 13px/1.35 ${FONT};color:${C.body};text-align:right;padding:7px 6px;border-bottom:1px solid #eef2f6;white-space:nowrap"`;
const TDL = TD.replace("text-align:right", "text-align:left").replace("white-space:nowrap", "");
const TDB = TD.replace("font:500", "font:800").replace(C.body, C.ink);

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
  return `<p style="font:400 12px/1.5 ${FONT};color:${C.muted};margin:10px 0 0">${text}</p>`;
}

function pill(text: string, fg: string, bg: string): string {
  return `<span style="display:inline-block;font:700 11px/1 ${FONT};color:${fg};background:${bg};border-radius:999px;padding:5px 9px;white-space:nowrap">${esc(text)}</span>`;
}

function paragraph(text: string): string {
  return `<p style="font:400 14px/1.55 ${FONT};color:${C.body};margin:0 0 10px">${esc(text)}</p>`;
}

/** A numbers-only "week in brief" for when the narrative is unavailable; every figure is copied from the data. */
export function briefFallback(d: WeeklyReportData): string {
  const h = (key: string) => d.headlines.find((x) => x.key === key)!;
  const c = h("combined");
  const goal = c.goal === null ? "" : ` of a ${n(Math.round(c.goal))} goal`;
  return `${fmtValue("count", c.value)} combined submissions${goal}, ${fmtValue("count", h("dials").value)} dials, ${fmtValue("count", h("booked").value)} appointments booked, ${fmtValue("count", h("won").value)} won.`;
}

/** Small green / red / gray change pill vs last week. */
function changePill(h: Headline): string {
  const c = change(h.kind, h.value, h.prev, h.lowerIsBetter);
  if (!c) return `<span style="display:inline-block;font:700 11px/1 ${FONT};color:${C.muted};background:#eef2f6;border-radius:999px;padding:4px 8px;white-space:nowrap">no comparison</span>`;
  const bg = c.arrow === "■" ? "#eef2f6" : c.color === C.good ? C.goodBg : C.badBg;
  return `<span style="display:inline-block;font:700 11px/1 ${FONT};color:${c.color};background:${bg};border-radius:999px;padding:4px 8px;white-space:nowrap">${c.arrow} ${esc(c.text)}</span>`;
}

/** Thin goal-progress bar (table cells, no images) with "x of goal · y%" under it. */
function goalBar(h: Headline): string {
  if (h.goal === null || h.goal <= 0) return `<div style="font:500 11px/1.4 ${FONT};color:${C.muted};margin-top:8px">no goal</div>`;
  const v = h.value ?? 0;
  const pct = Math.round((v / h.goal) * 100);
  const fill = Math.max(v > 0 ? 2 : 0, Math.min(100, Math.round((v / h.goal) * 100)));
  const color = v >= h.goal - 1e-9 ? C.good : C.blue;
  const goalText = h.kind === "count" ? n(Math.round(h.goal)) : fmtValue(h.kind, h.goal);
  const bar =
    fill >= 100
      ? `<td height="6" bgcolor="${color}" style="height:6px;font-size:0;line-height:0;border-radius:3px">&nbsp;</td>`
      : `<td height="6" width="${fill}%" bgcolor="${color}" style="height:6px;font-size:0;line-height:0;border-radius:3px 0 0 3px">&nbsp;</td><td height="6" bgcolor="${C.border}" style="height:6px;font-size:0;line-height:0;border-radius:0 3px 3px 0">&nbsp;</td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:8px"><tr>${fill === 0 ? `<td height="6" bgcolor="${C.border}" style="height:6px;font-size:0;line-height:0;border-radius:3px">&nbsp;</td>` : bar}</tr></table><div style="font:500 11px/1.4 ${FONT};color:${C.muted};margin-top:4px">${esc(fmtValue(h.kind, h.value))} of ${esc(goalText)} goal · ${n(pct)}%</div>`;
}

/** One KPI tile: label, big number, change pill, sub-line, goal bar. */
function tile(h: Headline, sub: string, small = false): string {
  const big = small ? "22px" : "28px";
  const value = h.value === null ? `<span style="font:800 ${small ? "16px" : "18px"}/1.2 ${FONT};color:${C.muted}" title="${esc(h.unavailable ?? "")}">unavailable</span>` : `<span style="font:800 ${big}/1.1 ${FONT};letter-spacing:-0.02em;color:${C.ink}">${esc(fmtValue(h.kind, h.value))}</span>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.inset};border:1px solid ${C.border};border-radius:12px"><tr><td style="padding:12px 14px">
<div style="font:700 11px/1.2 ${FONT};letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};margin-bottom:6px">${esc(h.label)}</div>
<div>${value} &nbsp;${changePill(h)}</div>
<div style="font:500 12px/1.4 ${FONT};color:${C.secondary};margin-top:4px">${esc(sub)}</div>
${goalBar(h)}
</td></tr></table>`;
}

/** Two stacked segment bars (this week, last week) of the submissions parts on one shared scale, with a legend. */
function mixBars(h: Headline): string {
  const parts = h.parts ?? [];
  const colors = [C.blue, "#0a8db4", "#a88900", "#d55181", "#8178e0"];
  const totals = [parts.reduce((s, p) => s + (p.value ?? 0), 0), parts.reduce((s, p) => s + (p.prev ?? 0), 0)];
  const scale = Math.max(1, ...totals);
  const row = (label: string, pick: (p: NonNullable<Headline["parts"]>[number]) => number | null, total: number) => {
    const segs = parts.map((p, i) => ({ v: pick(p) ?? 0, color: colors[i % colors.length], short: p.short })).filter((s) => s.v > 0);
    const used = segs.reduce((s, x) => s + Math.round((x.v / scale) * 100), 0);
    const cells = segs.map((s) => { const w = Math.round((s.v / scale) * 100); return `<td width="${w}%" bgcolor="${s.color}" style="height:20px;font:700 11px/20px ${FONT};color:#ffffff;text-align:center;white-space:nowrap;overflow:hidden">${w >= 30 ? esc(s.short) + " " : ""}${n(s.v)}</td>`; }).join("");
    const rest = used < 100 ? `<td bgcolor="#eef2f6" style="height:20px;font-size:0;line-height:0">&nbsp;</td>` : "";
    return `<tr><td width="76" style="font:600 12px/1.3 ${FONT};color:${C.secondary};padding:0 8px 6px 0;white-space:nowrap">${esc(label)}</td><td style="padding:0 0 6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:4px;overflow:hidden">${segs.length ? `<tr>${cells}${rest}</tr>` : `<tr><td bgcolor="#eef2f6" style="height:20px;font:600 11px/20px ${FONT};color:${C.muted};text-align:center">none</td></tr>`}</table></td><td width="34" align="right" style="font:800 13px/1.3 ${FONT};color:${C.ink};padding:0 0 6px 8px">${n(total)}</td></tr>`;
  };
  const legend = parts.map((p, i) => `<span style="white-space:nowrap;margin-right:12px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${colors[i % colors.length]};vertical-align:-1px"></span> ${esc(p.short)} <b style="color:${C.ink}">${esc(fmtValue("count", p.value))}</b> <span style="color:${C.muted}">(last week ${esc(fmtValue("count", p.prev))})</span></span>`).join("");
  // Army = the CA 101 part; Veteran = every IAU part (one per semester).
  const army = parts.filter((p) => /CA 101/.test(p.short));
  const vet = parts.filter((p) => !/CA 101/.test(p.short));
  const sum = (list: typeof parts, pick: (p: (typeof parts)[number]) => number | null) => (list.some((p) => pick(p) === null) ? null : list.reduce((s, p) => s + (pick(p) ?? 0), 0));
  const split = `<div style="font:800 14px/1.5 ${FONT};color:${C.ink};margin-top:4px">Army ${esc(fmtValue("count", sum(army, (p) => p.value)))} · Veteran ${esc(fmtValue("count", sum(vet, (p) => p.value)))} <span style="font:500 12px/1.5 ${FONT};color:${C.muted}">(last week Army ${esc(fmtValue("count", sum(army, (p) => p.prev)))} · Veteran ${esc(fmtValue("count", sum(vet, (p) => p.prev)))})</span></div>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${row("This week", (p) => p.value, totals[0])}${row("Last week", (p) => p.prev, totals[1])}</table><div style="font:500 12px/1.6 ${FONT};color:${C.secondary};margin-top:2px">${legend}</div>${split}`;
}

export function renderHtml(d: WeeklyReportData, narrative: Narrative | null): string {
  const dash = d.dashboardUrl;
  const link = (path: string, label: string) => (dash ? `<a href="${esc(dash + path)}" style="color:${C.blueText};font-weight:700">${esc(label)}</a>` : esc(label));
  const parts: string[] = [];

  // 1. headline numbers: week in brief, six KPI tiles, submissions mix, leads tiles, one-line note
  const H = (key: string) => d.headlines.find((x) => x.key === key)!;
  const brief = narrative?.brief ?? briefFallback(d);
  const briefHtml = `<div style="border-left:4px solid ${C.yellow};background:${C.inset};border-radius:0 10px 10px 0;padding:10px 14px;margin:0 0 14px;font:600 15px/1.45 ${FONT};color:${C.ink}">${esc(brief)}</div>`;
  const showRate = H("showRate");
  const wonValue = H("wonValue");
  const tileRows = [
    [tile(H("combined"), `last week ${fmtValue("count", H("combined").prev)}`), tile(H("won"), `${fmtValue("usd", wonValue.value)} Opportunity Value${wonValue.prev !== null ? ` (last week ${fmtValue("usd", wonValue.prev)})` : ""}`)],
    [tile(H("talk"), `last week ${fmtValue("minutes", H("talk").prev)}`), tile(H("booked"), `last week ${fmtValue("count", H("booked").prev)}`)],
    [tile(H("completed"), `show rate ${fmtValue("pct", showRate.value)}${showRate.prev !== null ? ` (last week ${fmtValue("pct", showRate.prev)})` : ""}`), tile(H("dials"), `last week ${fmtValue("count", H("dials").prev)}`)],
  ];
  const tilesHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${tileRows.map((r) => `<tr>${r.map((t, i) => `<td width="50%" valign="top" style="padding:0 ${i === 0 ? "5px" : "0"} 10px ${i === 0 ? "0" : "5px"}">${t}</td>`).join("")}</tr>`).join("")}</table>`;
  const mixHtml = `<div style="font:800 14px/1.3 ${FONT};color:${C.ink};margin:0 0 8px">Submissions by program</div>` + mixBars(H("combined")) + `<div style="height:14px;font-size:0;line-height:0">&nbsp;</div>`;
  const leadsHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px"><tr><td width="50%" valign="top" style="padding:0 5px 0 0">${tile(H("newLeads"), `last week ${fmtValue("count", H("newLeads").prev)}`, true)}</td><td width="50%" valign="top" style="padding:0 0 0 5px">${tile(H("assigned"), H("assigned").prevUnavailable && H("assigned").prev === null ? "no comparison: assignment tracking is newer than last week" : `last week ${fmtValue("count", H("assigned").prev)}`, true)}</td></tr></table>`;
  parts.push(section("1 · Headline numbers", `${d.rangeText} vs ${d.prevRangeText}`, briefHtml + mixHtml + tilesHtml + leadsHtml + note(`Goals are the dashboard's weekly rates summed across reps${d.partial ? ", pro-rated to the week so far" : ""}; change is against the previous Monday-to-Sunday week${d.partial ? " over the same elapsed portion" : ""}; submissions count CA 101 plus IAU App for every semester.`)));

  // 2. leaderboard
  const callouts: string[] = [];
  if (d.topPerformer) callouts.push(`<td style="padding:0 6px 10px 0" width="50%"><div style="background:${C.inset};border-radius:10px;padding:10px 12px"><div style="font:700 11px/1.2 ${FONT};letter-spacing:0.08em;text-transform:uppercase;color:${C.muted}">Top performer</div><div style="font:800 16px/1.3 ${FONT};color:${C.ink}">${esc(d.topPerformer.name)}</div><div style="font:500 12px/1.4 ${FONT};color:${C.secondary}">${n(d.topPerformer.combined)} submissions · ${n(d.topPerformer.dials)} dials · ${n(d.topPerformer.booked)} booked</div></div></td>`);
  callouts.push(
    `<td style="padding:0 0 10px 6px" width="50%"><div style="background:${C.inset};border-radius:10px;padding:10px 12px"><div style="font:700 11px/1.2 ${FONT};letter-spacing:0.08em;text-transform:uppercase;color:${C.muted}">Biggest improver</div>${
      d.biggestImprover
        ? `<div style="font:800 16px/1.3 ${FONT};color:${C.ink}">${esc(d.biggestImprover.rep.name)}</div><div style="font:500 12px/1.4 ${FONT};color:${C.secondary}">+${n(d.biggestImprover.delta)} submissions vs last week (${n(d.biggestImprover.rep.combinedPrev ?? 0)} → ${n(d.biggestImprover.rep.combined)})</div>`
        : `<div style="font:500 13px/1.4 ${FONT};color:${C.secondary}">No rep submitted more than last week.</div>`
    }</div></td>`,
  );
  const repRows = d.reps.map((r) => {
    const goal = r.combinedGoal === null ? "" : ` <span style="color:${C.muted};font-weight:500">/ ${Math.round(r.combinedGoal)}</span>`;
    const att = r.attainment === null ? "" : `<br><span style="font-size:11px;color:${r.attainment >= 1 ? C.good : r.attainment >= 0.5 ? C.warn : C.bad};font-weight:700">${Math.round(r.attainment * 100)}% of goal</span>`;
    return [
      `<span style="font-weight:700;color:${C.ink}">${r.rank}. ${esc(r.name)}</span>`,
      `<span style="font-weight:800;color:${C.ink}">${n(r.combined)}</span>${goal}${att}`,
      changeHtml(change("count", r.combined, r.combinedPrev)),
      `${n(r.dials)}${r.dialsGoal ? `<br><span style="font-size:11px;color:${C.muted}">of ${Math.round(r.dialsGoal)}</span>` : ""}`,
      esc(fmtValue("minutes", r.talkMinutes)),
      n(r.booked),
      r.showRate === null ? `<span style="color:${C.muted}">—</span>` : `${esc(fmtValue("pct", r.showRate))}<br><span style="font-size:11px;color:${C.muted}">${n(r.showed)} of ${n(r.showed + r.noshow)}</span>`,
      `${n(r.won)}${r.wonValue > 0 ? `<br><span style="font-size:11px;color:${C.muted}">${esc(fmtValue("usd", r.wonValue))}</span>` : ""}`,
    ];
  });
  parts.push(
    section(
      "2 · Rep leaderboard",
      "Ranked by combined submissions",
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${callouts.join("")}</tr></table>` +
        table(["Rep", "Submissions", "vs last wk", "Dials", "Talk", "Booked", "Show rate", "Won"], repRows) +
        note("Submissions = CA 101 + IAU App (every semester) credited to the rep; the goal is the rep's own weekly rate. Show rate is of the rep's appointments scheduled this week that were marked. Won is Opportunity Value, not cash."),
    ),
  );

  // 3. month-to-date pace
  const p = d.pace;
  const t = p.team;
  const teamLine = `<div style="background:${C.inset};border-radius:10px;padding:12px 14px;margin-bottom:12px"><div style="font:800 22px/1.2 ${FONT};color:${C.ink}">${n(t.mtd)} <span style="font:600 14px/1.2 ${FONT};color:${C.secondary}">of ${n(t.quota)} team quota · ${t.quota > 0 ? Math.round((t.mtd / t.quota) * 100) : 0}%</span></div><div style="font:500 13px/1.5 ${FONT};color:${C.secondary};margin-top:4px">Projected month end at current pace: <b style="color:${C.ink}">${t.projected === null ? "unavailable" : n(t.projected)}</b> · needed per working day to hit quota: <b style="color:${C.ink}">${t.neededPerDay === null ? (t.mtd >= t.quota ? "met" : "no working days left") : t.neededPerDay.toFixed(1)}</b> · ${n(p.workingDaysRemaining)} of ${n(p.workingDaysTotal)} working days left in ${esc(p.monthLabel)}${t.othersMtd > 0 ? ` · plus ${n(t.othersMtd)} by users who are not configured reps` : ""}</div></div>`;
  const paceRows = p.reps.map((r) => [
    `<span style="font-weight:700;color:${C.ink}">${esc(r.name)}</span>${r.planLabel ? `<br><span style="font-size:11px;color:${C.muted}">${esc(r.planLabel)}</span>` : ""}`,
    `<span style="font-weight:800;color:${C.ink}">${n(r.mtd)}</span> <span style="color:${C.muted}">/ ${n(r.quota)}</span>`,
    r.quotaPct === null ? "—" : `<span style="color:${r.quotaPct >= 1 ? C.good : r.quotaPct >= 0.5 ? C.warn : C.bad};font-weight:700">${Math.round(r.quotaPct * 100)}%</span>`,
    r.projected === null ? "—" : n(r.projected),
    r.neededPerDay === null ? (r.quota > 0 && r.mtd >= r.quota ? "met" : "—") : r.neededPerDay.toFixed(1),
    r.commissionMtd === null ? "—" : `${esc(fmtValue("usd", r.commissionMtd))}<br><span style="font-size:11px;color:${C.muted}">${esc(r.commissionLabel)}</span>`,
  ]);
  const semRows = p.semesters.map((s) => [`<span style="font-weight:700;color:${C.ink}">${esc(s.label)}</span>`, esc(fmtValue("count", s.submittedMtd)), esc(fmtValue("count", s.acceptedMtd)), esc(fmtValue("count", s.submittedToDate)), esc(fmtValue("count", s.acceptedToDate))]);
  parts.push(
    section(
      "3 · Month-to-date pace",
      `${p.monthLabel}, as of ${fmtDateTime(p.asOf)}`,
      teamLine +
        (narrative ? paragraph(narrative.projections) : "") +
        table(["Rep", "Submissions / quota", "Pace", "Projected", "Need / day", "Est. commission"], paceRows) +
        `<div style="font:800 14px/1.3 ${FONT};color:${C.ink};margin:14px 0 6px">Semester totals (Veteran G.I. Bill)</div>` +
        table(["Semester", "Submitted MTD", "Accepted MTD", `Submitted since ${esc(p.toDateSince ?? "tracking began")}`, `Accepted since ${esc(p.toDateSince ?? "tracking began")}`], semRows) +
        `<div style="font:700 14px/1.4 ${FONT};color:${C.ink};margin-top:12px">Estimated commission to date: ${esc(fmtValue("usd", p.commissionMtd))} <span style="font-weight:500;color:${C.muted}">(estimated from dashboard counts; official calculation is done outside the dashboard)</span></div>` +
        note(`Projection = month-to-date submissions ÷ working days elapsed × working days in the month (Monday to Friday calendar). Need / day = the gap to quota spread over the working days left. Quota and commission count every semester.`),
    ),
  );

  // 4. funnel
  const stepRate = (steps: typeof d.funnel.steps, i: number, which: "cur" | "prev") => {
    if (i === 0) return "";
    const a = steps[i][which];
    const b = steps[0][which];
    return a === null || b === null ? "—" : b > 0 ? `${Math.round((a / b) * 100)}%` : "—";
  };
  const funnelRows = d.funnel.steps.map((s, i) => [`<span style="font-weight:700;color:${C.ink}">${esc(s.label)}</span>`, `<span style="font-weight:800;color:${C.ink}">${esc(fmtValue("count", s.cur))}</span>`, esc(fmtValue("count", s.prev)), changeHtml(change("count", s.cur, s.prev), s.unavailable), stepRate(d.funnel.steps, i, "cur"), stepRate(d.funnel.steps, i, "prev")]);
  const cohortLines = d.funnel.cohort
    .map((c) => `<li style="margin:0 0 4px">${esc(c.label)} (${n(c.leads)}): ${n(c.appointment)} booked an appointment (${c.leads > 0 ? Math.round((c.appointment / c.leads) * 100) : 0}%), ${n(c.submitted)} submitted (${c.leads > 0 ? Math.round((c.submitted / c.leads) * 100) : 0}%), ${n(c.won)} won (${c.leads > 0 ? Math.round((c.won / c.leads) * 100) : 0}%), as of today${c.historyUnavailable > 0 ? `; history unavailable for ${n(c.historyUnavailable)}` : ""}.</li>`)
    .join("");
  parts.push(section("4 · Funnel conversion", "Leads → appointments → submissions → accepted → won", table(["Step", "This week", "Last week", "Change", "Of leads", "Last wk"], funnelRows) + `<div style="font:800 14px/1.3 ${FONT};color:${C.ink};margin:14px 0 6px">Matched cohorts (Lead Outcomes)</div><ul style="font:400 13px/1.5 ${FONT};color:${C.body};margin:0;padding-left:18px">${cohortLines}</ul>` + note("Of leads = the step's weekly count ÷ the week's new leads. The steps are the week's own event counts (different contacts at each step), not one group of leads followed through, so read them as throughput. The cohort lines follow one week's new leads and say what happened to them so far.")));

  // 5. pipeline health
  const ph = d.pipeline;
  const bucketText = ph.approval.buckets.map((b) => `${n(b.count)} ${b.label}`).join(", ");
  const healthRows: [string, string][] = [
    [`Stale leads (in New Lead over ${n(ph.stale.staleAfterDays)} days)`, `${n(ph.stale.count)}${ph.stale.byUser.length ? ` · ${ph.stale.byUser.map((u) => `${esc(u.name)} ${n(u.count)}${u.oldestDays ? ` (oldest ${n(u.oldestDays)}d)` : ""}`).join(", ")}` : ""}${ph.stale.estimated ? ` · ${n(ph.stale.estimated)} estimated from creation time` : ""}`],
    [`Not touched in the last ${n(ph.untouched.days)} days`, `${n(ph.untouched.count)} of ${n(ph.untouched.cohort)} leads`],
    ["Awaiting Supervisor Approval (Army CA, now)", `${n(ph.approval.inStage)} · ${esc(fmtValue("usd", ph.approval.value))} Opportunity Value · ${bucketText}${ph.approval.unknownAge ? `, ${n(ph.approval.unknownAge)} with no stage-entry time` : ""}${ph.approval.oldestDays !== null ? ` · oldest ${n(ph.approval.oldestDays)} days` : ""}`],
    ["Unassigned leads", `${n(ph.unassigned.fourWeeks)} of the last four weeks' new leads (${n(ph.unassigned.thisWeek)} from this week)`],
    ["Dead-end and lost", `${n(ph.deadEnd.parked)} parked in a dead-end stage · ${n(ph.deadEnd.lost)} lost · ${n(ph.deadEnd.stillNewLead)} still in New Lead, of ${n(ph.deadEnd.cohort)} leads`],
    [`Stale conversations (unread inbound over ${n(ph.staleConversations.afterMinutes)} min)`, `${n(ph.staleConversations.conversations)} conversations, ${n(ph.staleConversations.unread)} unread messages${ph.staleConversations.oldestMinutes !== null ? ` · oldest waiting ${waitText(ph.staleConversations.oldestMinutes)}` : ""}`],
  ];
  parts.push(section("5 · Pipeline health", `Snapshot as of the last sync · ${esc(ph.windowLabel)}`, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${healthRows.map(([k, v]) => `<tr><td ${TDL.replace("white-space:nowrap", "")} width="42%"><b style="color:${C.ink}">${k}</b></td><td ${TDL}>${v}</td></tr>`).join("")}</table>` + note("Stale, untouched, unassigned, and dead-end figures follow the Leads row rules (config/leads.json) over leads created in the last four weeks. Approval aging uses GHL's stage-entry time on each open opportunity in the stage.")));

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
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(`VCN Weekly Sales Report: ${d.rangeText}`)}</title></head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%">
<tr><td style="padding:0 0 12px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.dark};border-radius:14px"><tr>
<td style="padding:18px 20px" valign="middle"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td valign="middle" style="padding-right:12px"><img src="cid:${LOGO_CID}" width="44" height="44" alt="Veteran Careers Network" style="display:block;border:0;border-radius:8px"></td>
<td valign="middle"><div style="font:800 20px/1.15 ${FONT};letter-spacing:-0.02em;color:#ffffff">VCN Weekly Sales Report</div><div style="font:700 13px/1.4 ${FONT};color:${C.yellow}">${esc(d.rangeText)}</div><div style="font:500 11px/1.4 ${FONT};color:#aab6c4">by Intelagent Media · data as of ${d.dataAsOf ? esc(fmtDateTime(d.dataAsOf)) : "no completed sync"}</div></td>
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
  }
  out.push(textTable(["Metric", "This wk", "Last wk", "Change", "Goal"], rows, [34, 10, 10, 16, 16]));

  H("2. Rep leaderboard");
  if (d.topPerformer) out.push(`Top performer: ${d.topPerformer.name} (${n(d.topPerformer.combined)} submissions, ${n(d.topPerformer.dials)} dials, ${n(d.topPerformer.booked)} booked)`);
  out.push(d.biggestImprover ? `Biggest improver: ${d.biggestImprover.rep.name} (+${n(d.biggestImprover.delta)} submissions vs last week)` : "Biggest improver: no rep submitted more than last week.");
  out.push(
    textTable(
      ["Rep", "Subs", "Goal", "Attain", "vs last", "Dials", "Talk", "Booked", "Show", "Won"],
      d.reps.map((r) => [`${r.rank}. ${r.name}`, n(r.combined), r.combinedGoal === null ? "-" : String(Math.round(r.combinedGoal)), r.attainment === null ? "-" : `${Math.round(r.attainment * 100)}%`, chg("count", r.combined, r.combinedPrev), n(r.dials), fmtValue("minutes", r.talkMinutes), n(r.booked), r.showRate === null ? "-" : fmtValue("pct", r.showRate), n(r.won)]),
      [20, 5, 5, 7, 12, 6, 8, 7, 5, 4],
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

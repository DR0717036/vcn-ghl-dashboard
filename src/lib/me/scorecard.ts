// "My scorecard" for one rep: today, this week, this month (and the selected
// range when it is a different period), each figure taken from the SAME
// per-rep rows the admin scorecard shows (Rep Call Activity, Rep
// Appointments, Program Submissions, the Won row in period mode) with the
// rep's own goals (per-rep rate × multiplier or override, pro-rated to the
// period). Nothing is recomputed with different rules. Reads the cache only.

import { computeRepAppointments } from "@/lib/appointments";
import { resolveRange, type DateRange, type RangeKey } from "@/lib/dates";
import { goalFor } from "@/lib/goals";
import { semesters } from "@/lib/mapping-config";
import { fmtMinutes } from "@/lib/metrics";
import { computeRepCalls } from "@/lib/repCalls";
import type { Rep } from "@/lib/reps";
import { computeSubmissions } from "@/lib/submissions";
import { wonOpps } from "@/lib/wonRow";

export type Kind = "count" | "minutes" | "pct" | "usd";

export interface Cell {
  value: number | null;
  text: string;
  /** The rep's own goal for the whole period (null = no goal for this KPI). */
  goal: number | null;
  /** The rep's goal for the elapsed part of an in-progress period. */
  goalByNow: number | null;
  /** value ÷ goal, or null. */
  attainment: number | null;
  /** Shown in place of the bar when there is no goal for the period (e.g. "Weekly goal 4" on the Today column). */
  goalNote?: string;
  /** A smaller line under the figure. */
  sub?: string;
  /** Lines listed under the figure (e.g. the semester split). */
  parts?: { label: string; text: string }[];
}

export interface ScoreRow {
  key: string;
  label: string;
  kind: Kind;
  /** Where the figure comes from on the admin scorecard. */
  source: string;
  cells: Cell[];
}

export interface ScorePeriod {
  key: RangeKey;
  label: string;
  /** "Oct 20 – Oct 26, 2:15 PM" style, as the control bar shows it. */
  text: string;
  partial: boolean;
}

export interface RepScorecard {
  periods: ScorePeriod[];
  rows: ScoreRow[];
  notes: string[];
}

const n = (v: number) => v.toLocaleString("en-US");
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function fmtKind(kind: Kind, v: number | null): string {
  if (v === null) return "—";
  if (kind === "minutes") return fmtMinutes(Math.round(v));
  if (kind === "pct") return `${Math.round(v * 100)}%`;
  if (kind === "usd") return usd(v);
  return n(v);
}

/**
 * A weekly goal has no sensible one-day share (4 bookings a week is not 0.57
 * a day), so for a single-day period a weekly-rate goal is shown as text
 * ("weekly goal 4") instead of a bar. `rate` is the rep's own rate in the
 * goal's unit.
 */
function cell(kind: Kind, value: number | null, goal: { full: number; scaled: number; rate?: number; unit?: "day" | "week" | "team-week" } | null | undefined, singleDay: boolean, extra?: Partial<Cell>): Cell {
  const g = goal && goal.full > 0 ? goal : null;
  if (g && singleDay && g.unit === "week" && g.rate !== undefined) {
    return { value, text: fmtKind(kind, value), goal: null, goalByNow: null, attainment: null, goalNote: `Weekly goal ${fmtKind(kind, Math.round(g.rate))}`, ...extra };
  }
  return {
    value,
    text: fmtKind(kind, value),
    goal: g ? g.full : null,
    goalByNow: g ? g.scaled : null,
    attainment: g && value !== null ? value / g.full : null,
    ...extra,
  };
}

/** The figures for one rep over one range. */
function periodFigures(rep: Rep, range: DateRange): Record<string, Cell> {
  const calls = computeRepCalls(range);
  const appts = computeRepAppointments(range);
  const subs = computeSubmissions(range, "all");
  const completedGoal = goalFor("appointmentsCompleted", range);
  const c = calls.rows.find((r) => r.userId === rep.userId);
  const a = appts.rows.find((r) => r.userId === rep.userId);
  const s = subs.rows.find((r) => r.userId === rep.userId);
  const subGoal = subs.goal?.perRep[rep.userId];
  const won = wonOpps("period", range).filter((o) => o.assignedTo === rep.userId);
  const singleDay = range.key === "today" || range.key === "yesterday";
  const withUnit = (g: { full: number; scaled: number } | null | undefined, goal: ReturnType<typeof goalFor>) => (g && goal ? { ...g, rate: goal.perRep[rep.userId]?.rate, unit: goal.unit } : g);
  const bookedGoal = goalFor("appointmentsBooked", range);
  const callsGoal = goalFor("callsMade", range);
  const talkGoal = goalFor("talkTimeMinutes", range);
  const wonValue = won.reduce((t, o) => t + (o.value ?? 0), 0);
  const marked = (a?.showed ?? 0) + (a?.noshow ?? 0);
  // IAU App Submitted per semester for this rep (the parts behind the combined count).
  const semParts = (subs.parts?.iau ?? []).map((p) => {
    const sem = semesters().find((x) => x.submittedKey === p.key);
    return { label: `Veteran IAU · ${sem?.short ?? p.reportingGroup}`, text: n(p.reps.find((r) => r.userId === rep.userId)?.contacts ?? 0) };
  });
  const subsUnavailable = subs.value === null;
  return {
    dials: cell("count", c?.dials ?? 0, withUnit(c?.callGoal, callsGoal), singleDay, { sub: c ? `${n(c.conversations)} conversations` : undefined }),
    talk: cell("minutes", c ? Math.round(c.talkSeconds / 60) : 0, withUnit(c?.talkGoalMinutes, talkGoal), singleDay, { sub: c && c.connected > 0 ? `${n(c.connected)} connected calls` : undefined }),
    booked: cell("count", a?.booked ?? 0, withUnit(a?.bookedGoal, bookedGoal), singleDay),
    completed: cell("count", a?.showed ?? 0, withUnit(completedGoal?.perRep[rep.userId] ?? null, completedGoal), singleDay, { sub: a ? `no-show ${n(a.noshow)}` : undefined }),
    showRate: cell("pct", a && a.showRate !== null ? a.showRate : null, null, singleDay, { sub: marked > 0 ? `${n(a?.showed ?? 0)} of ${n(marked)} marked` : "none marked yet" }),
    submissions: subsUnavailable
      ? { value: null, text: "unavailable", goal: null, goalByNow: null, attainment: null, sub: subs.unavailableReason }
      : cell("count", s?.total ?? 0, withUnit(subGoal ? { full: subGoal.full, scaled: subGoal.scaled } : null, subs.goal), singleDay, { parts: [{ label: "Army CA 101", text: n(s?.ca101 ?? 0) }, ...semParts] }),
    won: cell("count", won.length, null, singleDay, { sub: `Opportunity Value ${usd(wonValue)}` }),
  };
}

const ROWS: { key: string; label: string; kind: Kind; source: string }[] = [
  { key: "dials", label: "Dials", kind: "count", source: "Rep Call Activity (outbound human call attempts)" },
  { key: "talk", label: "Talk time", kind: "minutes", source: "Rep Call Activity (recorded duration of connected calls)" },
  { key: "booked", label: "Appointments booked", kind: "count", source: "Rep Appointments, as host (bookings created in the period)" },
  { key: "completed", label: "Appointments completed", kind: "count", source: "Rep Appointments (scheduled in the period and marked Showed)" },
  { key: "showRate", label: "Show rate", kind: "pct", source: "Rep Appointments (Showed ÷ Showed + No-show)" },
  { key: "submissions", label: "Submissions", kind: "count", source: "Program Submissions (CA 101 + IAU App, every semester; first entry per contact, credited to the owner at the event)" },
  { key: "won", label: "Won", kind: "count", source: "Won row, Became Won During Period (first won transition per opportunity, credited to the owner at the event)" },
];

/** Today, this week, this month, plus the selected range when it is none of those. */
export function scorecardPeriods(now: Date, selected: DateRange): DateRange[] {
  const fixed: RangeKey[] = ["today", "this_week", "this_month"];
  const list = fixed.map((k) => resolveRange(k, now));
  if (!fixed.includes(selected.key)) list.push(selected);
  return list;
}

export function computeRepScorecard(rep: Rep, now: Date, selected: DateRange, rangeText: (r: DateRange) => string): RepScorecard {
  const periods = scorecardPeriods(now, selected);
  const figures = periods.map((r) => periodFigures(rep, r));
  return {
    periods: periods.map((r) => ({ key: r.key, label: r.label, text: rangeText(r), partial: r.partial })),
    rows: ROWS.map((row) => ({ ...row, cells: figures.map((f) => f[row.key]) })),
    notes: [
      "Every figure equals your row in the matching section of the team scorecard for the same period; the counting rules are the same.",
      "Goals are your own: the team rate scaled by your plan (full-time or part-time) or a fixed override, pro-rated to the period. The bar fills toward the whole period's goal; 'by now' is the share of the goal for the time elapsed so far.",
      "Dials are outbound human call attempts, one per call ID. Talk time is the recorded duration of calls with status completed or answered, both directions.",
      "Appointments booked are bookings created in the period where you are the host. Completed are appointments scheduled in the period marked Showed; the show rate leaves out appointments not yet marked.",
      "Submissions are the first entry into CA 101 submitted (Army) or IAU App Submitted (Veteran, every semester) per contact, credited to the opportunity owner at the time of the event.",
      "Won means opportunity status = won, once per opportunity id, credited to the owner at the won event. Dollar figures are Opportunity Value, never cash collected or commission.",
    ],
  };
}

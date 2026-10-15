// Goals come from config/goals.json as RATES (per rep per day, per rep per
// week, or team per week). Per-rep rates apply to each rep in
// config/sales-reps.json scaled by that rep's kpiMultiplier (or replaced by a
// goalOverrides entry), and the team goal is the SUM of every rep's goal. For
// a selected date range the dashboard turns the rate into a goal for the
// whole period, then scales it to the elapsed portion so an in-progress
// period can be judged fairly. Nothing here is invented: a KPI without a
// configured rate is "Goal not set".

import raw from "../../config/goals.json";
import { dayKeysBetween, type DateRange } from "@/lib/dates";
import { repRate, salesReps } from "@/lib/reps";

interface GoalsFile {
  perRepPerDay?: Record<string, number>;
  perRepPerWeek?: Record<string, number>;
  teamPerWeek?: Record<string, number>;
  snapshotKpis?: string[];
  noGoal?: string[];
  callOutcomes?: { conversationMinSeconds?: number };
  callHeatmap?: { startHour?: number; endHour?: number; minDials?: number };
}

const goals = raw as unknown as GoalsFile;

export interface RepGoal {
  /** This rep's goal for the whole period. */
  full: number;
  /** This rep's goal for the elapsed portion. */
  scaled: number;
  /** This rep's rate in the KPI's unit (per day or per week). */
  rate: number;
}

export interface Goal {
  kpiKey: string;
  /** Team goal for the whole selected period (sum of every rep's goal, or the team-wide rate). */
  full: number;
  /** Team goal for the portion of the period elapsed so far (equals full once the period is over, or for snapshots). */
  scaled: number;
  /** Each configured rep's own goal, keyed by GHL user id. Empty for team-wide goals. */
  perRep: Record<string, RepGoal>;
  /** Plain-language derivation, e.g. "100 per rep per day (Sam R. 50), 7 reps, team 650 per day × 7 days". */
  basis: string;
  elapsedFraction: number;
  partial: boolean;
  /** Snapshot KPIs compare the current value with the full weekly goal; nothing is scaled. */
  snapshot: boolean;
}

/** Seconds a completed outbound call must last to count as a Conversation (config/goals.json, default 60). */
export function conversationMinSeconds(): number {
  const v = goals.callOutcomes?.conversationMinSeconds;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 60;
}

/** Heat-map window and minimum dials per slot (config/goals.json; defaults 7–20 and 5). */
export function callHeatmapConfig(): { startHour: number; endHour: number; minDials: number } {
  const c = goals.callHeatmap ?? {};
  const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
  const startHour = int(c.startHour, 0, 23, 7);
  const endHour = Math.max(startHour, int(c.endHour, 0, 23, 20));
  return { startHour, endHour, minDials: int(c.minDials, 1, 1000, 5) };
}

export type GoalStatus = "met" | "on_track" | "missed";

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = { met: "Met", on_track: "On Track", missed: "Missed" };

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

const fmt = (v: number) => (Number.isInteger(v) ? v.toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 2 }));

/** Per-rep rates for a KPI and the plain-language basis for them. */
function rates(kpiKey: string, base: number, unit: "day" | "week"): { rates: { userId: string; rate: number }[]; team: number; basis: string } {
  const list = salesReps.map((r) => ({ userId: r.userId, name: r.name, rate: repRate(r, kpiKey, base) }));
  const team = list.reduce((s, r) => s + r.rate, 0);
  const exceptions = list.filter((r) => Math.abs(r.rate - base) > 1e-9).map((r) => `${r.name} ${fmt(r.rate)}`);
  const basis = `${fmt(base)} per rep per ${unit}${exceptions.length ? ` (${exceptions.join(", ")})` : ""}, ${list.length} reps, team ${fmt(team)} per ${unit}`;
  return { rates: list, team, basis };
}

export function goalFor(kpiKey: string, range: DateRange): Goal | null {
  if (goals.noGoal?.includes(kpiKey)) return null;
  const days = Math.max(1, dayKeysBetween(range.start, range.fullEnd).length);
  const fullMs = range.fullEnd.getTime() - range.start.getTime();
  const elapsedFraction = range.partial && fullMs > 0 ? Math.min(1, Math.max(0, (range.end.getTime() - range.start.getTime()) / fullMs)) : 1;
  const dayWord = days === 1 ? "day" : "days";

  const perDay = num(goals.perRepPerDay?.[kpiKey]);
  if (perDay !== null) {
    const r = rates(kpiKey, perDay, "day");
    const perRep: Record<string, RepGoal> = {};
    for (const x of r.rates) perRep[x.userId] = { full: x.rate * days, scaled: x.rate * days * elapsedFraction, rate: x.rate };
    const full = r.team * days;
    return { kpiKey, full, scaled: full * elapsedFraction, perRep, basis: `${r.basis} × ${days} ${dayWord}`, elapsedFraction, partial: range.partial, snapshot: false };
  }

  const perWeek = num(goals.perRepPerWeek?.[kpiKey]);
  if (perWeek !== null) {
    const r = rates(kpiKey, perWeek, "week");
    const perRep: Record<string, RepGoal> = {};
    if (goals.snapshotKpis?.includes(kpiKey)) {
      for (const x of r.rates) perRep[x.userId] = { full: x.rate, scaled: x.rate, rate: x.rate };
      return {
        kpiKey,
        full: r.team,
        scaled: r.team,
        perRep,
        basis: `at least ${r.basis}, compared with the current snapshot (not scaled to the period)`,
        elapsedFraction: 1,
        partial: false,
        snapshot: true,
      };
    }
    for (const x of r.rates) {
      const full = (x.rate / 7) * days;
      perRep[x.userId] = { full, scaled: full * elapsedFraction, rate: x.rate };
    }
    const full = (r.team / 7) * days;
    return { kpiKey, full, scaled: full * elapsedFraction, perRep, basis: `${r.basis}, pro-rated to ${days} ${dayWord}`, elapsedFraction, partial: range.partial, snapshot: false };
  }

  const team = num(goals.teamPerWeek?.[kpiKey]);
  if (team !== null) {
    const full = (team / 7) * days;
    return {
      kpiKey,
      full,
      scaled: full * elapsedFraction,
      perRep: {},
      basis: `${team} team-wide per week, pro-rated to ${days} ${dayWord}`,
      elapsedFraction,
      partial: range.partial,
      snapshot: false,
    };
  }

  return null;
}

/** True when the goal is defined per rep (so a per-rep column and status make sense). */
export function hasRepGoals(g: Goal | null): g is Goal {
  return Boolean(g && Object.keys(g.perRep).length > 0);
}

/** Met: at or above the full-period goal. On Track: in progress and at or above the elapsed-portion goal. Missed: below it. */
export function goalStatus(value: number, g: Goal): GoalStatus {
  if (value >= g.full - 1e-9) return "met";
  if (g.partial && !g.snapshot && value >= g.scaled - 1e-9) return "on_track";
  return "missed";
}

/** Same rule applied to one rep's value against that rep's own goal. Null when the rep has no goal. */
export function repGoalStatus(value: number, g: Goal, userId: string): GoalStatus | null {
  const r = g.perRep[userId];
  if (!r) return null;
  if (value >= r.full - 1e-9) return "met";
  if (g.partial && !g.snapshot && value >= r.scaled - 1e-9) return "on_track";
  return "missed";
}

// Goals come from config/goals.json as RATES (per rep per day, per rep per
// week, or team per week). Per-rep rates apply to each rep in
// config/sales-reps.json scaled by that rep's kpiMultiplier (or replaced by a
// goalOverrides entry), for the days the rep was on the team inside the
// period (startDate / endDate), and the team goal is the SUM of every rep's
// goal, so it follows the roster on each date rather than a fixed head count. For
// a selected date range the dashboard turns the rate into a goal for the
// whole period, then scales it to the elapsed portion so an in-progress
// period can be judged fairly. Nothing here is invented: a KPI without a
// configured rate is "Goal not set".

import raw from "../../config/goals.json";
import { dayKeysBetween, type DateRange } from "@/lib/dates";
import { activeDays, activeReps, isActiveOn, repRate, rosterDay, salesReps, tenureNote } from "@/lib/reps";

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
  /** How the rate is configured: per rep per day, per rep per week, or team-wide per week. */
  unit: "day" | "week" | "team-week";
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

/**
 * Per-rep goals for a KPI over the range: each rep's rate applied to the days
 * they were on the team inside the period (a rep who joined or left mid-period
 * gets a pro-rated goal; one not on the team at all gets none), the team goal
 * as their sum, and the plain-language basis. Owner request 2026-11-17.
 */
function repGoals(kpiKey: string, base: number, unit: "day" | "week", range: DateRange): { perRep: Record<string, RepGoal>; full: number; scaled: number; teamRate: number; count: number; basis: string } {
  const perUnit = unit === "day" ? 1 : 7;
  const day = rosterDay(range);
  const perRep: Record<string, RepGoal> = {};
  let full = 0;
  let scaled = 0;
  let teamRate = 0;
  let count = 0;
  const exceptions: string[] = [];
  const tenure: string[] = [];
  for (const r of salesReps) {
    const daysOn = activeDays(r, range.start, range.fullEnd);
    if (daysOn <= 0) continue;
    const rate = repRate(r, kpiKey, base);
    const elapsedOn = range.partial ? Math.min(daysOn, activeDays(r, range.start, range.end)) : daysOn;
    const g: RepGoal = { full: (rate * daysOn) / perUnit, scaled: (rate * elapsedOn) / perUnit, rate };
    perRep[r.userId] = g;
    full += g.full;
    scaled += g.scaled;
    if (isActiveOn(r, day)) {
      count += 1;
      teamRate += rate;
    }
    if (Math.abs(rate - base) > 1e-9) exceptions.push(`${r.name} ${fmt(rate)}`);
    const note = tenureNote(r, range.start, range.fullEnd);
    if (note) tenure.push(`${r.name} ${note}`);
  }
  const basis = `${fmt(base)} per rep per ${unit}${exceptions.length ? ` (${exceptions.join(", ")})` : ""}, ${count} rep${count === 1 ? "" : "s"} on the team at the end of the period${tenure.length ? ` (${tenure.join("; ")}: counted for their days on the team)` : ""}, team ${fmt(teamRate)} per ${unit}`;
  return { perRep, full, scaled, teamRate, count, basis };
}

export function goalFor(kpiKey: string, range: DateRange): Goal | null {
  if (goals.noGoal?.includes(kpiKey)) return null;
  const days = Math.max(1, dayKeysBetween(range.start, range.fullEnd).length);
  const fullMs = range.fullEnd.getTime() - range.start.getTime();
  const elapsedFraction = range.partial && fullMs > 0 ? Math.min(1, Math.max(0, (range.end.getTime() - range.start.getTime()) / fullMs)) : 1;
  const dayWord = days === 1 ? "day" : "days";

  const perDay = num(goals.perRepPerDay?.[kpiKey]);
  if (perDay !== null) {
    const r = repGoals(kpiKey, perDay, "day", range);
    return { kpiKey, full: r.full, scaled: r.scaled, perRep: r.perRep, basis: `${r.basis} × ${days} ${dayWord}`, elapsedFraction, partial: range.partial, snapshot: false, unit: "day" };
  }

  const perWeek = num(goals.perRepPerWeek?.[kpiKey]);
  if (perWeek !== null) {
    if (goals.snapshotKpis?.includes(kpiKey)) {
      // Snapshot KPIs compare the current count with the weekly rate of the reps on the team now.
      const perRep: Record<string, RepGoal> = {};
      const exceptions: string[] = [];
      let team = 0;
      const reps = activeReps(range);
      for (const rep of reps) {
        const rate = repRate(rep, kpiKey, perWeek);
        perRep[rep.userId] = { full: rate, scaled: rate, rate };
        team += rate;
        if (Math.abs(rate - perWeek) > 1e-9) exceptions.push(`${rep.name} ${fmt(rate)}`);
      }
      return {
        kpiKey,
        full: team,
        scaled: team,
        perRep,
        basis: `at least ${fmt(perWeek)} per rep per week${exceptions.length ? ` (${exceptions.join(", ")})` : ""}, ${reps.length} reps on the team, team ${fmt(team)} per week, compared with the current snapshot (not scaled to the period)`,
        elapsedFraction: 1,
        partial: false,
        snapshot: true,
        unit: "week",
      };
    }
    const r = repGoals(kpiKey, perWeek, "week", range);
    return { kpiKey, full: r.full, scaled: r.scaled, perRep: r.perRep, basis: `${r.basis}, pro-rated to ${days} ${dayWord}`, elapsedFraction, partial: range.partial, snapshot: false, unit: "week" };
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
      unit: "team-week",
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

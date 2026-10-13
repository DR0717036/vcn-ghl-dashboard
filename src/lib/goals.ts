// Goals come from config/goals.json as RATES (per rep per day, per rep per
// week, or team per week). For a selected date range the dashboard turns
// the rate into a goal for the whole period, then scales it to the elapsed
// portion so an in-progress period can be judged fairly. Nothing here is
// invented: a KPI without a configured rate is "Goal not set".

import raw from "../../config/goals.json";
import { dayKeysBetween, type DateRange } from "@/lib/dates";
import { salesReps } from "@/lib/reps";

interface GoalsFile {
  perRepPerDay?: Record<string, number>;
  perRepPerWeek?: Record<string, number>;
  teamPerWeek?: Record<string, number>;
  snapshotKpis?: string[];
  noGoal?: string[];
}

const goals = raw as unknown as GoalsFile;

export interface Goal {
  kpiKey: string;
  /** Team goal for the whole selected period. */
  full: number;
  /** Team goal for the portion of the period elapsed so far (equals full once the period is over, or for snapshots). */
  scaled: number;
  /** Per-rep versions, when the goal is defined per rep. */
  perRepFull: number | null;
  perRepScaled: number | null;
  /** Plain-language derivation, e.g. "100 per rep per day × 6 reps × 7 days". */
  basis: string;
  elapsedFraction: number;
  partial: boolean;
  /** Snapshot KPIs compare the current value with the full weekly goal; nothing is scaled. */
  snapshot: boolean;
}

export type GoalStatus = "met" | "on_track" | "missed";

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = { met: "Met", on_track: "On Track", missed: "Missed" };

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

export function goalFor(kpiKey: string, range: DateRange): Goal | null {
  if (goals.noGoal?.includes(kpiKey)) return null;
  const reps = salesReps.length;
  const days = Math.max(1, dayKeysBetween(range.start, range.fullEnd).length);
  const fullMs = range.fullEnd.getTime() - range.start.getTime();
  const elapsedFraction = range.partial && fullMs > 0 ? Math.min(1, Math.max(0, (range.end.getTime() - range.start.getTime()) / fullMs)) : 1;
  const dayWord = days === 1 ? "day" : "days";

  const perDay = num(goals.perRepPerDay?.[kpiKey]);
  if (perDay !== null) {
    const perRepFull = perDay * days;
    const full = perRepFull * reps;
    return {
      kpiKey,
      full,
      scaled: full * elapsedFraction,
      perRepFull,
      perRepScaled: perRepFull * elapsedFraction,
      basis: `${perDay.toLocaleString("en-US")} per rep per day × ${reps} reps × ${days} ${dayWord}`,
      elapsedFraction,
      partial: range.partial,
      snapshot: false,
    };
  }

  const perWeek = num(goals.perRepPerWeek?.[kpiKey]);
  if (perWeek !== null) {
    if (goals.snapshotKpis?.includes(kpiKey)) {
      const full = perWeek * reps;
      return {
        kpiKey,
        full,
        scaled: full,
        perRepFull: perWeek,
        perRepScaled: perWeek,
        basis: `at least ${perWeek} per rep × ${reps} reps, compared with the current snapshot (not scaled to the period)`,
        elapsedFraction: 1,
        partial: false,
        snapshot: true,
      };
    }
    const perRepFull = (perWeek / 7) * days;
    const full = perRepFull * reps;
    return {
      kpiKey,
      full,
      scaled: full * elapsedFraction,
      perRepFull,
      perRepScaled: perRepFull * elapsedFraction,
      basis: `${perWeek} per rep per week × ${reps} reps, pro-rated to ${days} ${dayWord}`,
      elapsedFraction,
      partial: range.partial,
      snapshot: false,
    };
  }

  const team = num(goals.teamPerWeek?.[kpiKey]);
  if (team !== null) {
    const full = (team / 7) * days;
    return {
      kpiKey,
      full,
      scaled: full * elapsedFraction,
      perRepFull: null,
      perRepScaled: null,
      basis: `${team} team-wide per week, pro-rated to ${days} ${dayWord}`,
      elapsedFraction,
      partial: range.partial,
      snapshot: false,
    };
  }

  return null;
}

/** Met: at or above the full-period goal. On Track: in progress and at or above the elapsed-portion goal. Missed: below it. */
export function goalStatus(value: number, g: Goal): GoalStatus {
  if (value >= g.full - 1e-9) return "met";
  if (g.partial && !g.snapshot && value >= g.scaled - 1e-9) return "on_track";
  return "missed";
}

/** Same rule applied to one rep's value against the per-rep goal. */
export function repGoalStatus(value: number, g: Goal): GoalStatus | null {
  if (g.perRepFull === null || g.perRepScaled === null) return null;
  if (value >= g.perRepFull - 1e-9) return "met";
  if (g.partial && !g.snapshot && value >= g.perRepScaled - 1e-9) return "on_track";
  return "missed";
}

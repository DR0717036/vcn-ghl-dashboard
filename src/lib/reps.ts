// The sales reps for per-rep goals, the Program Submissions table, quotas,
// and commission estimates come from config/sales-reps.json and are matched
// to GHL users by user id. Everyone else in GHL still counts toward team
// totals as "Other users, not sales reps".

import raw from "../../config/sales-reps.json";
import { getDb } from "@/lib/db";

export interface Rep {
  name: string;
  /** GHL user id (the id in GHL's user list). */
  userId: string;
  email?: string;
  /** Scales every per-rep goal rate: 1.0 full-time, 0.5 part-time. */
  kpiMultiplier: number;
  /** Combined submissions expected in a calendar month. */
  monthlyQuota: number;
  /** A plan name in config/commission.json. */
  commissionPlan: string;
  /** Fixed goal rates for specific KPIs, in the KPI's own unit, replacing base × multiplier. */
  goalOverrides?: Record<string, number>;
  /** Path under public/ to the rep's photo (e.g. "reps/jane-doe.jpg"); initials are shown when missing. */
  photo?: string;
}

export const salesReps: Rep[] = (raw as { reps: Rep[] }).reps;

/** One rep's goal rate for a KPI: the override if set, otherwise the base rate × the rep's multiplier. */
export function repRate(rep: Rep, kpiKey: string, base: number): number {
  const o = rep.goalOverrides?.[kpiKey];
  if (typeof o === "number" && Number.isFinite(o) && o >= 0) return o;
  const mult = typeof rep.kpiMultiplier === "number" && Number.isFinite(rep.kpiMultiplier) && rep.kpiMultiplier >= 0 ? rep.kpiMultiplier : 1;
  return base * mult;
}

export interface RepRoster {
  /** GHL user id → configured rep (every configured rep, matched or not, so rows never disappear). */
  byUserId: Map<string, Rep>;
  /** Configured reps whose user id is not in GHL's user list (shown as a warning, never silently dropped). */
  unmatched: Rep[];
  /** Number of reps in config. */
  count: number;
}

export function repRoster(): RepRoster {
  const known = new Set((getDb().prepare(`SELECT id FROM users`).all() as { id: string }[]).map((u) => u.id));
  const byUserId = new Map<string, Rep>();
  const unmatched: Rep[] = [];
  for (const rep of salesReps) {
    byUserId.set(rep.userId, rep);
    if (!known.has(rep.userId)) unmatched.push(rep);
  }
  return { byUserId, unmatched, count: salesReps.length };
}

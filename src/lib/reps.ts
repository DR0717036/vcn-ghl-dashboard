// The sales reps for per-rep goals, the Program Submissions table, quotas,
// and commission estimates come from config/sales-reps.json and are matched
// to GHL users by user id. Everyone else in GHL still counts toward team
// totals as "Other users, not sales reps".
//
// Tenure (owner request 2026-11-17): a rep may carry a startDate and/or an
// endDate (New York calendar days, inclusive). Rep lists, leaderboards,
// goals, quotas, pace projections, and the reports use the reps on the team
// on the day a range is judged on (its last day; today for a period still in
// progress), and every per-rep goal is pro-rated to the days the rep was on
// the team inside the period. History is never dropped: `salesReps` is the
// full configured list, so commission, invoices, and drilldowns for the days
// a former rep worked stay correct.

import raw from "../../config/sales-reps.json";
import { addDays, dayKeysBetween, fmtDay, nyDayKey, nyParts, parseNyDay, type DateRange } from "@/lib/dates";
import { getDb } from "@/lib/db";

export interface Rep {
  name: string;
  /** GHL user id (the id in GHL's user list). */
  userId: string;
  /** The address on the GHL user record (informational). */
  email?: string;
  /** The Google account the rep signs in with (config/sales-reps.json); empty = cannot sign in yet. */
  signInEmail?: string;
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
  /** First day on the team, "YYYY-MM-DD" in New York; missing = since the start of history. */
  startDate?: string;
  /** Last day on the team (inclusive), "YYYY-MM-DD" in New York; missing = still on the team. */
  endDate?: string;
}

/** Every configured rep, present and former. Use this for history (commission, invoices, matching events to people); use activeReps / repRoster for lists and goals. */
export const salesReps: Rep[] = (raw as { reps: Rep[] }).reps;

/** One rep's goal rate for a KPI: the override if set, otherwise the base rate × the rep's multiplier. */
export function repRate(rep: Rep, kpiKey: string, base: number): number {
  const o = rep.goalOverrides?.[kpiKey];
  if (typeof o === "number" && Number.isFinite(o) && o >= 0) return o;
  const mult = typeof rep.kpiMultiplier === "number" && Number.isFinite(rep.kpiMultiplier) && rep.kpiMultiplier >= 0 ? rep.kpiMultiplier : 1;
  return base * mult;
}

/** True when the rep is on the team on the New York calendar day `dayKey` ("YYYY-MM-DD"). */
export function isActiveOn(rep: Rep, dayKey: string): boolean {
  if (rep.startDate && dayKey < rep.startDate) return false;
  if (rep.endDate && dayKey > rep.endDate) return false;
  return true;
}

/** The New York day a range is judged on: its last day, which is today for a period still in progress. */
export function rosterDay(asOf: DateRange | Date): string {
  if (asOf instanceof Date) return nyDayKey(asOf);
  return nyDayKey(new Date(asOf.end.getTime() - 1));
}

/** The reps on the team on the day the range (or instant) is judged on. */
export function activeReps(asOf: DateRange | Date): Rep[] {
  const day = rosterDay(asOf);
  return salesReps.filter((r) => isActiveOn(r, day));
}

/** Days of [from, to) on which the rep was on the team, counting a partly covered day by its covered share (so a month in progress gives e.g. 16.4). */
export function activeDays(rep: Rep, from: Date, to: Date): number {
  let total = 0;
  for (const key of dayKeysBetween(from, to)) {
    if (!isActiveOn(rep, key)) continue;
    const d0 = parseNyDay(key) as Date;
    const d1 = addDays(d0, 1);
    const covered = Math.min(to.getTime(), d1.getTime()) - Math.max(from.getTime(), d0.getTime());
    if (covered > 0) total += covered / (d1.getTime() - d0.getTime());
  }
  return total;
}

/** Milliseconds of [from, to) that fall on days the rep was on the team. */
export function activeMs(rep: Rep, from: Date, to: Date): number {
  let total = 0;
  for (const key of dayKeysBetween(from, to)) {
    if (!isActiveOn(rep, key)) continue;
    const d0 = parseNyDay(key) as Date;
    const d1 = addDays(d0, 1);
    total += Math.max(0, Math.min(to.getTime(), d1.getTime()) - Math.max(from.getTime(), d0.getTime()));
  }
  return total;
}

/** Share of [from, to) the rep was on the team, 0–1. */
export function tenureShare(rep: Rep, from: Date, to: Date): number {
  const span = to.getTime() - from.getTime();
  return span > 0 ? Math.min(1, activeMs(rep, from, to) / span) : 0;
}

/** True when the rep was on the team at some point inside [from, to). */
export function tenureOverlaps(rep: Rep, from: Date, to: Date): boolean {
  return activeMs(rep, from, to) > 0;
}

/** "from Nov 16", "through Nov 8", or "from Nov 16 through Nov 20" when the rep's tenure covers only part of [from, to); null when it covers all of it. */
export function tenureNote(rep: Rep, from: Date, to: Date): string | null {
  const first = nyDayKey(from);
  const last = nyDayKey(new Date(to.getTime() - 1));
  const startsInside = Boolean(rep.startDate && rep.startDate > first);
  const endsInside = Boolean(rep.endDate && rep.endDate < last);
  if (!startsInside && !endsInside) return null;
  const parts: string[] = [];
  if (startsInside) parts.push(`from ${fmtDay(parseNyDay(rep.startDate) as Date)}`);
  if (endsInside) parts.push(`through ${fmtDay(parseNyDay(rep.endDate) as Date)}`);
  return parts.join(" ");
}

/** Why a configured rep is not on the roster on `day`: "former rep, through Nov 8" or "starts Nov 16". */
export function inactiveLabel(rep: Rep, day: string): string {
  if (rep.endDate && day > rep.endDate) return `former rep, through ${fmtDay(parseNyDay(rep.endDate) as Date)}`;
  if (rep.startDate && day < rep.startDate) return `starts ${fmtDay(parseNyDay(rep.startDate) as Date)}`;
  return "not on the team";
}

/** Working-day keys (weekday numbers from config/weekly-report.json) inside [from, to) on which the rep was on the team. */
export function repWorkingDayKeys(rep: Rep, from: Date, to: Date, workingDays: number[]): string[] {
  return dayKeysBetween(from, to).filter((k) => {
    const d = parseNyDay(k);
    return d ? workingDays.includes(nyParts(d).wd) && isActiveOn(rep, k) : false;
  });
}

export interface RepRoster {
  /** GHL user id → rep on the team on the roster day (every such rep, matched to a GHL user or not, so rows never disappear). */
  byUserId: Map<string, Rep>;
  /** Reps on the roster whose user id is not in GHL's user list (shown as a warning, never silently dropped). */
  unmatched: Rep[];
  /** Number of reps on the roster. */
  count: number;
  /** Configured reps not on the team on the roster day (former, or not started yet), by user id, so their activity can be labeled rather than mistaken for a stranger's. */
  inactive: Map<string, Rep>;
  /** The New York day the roster is for. */
  day: string;
}

/** The roster for a range (judged on its last day) or an instant (judged on that day); today when omitted. */
export function repRoster(asOf: DateRange | Date = new Date()): RepRoster {
  const day = rosterDay(asOf);
  const known = new Set((getDb().prepare(`SELECT id FROM users`).all() as { id: string }[]).map((u) => u.id));
  const byUserId = new Map<string, Rep>();
  const inactive = new Map<string, Rep>();
  const unmatched: Rep[] = [];
  for (const rep of salesReps) {
    if (!isActiveOn(rep, day)) {
      inactive.set(rep.userId, rep);
      continue;
    }
    byUserId.set(rep.userId, rep);
    if (!known.has(rep.userId)) unmatched.push(rep);
  }
  return { byUserId, unmatched, count: byUserId.size, inactive, day };
}

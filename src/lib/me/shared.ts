// Helpers shared by the rep dashboard's sections (moved here from the former
// My scorecard module when that section was removed, owner request
// 2026-11-24): the comparison period as a range, a rep's own goal share with
// its status, and the rep's best calendar month of combined submissions.

import { addMonths, nyParts, resolveRange, startOfMonth, type DateRange } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { repGoalStatus, type Goal, type GoalStatus } from "@/lib/goals";
import type { Rep } from "@/lib/reps";
import { computeSubmissions } from "@/lib/submissions";

const n = (v: number) => v.toLocaleString("en-US");

/** The rep's own goal for the whole range and for the elapsed part of it, with the status. */
export interface GoalPart {
  goal: { full: number; scaled: number } | null;
  status: GoalStatus | null;
  /** Shown instead of a goal when a weekly-rate goal has no sensible one-day share. */
  goalNote?: string;
}

/** The rep's best calendar month of combined submissions, from the monthly history (shown on My submissions). */
export interface BestMonth {
  count: number;
  monthLabel: string;
  mtd: number;
  monthNow: string;
  toBeat: number;
  isCurrent: boolean;
  /** The last six calendar months (fewer when tracking began later), oldest first, the current month last. */
  history: BestMonthPoint[];
}

export interface BestMonthPoint {
  /** "Oct 2026" */
  label: string;
  /** "Oct" */
  short: string;
  count: number;
  isCurrent: boolean;
  isBest: boolean;
}

/** The comparison period as a range of its own (values only; goals are not needed for it). */
export function prevRangeOf(range: DateRange): DateRange {
  return { ...range, start: range.prevStart, end: range.prevEnd, fullEnd: range.prevEnd, partial: false };
}

export function goalPartFor(rep: Rep, g: Goal | null, value: number | null, singleDay: boolean): GoalPart {
  const r = g?.perRep[rep.userId];
  if (!g || !r || r.full <= 0) return { goal: null, status: null };
  // A weekly rate has no sensible one-day share (4 bookings a week is not 0.57 a day): show it as text for a single day.
  if (singleDay && g.unit === "week") return { goal: null, status: null, goalNote: `Weekly goal ${n(Math.round(r.rate))}` };
  return { goal: { full: r.full, scaled: r.scaled }, status: value === null ? null : repGoalStatus(value, g, rep.userId) };
}

/**
 * One rep's share of a team goal as a Goal of its own, so the shared goal
 * pill and goal text judge the rep's figure against the rep's own numbers.
 * Null when the goal has no entry for the rep.
 */
export function repGoalOf(g: Goal | null, rep: Rep): Goal | null {
  const r = g?.perRep[rep.userId];
  if (!g || !r || r.full <= 0) return null;
  const unit = g.unit === "day" ? "per working day" : "per week";
  return { ...g, full: r.full, scaled: r.scaled, perRep: {}, basis: `your own goal, ${n(Math.round(r.rate * 10) / 10)} ${unit}, pro-rated to the range (team basis: ${g.basis})` };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (d: Date) => {
  const p = nyParts(d);
  return `${MONTHS[p.m - 1]} ${p.y}`;
};

/** The rep's combined submissions per calendar month from the first milestone event to now; the best month. */
export function bestMonthFor(rep: Rep, now: Date): BestMonth | null {
  const first = getDb().prepare(`SELECT MIN(event_time) AS t FROM milestone_events WHERE kind = 'milestone'`).get() as { t: string | null } | undefined;
  if (!first?.t) return null;
  const thisMonth = resolveRange("this_month", now);
  let best: { count: number; monthLabel: string; isCurrent: boolean } | null = null;
  let mtd = 0;
  const months: Omit<BestMonthPoint, "isBest">[] = [];
  for (let mStart = startOfMonth(new Date(first.t)); mStart.getTime() < thisMonth.fullEnd.getTime(); mStart = addMonths(mStart, 1)) {
    const isCurrent = mStart.getTime() === thisMonth.start.getTime();
    const mEnd = addMonths(mStart, 1);
    const range: DateRange = { ...thisMonth, start: mStart, end: isCurrent ? thisMonth.end : mEnd, fullEnd: mEnd, partial: isCurrent, label: monthLabel(mStart) };
    const count = computeSubmissions(range, "all").rows.find((r) => r.userId === rep.userId)?.total ?? 0;
    if (isCurrent) mtd = count;
    if (count > 0 && (!best || count > best.count)) best = { count, monthLabel: monthLabel(mStart), isCurrent };
    months.push({ label: monthLabel(mStart), short: MONTHS[nyParts(mStart).m - 1], count, isCurrent });
  }
  if (!best) return null;
  const bestLabel = best.monthLabel;
  return { ...best, mtd, monthNow: monthLabel(thisMonth.start), toBeat: Math.max(0, best.count + 1 - mtd), history: months.slice(-6).map((m) => ({ ...m, isBest: m.label === bestLabel })) };
}

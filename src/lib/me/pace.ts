// "My pace" for one rep: month-to-date submissions against the monthly
// quota, the projected month-end, what is needed per remaining working day,
// and the weekly goal streak. The month figures are the same month-to-date
// columns Program Submissions shows (computeCommission); the working-day
// arithmetic is the weekly report's (config/weekly-report.json workingDays);
// the streak judges each completed Monday-to-Sunday week with the same
// per-rep weekly submissions goal the Rep Performance cards use.

import { computeCommission, quotaStatus, type QuotaStatus } from "@/lib/commission";
import { addDays, dayKeysBetween, fmtDay, fmtRangeShort, nyDayKey, nyParts, parseNyDay, resolveRange, startOfDay } from "@/lib/dates";
import type { Rep } from "@/lib/reps";
import { computeSubmissions } from "@/lib/submissions";
import { lastCompletedWeekStart, weekRange, weeklyReportConfig } from "@/lib/weeklyReport/config";

export interface StreakWeek {
  /** "Oct 13 – Oct 19" */
  label: string;
  start: string;
  combined: number | null;
  goal: number | null;
  met: boolean | null;
  /** The week in progress (not part of the streak yet). */
  current: boolean;
}

export interface RepPaceData {
  monthLabel: string;
  monthShort: string;
  mtd: number;
  quota: number;
  quotaPct: number | null;
  quotaStatus: QuotaStatus;
  /** Where the rep would be if the quota were spread evenly over the month's working days. */
  expectedToday: number | null;
  projected: number | null;
  neededPerDay: number | null;
  workingDaysTotal: number;
  workingDaysElapsed: number;
  workingDaysRemaining: number;
  streak: { count: number; weeks: StreakWeek[]; weeklyGoal: number | null };
  notes: string[];
}

function workingDayKeys(start: Date, end: Date, days: number[]): string[] {
  return dayKeysBetween(start, end).filter((k) => {
    const d = parseNyDay(k);
    return d ? days.includes(nyParts(d).wd) : false;
  });
}

const STREAK_WEEKS = 8;

export function computeRepPace(rep: Rep, now: Date): RepPaceData {
  const cfg = weeklyReportConfig();
  const month = resolveRange("this_month", now);
  const commission = computeCommission(month, now);
  const r = commission.reps[rep.userId];
  const mtd = r?.submissionsMtd ?? 0;
  const quota = r?.monthlyQuota ?? 0;
  const allWd = workingDayKeys(month.start, month.fullEnd, cfg.workingDays);
  const elapsedWd = workingDayKeys(month.start, addDays(startOfDay(now), 1), cfg.workingDays).filter((k) => allWd.includes(k));
  const remainingWd = allWd.length - elapsedWd.length;
  const projected = elapsedWd.length > 0 ? Math.round((mtd / elapsedWd.length) * allWd.length) : null;
  const neededPerDay = quota > 0 && remainingWd > 0 ? Math.max(0, quota - mtd) / remainingWd : null;

  // Weekly goal streak: the last completed weeks, newest first, plus the week in progress.
  const weeks: StreakWeek[] = [];
  const thisWeekStart = addDays(lastCompletedWeekStart(now), 7);
  let weeklyGoal: number | null = null;
  for (let back = 0; back <= STREAK_WEEKS; back++) {
    const ws = addDays(thisWeekStart, -7 * back);
    const range = weekRange(ws, now);
    const subs = computeSubmissions(range, "all");
    const row = subs.rows.find((x) => x.userId === rep.userId);
    const goal = subs.goal?.perRep[rep.userId]?.full ?? null;
    if (back === 1 && goal !== null) weeklyGoal = goal;
    const combined = subs.value === null ? null : (row?.total ?? 0);
    weeks.push({
      label: fmtRangeShort(range.start, range.fullEnd),
      start: nyDayKey(ws),
      combined,
      goal,
      met: combined === null || goal === null ? null : combined >= goal - 1e-9,
      current: back === 0,
    });
  }
  let count = 0;
  for (const w of weeks.slice(1)) {
    if (w.met === true) count += 1;
    else break;
  }
  // The week in progress extends the streak once it is already met.
  if (weeks[0]?.met === true) count += 1;

  return {
    monthLabel: commission.monthLabel,
    monthShort: `${fmtDay(month.start)} – ${fmtDay(new Date(month.fullEnd.getTime() - 1))}`,
    mtd,
    quota,
    quotaPct: quota > 0 ? mtd / quota : null,
    quotaStatus: quota > 0 ? quotaStatus(mtd / quota, commission.monthElapsedFraction) : "neutral",
    expectedToday: quota > 0 && allWd.length > 0 ? (quota * elapsedWd.length) / allWd.length : null,
    projected,
    neededPerDay,
    workingDaysTotal: allWd.length,
    workingDaysElapsed: elapsedWd.length,
    workingDaysRemaining: remainingWd,
    streak: { count, weeks: weeks.slice().reverse(), weeklyGoal },
    notes: [
      "Month to date — your combined submissions this calendar month (CA 101 + IAU App, every semester), the same figure as the month-to-date column of Program Submissions, against the monthly quota in your rep settings.",
      `Working days — ${cfg.workingDays.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ")} (config/weekly-report.json). Expected by today spreads the quota evenly over the month's working days.`,
      "Projected month-end — your current rate per working day carried to the end of the month. Needed per day — the gap to quota spread over the working days left.",
      "Weekly goal streak — consecutive completed Monday-to-Sunday weeks (newest first) in which your combined submissions reached your own weekly goal; the week in progress joins the streak once it is met. Weeks before milestone tracking began cannot be judged.",
    ],
  };
}

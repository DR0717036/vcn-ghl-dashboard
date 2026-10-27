// "My pace" for one rep: month-to-date submissions against the monthly
// quota, the projected month-end, what is needed per remaining working day,
// and the weekly goal streak. The month figures are the same month-to-date
// columns Program Submissions shows (computeCommission); the working-day
// arithmetic is the weekly report's (config/weekly-report.json workingDays);
// the streak judges each completed Monday-to-Sunday week with the same
// per-rep weekly submissions goal the Rep Performance cards use.

import { computeCommission, planFor, quotaStatus, type QuotaStatus } from "@/lib/commission";
import { getDb } from "@/lib/db";
import { computeInvoiceLines, repSubmissions } from "@/lib/invoices/lines";
import type { MilestoneResult } from "@/lib/milestones";
import { dailyMotto } from "./mottos";
import { addDays, addMonths, dayKeysBetween, fmtDay, fmtRangeShort, nyDayKey, nyParts, parseNyDay, resolveRange, startOfDay, startOfMonth } from "@/lib/dates";
import type { Rep } from "@/lib/reps";
import { computeSubmissions } from "@/lib/submissions";
import { lastCompletedWeekStart, weekRange, weeklyReportConfig } from "@/lib/weeklyReport/config";

/** One submission (or, on won-based plans, one won) inside a week, with the commission it earned under the month's pricing. */
export interface WeekItem {
  contactId: string | null;
  name: string;
  program: string;
  event: string;
  eventAt: string;
  eventDay: string;
  kind: "submission" | "won";
  amount: number;
  tier: string;
}

export interface StreakWeek {
  /** "Oct 13 – Oct 19" */
  label: string;
  start: string;
  combined: number | null;
  goal: number | null;
  met: boolean | null;
  /** The week in progress (not part of the streak yet). */
  current: boolean;
  /** The submissions behind the count (plus the week's wons on won-based plans), oldest first. */
  items: WeekItem[];
  /** Commission earned by the week's items under their month's pricing. */
  commission: number;
}

export interface RepPaceData {
  monthLabel: string;
  monthShort: string;
  mtd: number;
  quota: number;
  quotaPct: number | null;
  quotaStatus: QuotaStatus;
  /** True when month-to-date is at or above the quota spread evenly over the working days done. */
  onPace: boolean;
  /** Opportunity Value behind this month's submissions (value at each event, distinct opportunities). Never revenue. */
  oppValue: number;
  /** This month's commission estimate and its calculation. */
  commissionMtd: { amount: number | null; calc: string };
  /** Combined submissions this week and last week (the "vs last week" pill). */
  thisWeek: number | null;
  lastWeek: number | null;
  /** What the month could pay at the plan's next threshold, or null when the plan has none. */
  potential: string | null;
  /** The day's motivational line (rotates daily). */
  motto: string;
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
  const expectedToday = quota > 0 && allWd.length > 0 ? (quota * elapsedWd.length) / allWd.length : null;
  // Opportunity Value behind this rep's submissions this month: the rep's line in each part of Program Submissions.
  const monthSubs = computeSubmissions(month, "all");
  const partValue = (p: MilestoneResult | undefined) => p?.reps.find((x) => x.userId === rep.userId)?.value ?? 0;
  const oppValue = monthSubs.parts ? partValue(monthSubs.parts.ca101) + monthSubs.parts.iau.reduce((t, p) => t + partValue(p), 0) : 0;

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
      items: [],
      commission: 0,
    });
  }
  // Items per week: the rep's submissions over the span, priced by their month (the invoice line rules), plus wons on won-based plans.
  const plan = planFor(rep);
  const spanStart = addDays(thisWeekStart, -7 * STREAK_WEEKS);
  const priced = new Map<string, { amount: number; tier: string }>();
  const wonLines: WeekItem[] = [];
  for (let mStart = startOfMonth(spanStart); mStart.getTime() < now.getTime(); mStart = addMonths(mStart, 1)) {
    const mEnd = addMonths(mStart, 1);
    for (const l of computeInvoiceLines(rep, mStart, mEnd.getTime() > now.getTime() ? now : mEnd).lines) {
      if (l.kind === "submission") priced.set(`${l.contactId ?? ""}|${l.eventAt}`, { amount: l.amount, tier: l.tier });
      else wonLines.push({ contactId: l.contactId, name: l.contactName, program: l.program, event: "Won", eventAt: l.eventAt, eventDay: l.eventDay, kind: "won", amount: l.amount, tier: l.tier });
    }
  }
  const subs = repSubmissions(rep, spanStart, now);
  const ids = [...new Set(subs.map((x) => x.contactId).filter((x): x is string => Boolean(x)))];
  const names = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    for (const c of getDb().prepare(`SELECT id, name FROM contacts WHERE id IN (${chunk.map(() => "?").join(",")})`).all(...chunk) as unknown as { id: string; name: string | null }[]) names.set(c.id, c.name);
  }
  for (const w of weeks) {
    const ws = parseNyDay(w.start) as Date;
    const we = addDays(ws, 7);
    const inWeek = (t: string) => t >= ws.toISOString() && t < we.toISOString();
    const items: WeekItem[] = subs.filter((x) => inWeek(x.at)).map((x) => {
      const p = priced.get(`${x.contactId ?? ""}|${x.at}`);
      return { contactId: x.contactId, name: (x.contactId ? names.get(x.contactId) : null) ?? "(no name)", program: x.program, event: x.event, eventAt: x.at, eventDay: fmtDay(new Date(x.at)), kind: "submission", amount: p?.amount ?? 0, tier: p?.tier ?? "" };
    });
    if (plan && plan.type !== "per_submission_retro") items.push(...wonLines.filter((x) => inWeek(x.eventAt)));
    items.sort((a, b) => (a.eventAt < b.eventAt ? -1 : 1));
    w.items = items;
    w.commission = items.reduce((t, x) => t + x.amount, 0);
  }
  // Potential: what the month pays at the plan's next threshold.
  const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const estimate = r?.commissionMtd.amount ?? 0;
  let potential: string | null = null;
  if (plan?.type === "per_submission_retro") {
    const t = plan.retroThreshold;
    potential = mtd >= t ? `Retro unlocked: every submission this month pays ${usd(plan.retroRate)}, so each new one adds ${usd(plan.retroRate)}.` : `Hit ${t} and this month pays ${usd(t * plan.retroRate)} (${t} × ${usd(plan.retroRate)}) — ${usd(t * plan.retroRate - estimate)} more than today.`;
  } else if (plan?.type === "per_won_tiered") {
    const wonMtd = r?.wonMtd ?? 0;
    potential = wonMtd >= plan.firstCount ? `The first ${plan.firstCount} won this month paid ${usd(plan.firstRate)} each; every further won adds ${usd(plan.thenRate)}.` : `Reach ${plan.firstCount} won and this month pays ${usd(plan.firstCount * plan.firstRate)} (${plan.firstCount} × ${usd(plan.firstRate)}) — ${usd(plan.firstCount * plan.firstRate - estimate)} more than today.`;
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
    onPace: expectedToday === null ? true : mtd >= expectedToday - 1e-9,
    oppValue,
    commissionMtd: { amount: r?.commissionMtd.amount ?? null, calc: r?.commissionMtd.label ?? "plan not found" },
    thisWeek: weeks[0]?.combined ?? null,
    lastWeek: weeks[1]?.combined ?? null,
    potential,
    motto: dailyMotto(now),
    expectedToday,
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
      "Opportunity Value — the value on each submitted opportunity at the time of its event, summed over your submissions this month; never revenue, cash, or commission. Commission — this month's estimate under your plan.",
      "Weekly chart — your combined submissions per Monday-to-Sunday week for the last 8 weeks and the week in progress; the dashed line is your own weekly goal; a bar is green when the week met it; the curve follows the bar tops. Hover a bar for the week's commission; click it for the submissions behind it, each priced by its month's rules (the retro rate applies to a whole month once it reaches the threshold, so a week's commission can rise later in the month). The pill compares this week so far with last week's full week.",
      "Potential — what this calendar month would pay at your plan's next threshold, compared with today's estimate.",
      "Weekly goal streak — consecutive completed weeks (newest first) in which your combined submissions reached your weekly goal; the week in progress joins the streak once it is met. Weeks before milestone tracking began cannot be judged.",
    ],
  };
}

// "My overview" for one rep: three cards (owner redesign 2026-11-18).
// 1. Momentum — this week's combined submissions against the weekly goal,
//    what the next submission is worth under the plan, the pay ladder
//    (quota, retro threshold), the Army / Veteran split this month, and the
//    last submission. When the month's commission estimate reaches $1,000
//    the card becomes "Commission earned this month" instead.
// 2. Next milestone — the plan's next threshold as a donut (submissions so
//    far of the threshold), plus the projected month-end and the needed per
//    working day, the same arithmetic as My pace.
// 3. Bounties — the rep's rank by submissions this month, then the weekly
//    and semester bounties from config/bounties.json with the rep's own
//    standing (src/lib/bounties.ts).
// Same functions as the team scorecard; reads the cache only.

import { computeBountyBoard, standingOf, type Standing, type WeeklyBounty, type SemesterBounty } from "@/lib/bounties";
import { computeCommission, planFor, type Plan } from "@/lib/commission";
import { addDays, fmtDay, nyDayKey, resolveRange, type DateRange } from "@/lib/dates";
import { repSubmissions } from "@/lib/invoices/lines";
import type { Rep } from "@/lib/reps";
import { activeReps } from "@/lib/reps";
import { computeSubmissions } from "@/lib/submissions";
import { monthPaceFor } from "./pace";

/** The month's commission estimate at or above which card 1 shows the commission instead of momentum. */
export const COMMISSION_CARD_THRESHOLD = 1000;

export interface Milestone {
  title: string;
  /** The headline line, e.g. "6 more submissions to unlock the $100 retro". */
  text: string;
  /** Progress toward the milestone, or null when there is none to show. */
  progress: { value: number; max: number } | null;
  /** The milestone is reached (retro unlocked) or the plan has a flat rate. */
  done: boolean;
  detail: string;
  /** What the donut counts: "submissions" or "won". */
  unit: "submissions" | "won";
  /** The month's projection and need, from the same arithmetic as My pace. */
  projected: number | null;
  neededPerDay: number | null;
  quota: number;
  mtd: number;
  workingDaysRemaining: number;
}

export interface LadderRung {
  label: string;
  amount: number;
  /** The rung is already reached this month. */
  done: boolean;
}

export interface Momentum {
  thisWeek: number | null;
  weeklyGoal: number | null;
  weekLabel: string;
  /** "Next submission is worth $75" (or won, for won-based plans); null without a plan. */
  nextWorth: { unit: string; amount: number; note: string | null } | null;
  ladder: LadderRung[];
  /** Combined submissions this month split by program. */
  split: { army: number; veteran: number };
  lastSubmission: { text: string; day: string | null; event: string | null };
}

export interface RepBounties {
  weekly: (WeeklyBounty & { mine: Standing | null }) | null;
  semester: (SemesterBounty & { mine: Standing | null; gap: number | null }) | null;
  notes: string[];
}

export interface RepOverview {
  monthLabel: string;
  /** Which card 1 shows. */
  mode: "momentum" | "commission";
  commission: { amount: number | null; calc: string; planLabel: string | null };
  momentum: Momentum;
  milestone: Milestone;
  rank: { rank: number | null; of: number; mtd: number; lastRank: number | null; lastOf: number; lastMtd: number; delta: number | null };
  bounties: RepBounties;
  notes: string[];
}

const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const n = (v: number) => v.toLocaleString("en-US");

function milestoneFor(plan: Plan | null, submissionsMtd: number, wonMtd: number): Omit<Milestone, "projected" | "neededPerDay" | "quota" | "mtd" | "workingDaysRemaining"> {
  if (!plan) return { title: "Next milestone", text: "No commission plan configured", progress: null, done: false, detail: "Ask Diego to set your plan in the rep settings.", unit: "submissions" };
  if (plan.type === "per_submission_retro") {
    const left = Math.max(0, plan.retroThreshold - submissionsMtd);
    if (left === 0) return { title: "Retro unlocked", text: `All submissions at ${usd(plan.retroRate)}`, progress: { value: submissionsMtd, max: plan.retroThreshold }, done: true, detail: `${n(submissionsMtd)} submissions this month, past the threshold of ${n(plan.retroThreshold)}; every one pays ${usd(plan.retroRate)} instead of ${usd(plan.rate)}.`, unit: "submissions" };
    return { title: "Next milestone", text: `${n(left)} more submission${left === 1 ? "" : "s"} to unlock the ${usd(plan.retroRate)} retro`, progress: { value: submissionsMtd, max: plan.retroThreshold }, done: false, detail: `${n(submissionsMtd)} of ${n(plan.retroThreshold)} this month; at ${n(plan.retroThreshold)}, every submission this month pays ${usd(plan.retroRate)} instead of ${usd(plan.rate)}.`, unit: "submissions" };
  }
  if (plan.type === "per_won_tiered") {
    const left = Math.max(0, plan.firstCount - wonMtd);
    if (left === 0) return { title: "Current rate", text: `${usd(plan.thenRate)} per won from here`, progress: { value: wonMtd, max: plan.firstCount }, done: true, detail: `${n(wonMtd)} won this month; the first ${n(plan.firstCount)} paid ${usd(plan.firstRate)} each, every one after pays ${usd(plan.thenRate)}.`, unit: "won" };
    return { title: "Next milestone", text: `${n(left)} more won at ${usd(plan.firstRate)} before the rate becomes ${usd(plan.thenRate)}`, progress: { value: wonMtd, max: plan.firstCount }, done: false, detail: `${n(wonMtd)} of the first ${n(plan.firstCount)} won this month at ${usd(plan.firstRate)} each; after that each won pays ${usd(plan.thenRate)}.`, unit: "won" };
  }
  return { title: "Current rate", text: `${usd(plan.rate)} per won opportunity`, progress: null, done: true, detail: `${n(wonMtd)} won this month. Submissions do not pay under this plan.`, unit: "won" };
}

/** What the next counted event is worth under the plan, and the pay ladder for the month. */
function payFor(plan: Plan | null, submissionsMtd: number, wonMtd: number, quota: number): { nextWorth: Momentum["nextWorth"]; ladder: LadderRung[] } {
  if (!plan) return { nextWorth: null, ladder: [] };
  if (plan.type === "per_submission_retro") {
    const unlocked = submissionsMtd >= plan.retroThreshold;
    const pay = (count: number) => (count >= plan.retroThreshold ? count * plan.retroRate : count * plan.rate);
    const ladder: LadderRung[] = [];
    if (quota > 0 && quota !== plan.retroThreshold) ladder.push({ label: `Hit quota (${n(quota)})`, amount: pay(quota), done: submissionsMtd >= quota });
    ladder.push({ label: quota === plan.retroThreshold ? `Hit quota (${n(plan.retroThreshold)}), retro` : `Hit ${n(plan.retroThreshold)}`, amount: pay(plan.retroThreshold), done: unlocked });
    ladder.sort((a, b) => a.amount - b.amount);
    const toUnlock = plan.retroThreshold - submissionsMtd;
    return {
      nextWorth: { unit: "submission", amount: unlocked ? plan.retroRate : plan.rate, note: unlocked ? "retro rate, unlocked this month" : toUnlock === 1 ? `and it unlocks the ${usd(plan.retroRate)} retro on every submission this month` : `${usd(plan.retroRate)} once the month reaches ${n(plan.retroThreshold)}` },
      ladder,
    };
  }
  if (plan.type === "per_won_tiered") {
    const first = wonMtd < plan.firstCount;
    return {
      nextWorth: { unit: "won", amount: first ? plan.firstRate : plan.thenRate, note: first ? `first ${n(plan.firstCount)} won of the month` : `after the first ${n(plan.firstCount)} won` },
      ladder: [{ label: `Hit ${n(plan.firstCount)} won`, amount: plan.firstCount * plan.firstRate, done: !first }],
    };
  }
  return { nextWorth: { unit: "won", amount: plan.rate, note: "flat rate" }, ladder: [] };
}

function rankOf(userId: string, rows: { userId: string | null; total: number }[], range: DateRange): { rank: number | null; of: number; mtd: number } {
  // The reps on the team at the end of that month (today for the month in progress).
  const roster = new Set(activeReps(range).map((r) => r.userId));
  const reps = rows.filter((r) => r.userId && roster.has(r.userId));
  const mine = reps.find((r) => r.userId === userId);
  if (!mine) return { rank: null, of: roster.size, mtd: 0 };
  return { rank: 1 + reps.filter((r) => r.total > mine.total).length, of: roster.size, mtd: mine.total };
}

/** "today", "yesterday", "N days ago" by New York calendar days. */
function agoText(iso: string, now: Date): string {
  const a = new Date(iso);
  const days = Math.round((Date.parse(nyDayKey(now)) - Date.parse(nyDayKey(a))) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${n(days)} days ago`;
}

export function computeRepOverview(rep: Rep, now: Date): RepOverview {
  const month = resolveRange("this_month", now);
  const lastMonth = resolveRange("last_month", now);
  const week = resolveRange("this_week", now);
  const commission = computeCommission(month, now);
  const mine = commission.reps[rep.userId];
  const plan = planFor(rep);
  const subs = computeSubmissions(month, "all");
  const subsLast = computeSubmissions(lastMonth, "all");
  const weekSubs = computeSubmissions(week, "all");
  const cur = rankOf(rep.userId, subs.value === null ? [] : subs.rows, month);
  const last = rankOf(rep.userId, subsLast.value === null ? [] : subsLast.rows, lastMonth);
  const mtd = mine?.submissionsMtd ?? 0;
  const wonMtd = mine?.wonMtd ?? 0;
  const quota = mine?.monthlyQuota ?? 0;
  const amount = mine?.commissionMtd.amount ?? null;

  // Momentum.
  const weekRow = weekSubs.rows.find((r) => r.userId === rep.userId);
  const weeklyGoal = weekSubs.goal?.perRep[rep.userId]?.full ?? null;
  const monthRow = subs.rows.find((r) => r.userId === rep.userId);
  const recent = repSubmissions(rep, addDays(now, -180), now);
  const lastSub = recent[recent.length - 1];
  const { nextWorth, ladder } = payFor(plan, mtd, wonMtd, quota);
  const momentum: Momentum = {
    thisWeek: weekSubs.value === null ? null : (weekRow?.total ?? 0),
    weeklyGoal,
    weekLabel: week.label,
    nextWorth,
    ladder,
    split: { army: monthRow?.ca101 ?? 0, veteran: monthRow?.iau ?? 0 },
    lastSubmission: lastSub ? { text: agoText(lastSub.at, now), day: fmtDay(new Date(lastSub.at)), event: lastSub.event } : { text: "none in the last 180 days", day: null, event: null },
  };

  // Next milestone, with the month's pace figures.
  const base = milestoneFor(plan, mtd, wonMtd);
  const pace = monthPaceFor(rep, now, mtd, quota);
  const milestone: Milestone = { ...base, projected: pace.projected, neededPerDay: pace.neededPerDay, quota, mtd, workingDaysRemaining: pace.workingDaysRemaining };

  // Bounties, with this rep's standing.
  const board = computeBountyBoard(now);
  const semMine = board.semester ? standingOf(board.semester.standings, rep.userId) : null;
  const bounties: RepBounties = {
    weekly: board.weekly ? { ...board.weekly, mine: standingOf(board.weekly.standings, rep.userId) } : null,
    semester: board.semester ? { ...board.semester, mine: semMine, gap: semMine && board.semester.leader ? Math.max(0, board.semester.leader.count - semMine.count) : null } : null,
    notes: board.notes,
  };

  const mode: RepOverview["mode"] = amount !== null && amount >= COMMISSION_CARD_THRESHOLD ? "commission" : "momentum";
  return {
    monthLabel: commission.monthLabel,
    mode,
    commission: { amount, calc: mine?.commissionMtd.label ?? "plan not found", planLabel: mine?.planLabel ?? null },
    momentum,
    milestone,
    rank: { ...cur, lastRank: last.rank, lastOf: last.of, lastMtd: last.mtd, delta: cur.rank !== null && last.rank !== null ? last.rank - cur.rank : null },
    bounties,
    notes: [
      `Momentum — this week's combined submissions (CA 101 + IAU App, every semester; Monday to now) against your own weekly goal; what the next counted submission (or won, on won-based plans) pays under your plan; the ladder is what this calendar month would pay at your quota and at the plan's threshold. The card switches to "Commission earned this month" once the month's estimate reaches ${usd(COMMISSION_CARD_THRESHOLD)}.`,
      "Army / Veteran — your submissions this month split by program (CA 101 submitted vs IAU App Submitted, every semester). Last submission — your most recent counted submission, by New York calendar day.",
      "Next milestone — your plan's threshold as a donut: the retro rate unlocks when the month's submissions reach the threshold (and then applies to every submission that month); tiered won plans pay the first-tier rate for the first wons of the month. Projected month-end and needed per working day are the My pace figures (your rate per working day carried to month end; the gap to quota over the working days left).",
      "Bounties — your place among the reps on the team by combined submissions this calendar month (ties share a rank), compared with your place last month; then the weekly and semester bounties from config/bounties.json.",
      ...board.notes,
    ],
  };
}

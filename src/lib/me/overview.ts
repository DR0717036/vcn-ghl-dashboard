// "My overview" for one rep: three tiles. Commission earned this month (the
// month-to-date estimate Program Submissions shows, with its calculation);
// the next milestone under the rep's plan (submission-retro: submissions
// left to unlock the retro rate; won-tiered: wons left at the first-tier
// rate; per-won-flat: the current rate); and the rep's rank by combined
// submissions this month against last month. Same functions as the team
// scorecard; reads the cache only.

import { computeCommission, planFor, type Plan } from "@/lib/commission";
import { resolveRange } from "@/lib/dates";
import type { Rep } from "@/lib/reps";
import { salesReps } from "@/lib/reps";
import { computeSubmissions } from "@/lib/submissions";

export interface Milestone {
  title: string;
  /** The headline line, e.g. "6 more submissions to unlock the $100 retro". */
  text: string;
  /** Progress toward the milestone, or null when there is none to show. */
  progress: { value: number; max: number } | null;
  /** The milestone is reached (retro unlocked) or the plan has a flat rate. */
  done: boolean;
  detail: string;
}

export interface RepOverview {
  monthLabel: string;
  commission: { amount: number | null; calc: string; planLabel: string | null };
  milestone: Milestone;
  rank: { rank: number | null; of: number; mtd: number; lastRank: number | null; lastOf: number; lastMtd: number; delta: number | null };
  notes: string[];
}

const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const n = (v: number) => v.toLocaleString("en-US");

function milestoneFor(plan: Plan | null, submissionsMtd: number, wonMtd: number): Milestone {
  if (!plan) return { title: "Next milestone", text: "No commission plan configured", progress: null, done: false, detail: "Ask Diego to set your plan in the rep settings." };
  if (plan.type === "per_submission_retro") {
    const left = Math.max(0, plan.retroThreshold - submissionsMtd);
    if (left === 0) return { title: "Retro unlocked", text: `All submissions at ${usd(plan.retroRate)}`, progress: { value: submissionsMtd, max: plan.retroThreshold }, done: true, detail: `${n(submissionsMtd)} submissions this month, past the threshold of ${n(plan.retroThreshold)}; every one pays ${usd(plan.retroRate)} instead of ${usd(plan.rate)}.` };
    return { title: "Next milestone", text: `${n(left)} more submission${left === 1 ? "" : "s"} to unlock the ${usd(plan.retroRate)} retro`, progress: { value: submissionsMtd, max: plan.retroThreshold }, done: false, detail: `${n(submissionsMtd)} of ${n(plan.retroThreshold)} this month; at ${n(plan.retroThreshold)}, every submission this month pays ${usd(plan.retroRate)} instead of ${usd(plan.rate)}.` };
  }
  if (plan.type === "per_won_tiered") {
    const left = Math.max(0, plan.firstCount - wonMtd);
    if (left === 0) return { title: "Current rate", text: `${usd(plan.thenRate)} per won from here`, progress: { value: wonMtd, max: plan.firstCount }, done: true, detail: `${n(wonMtd)} won this month; the first ${n(plan.firstCount)} paid ${usd(plan.firstRate)} each, every one after pays ${usd(plan.thenRate)}.` };
    return { title: "Next milestone", text: `${n(left)} more won at ${usd(plan.firstRate)} before the rate becomes ${usd(plan.thenRate)}`, progress: { value: wonMtd, max: plan.firstCount }, done: false, detail: `${n(wonMtd)} of the first ${n(plan.firstCount)} won this month at ${usd(plan.firstRate)} each; after that each won pays ${usd(plan.thenRate)}.` };
  }
  return { title: "Current rate", text: `${usd(plan.rate)} per won opportunity`, progress: null, done: true, detail: `${n(wonMtd)} won this month. Submissions do not pay under this plan.` };
}

function rankOf(userId: string, rows: { userId: string | null; total: number }[]): { rank: number | null; of: number; mtd: number } {
  const reps = rows.filter((r) => r.userId && salesReps.some((s) => s.userId === r.userId));
  const mine = reps.find((r) => r.userId === userId);
  if (!mine) return { rank: null, of: salesReps.length, mtd: 0 };
  return { rank: 1 + reps.filter((r) => r.total > mine.total).length, of: salesReps.length, mtd: mine.total };
}

export function computeRepOverview(rep: Rep, now: Date): RepOverview {
  const month = resolveRange("this_month", now);
  const lastMonth = resolveRange("last_month", now);
  const commission = computeCommission(month, now);
  const mine = commission.reps[rep.userId];
  const plan = planFor(rep);
  const subs = computeSubmissions(month, "all");
  const subsLast = computeSubmissions(lastMonth, "all");
  const cur = rankOf(rep.userId, subs.value === null ? [] : subs.rows);
  const last = rankOf(rep.userId, subsLast.value === null ? [] : subsLast.rows);
  return {
    monthLabel: commission.monthLabel,
    commission: { amount: mine?.commissionMtd.amount ?? null, calc: mine?.commissionMtd.label ?? "plan not found", planLabel: mine?.planLabel ?? null },
    milestone: milestoneFor(plan, mine?.submissionsMtd ?? 0, mine?.wonMtd ?? 0),
    rank: { ...cur, lastRank: last.rank, lastOf: last.of, lastMtd: last.mtd, delta: cur.rank !== null && last.rank !== null ? last.rank - cur.rank : null },
    notes: [
      "Commission earned this month — the month-to-date estimate under your plan, as on the Program Submissions table; the official calculation is done outside this dashboard.",
      "Next milestone — your plan's threshold: the retro rate unlocks when the month's submissions reach the threshold (and then applies to every submission that month); tiered won plans pay the first-tier rate for the first wons of the month.",
      "My rank — your place among the configured reps by combined submissions this calendar month (ties share a rank), compared with your place last month.",
    ],
  };
}

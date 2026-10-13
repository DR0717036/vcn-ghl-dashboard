// Month-to-date quota, won count, and estimated commission per rep (owner
// edits round 6). Always the current calendar month in America/New_York,
// regardless of the selected date range. Plans and every rate/threshold live
// in config/commission.json; each rep's plan name and monthly quota live in
// config/sales-reps.json.
//
// "Won" means opportunity status = won: the first won transition per
// opportunity id (the same rule as the Won section), in the Army CA or
// Veteran G.I. Bill pipeline, credited to the opportunity owner at the won
// event. These are ESTIMATES from dashboard counts; the official commission
// calculation is done outside this dashboard.

import raw from "../../config/commission.json";
import { getDb } from "@/lib/db";
import { fmtDay, resolveRange, type DateRange } from "@/lib/dates";
import { mappingConfig } from "@/lib/mapping-config";
import { salesReps, type Rep } from "@/lib/reps";
import { computeSubmissions } from "@/lib/submissions";

export interface PlanSubmissionRetro {
  type: "per_submission_retro";
  label: string;
  rate: number;
  retroThreshold: number;
  retroRate: number;
}
export interface PlanWonFlat {
  type: "per_won_flat";
  label: string;
  rate: number;
}
export interface PlanWonTiered {
  type: "per_won_tiered";
  label: string;
  firstRate: number;
  firstCount: number;
  thenRate: number;
}
export type Plan = PlanSubmissionRetro | PlanWonFlat | PlanWonTiered;

export const commissionPlans: Record<string, Plan> = (raw as { plans: Record<string, Plan> }).plans;

export function planFor(rep: Rep): Plan | null {
  return commissionPlans[rep.commissionPlan] ?? null;
}

export function isWonBased(plan: Plan | null): boolean {
  return plan?.type === "per_won_flat" || plan?.type === "per_won_tiered";
}

export interface WonLine {
  opportunityId: string;
  contactId: string | null;
  pipelineId: string;
  stageId: string;
  value: number | null;
  wonAt: string;
  userId: string | null;
}

export type QuotaStatus = "good" | "warn" | "bad" | "neutral";

export interface RepMtd {
  userId: string;
  name: string;
  planKey: string;
  planLabel: string | null;
  /** Combined submissions so far this calendar month. */
  submissionsMtd: number;
  monthlyQuota: number;
  quotaPct: number;
  /** good: 100%+, warn: 50–99%, bad: below 50% once more than half the month has elapsed, else neutral. */
  quotaStatus: QuotaStatus;
  wonMtd: number;
  wonValueMtd: number;
  /** Estimated commission in USD under the rep's plan; null when the plan is unknown. */
  commission: number | null;
  commissionBasis: string;
}

export interface CommissionReport {
  month: DateRange;
  monthLabel: string;
  monthElapsedFraction: number;
  reps: Record<string, RepMtd>;
  /** Won this month credited to anyone who is not a configured rep (including unassigned). */
  othersWon: number;
  totalWon: number;
  totalCommission: number;
  wonByUser: Map<string | null, WonLine[]>;
  notes: string[];
}

const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** First won transition per opportunity, in the two program pipelines, inside [start, end). */
export function wonEvents(range: DateRange): WonLine[] {
  const army = mappingConfig.programs.army.pipelineId;
  const vet = mappingConfig.programs.veteran.pipelineId;
  const rows = getDb()
    .prepare(
      `SELECT e.opportunity_id, e.contact_id, e.pipeline_id, e.stage_id, e.value_at_event, e.event_time, e.assigned_to_at_event
         FROM milestone_events e
         JOIN (SELECT opportunity_id, MIN(event_time) AS t FROM milestone_events WHERE kind = 'won' GROUP BY opportunity_id) f
           ON f.opportunity_id = e.opportunity_id AND f.t = e.event_time
        WHERE e.kind = 'won' AND e.pipeline_id IN (?, ?) AND e.event_time >= ? AND e.event_time < ?
        ORDER BY e.event_time DESC`,
    )
    .all(army, vet, range.start.toISOString(), range.end.toISOString()) as {
    opportunity_id: string;
    contact_id: string | null;
    pipeline_id: string;
    stage_id: string;
    value_at_event: number | null;
    event_time: string;
    assigned_to_at_event: string | null;
  }[];
  return rows.map((r) => ({
    opportunityId: r.opportunity_id,
    contactId: r.contact_id,
    pipelineId: r.pipeline_id,
    stageId: r.stage_id,
    value: r.value_at_event,
    wonAt: r.event_time,
    userId: r.assigned_to_at_event,
  }));
}

export function estimate(plan: Plan | null, submissions: number, won: number): { amount: number | null; basis: string } {
  if (!plan) return { amount: null, basis: "Plan not found in config/commission.json." };
  switch (plan.type) {
    case "per_submission_retro": {
      const retro = submissions >= plan.retroThreshold;
      const rate = retro ? plan.retroRate : plan.rate;
      return {
        amount: submissions * rate,
        basis: `${submissions} submissions × ${usd(rate)}${retro ? ` (retro rate from ${plan.retroThreshold} submissions)` : ` (${usd(plan.retroRate)} each from ${plan.retroThreshold} submissions)`}`,
      };
    }
    case "per_won_flat":
      return { amount: won * plan.rate, basis: `${won} won × ${usd(plan.rate)}` };
    case "per_won_tiered": {
      const first = Math.min(won, plan.firstCount);
      const rest = Math.max(0, won - plan.firstCount);
      return {
        amount: first * plan.firstRate + rest * plan.thenRate,
        basis: `${first} won × ${usd(plan.firstRate)}${rest > 0 ? ` + ${rest} won × ${usd(plan.thenRate)}` : ` (then ${usd(plan.thenRate)} each after ${plan.firstCount})`}`,
      };
    }
  }
}

export function quotaStatus(pct: number, monthElapsedFraction: number): QuotaStatus {
  if (pct >= 1) return "good";
  if (pct >= 0.5) return "warn";
  return monthElapsedFraction > 0.5 ? "bad" : "neutral";
}

export function computeCommission(now: Date): CommissionReport {
  const month = resolveRange("this_month", now);
  const fullMs = month.fullEnd.getTime() - month.start.getTime();
  const monthElapsedFraction = fullMs > 0 ? Math.min(1, Math.max(0, (month.end.getTime() - month.start.getTime()) / fullMs)) : 1;
  const subs = computeSubmissions(month);
  const subsByUser = new Map(subs.rows.map((r) => [r.userId, r.total]));
  const won = wonEvents(month);
  const wonByUser = new Map<string | null, WonLine[]>();
  for (const w of won) wonByUser.set(w.userId, [...(wonByUser.get(w.userId) ?? []), w]);

  const reps: Record<string, RepMtd> = {};
  let totalCommission = 0;
  for (const rep of salesReps) {
    const plan = planFor(rep);
    const submissionsMtd = subsByUser.get(rep.userId) ?? 0;
    const lines = wonByUser.get(rep.userId) ?? [];
    const wonMtd = lines.length;
    const est = estimate(plan, submissionsMtd, wonMtd);
    const quota = rep.monthlyQuota > 0 ? rep.monthlyQuota : 0;
    const quotaPct = quota > 0 ? submissionsMtd / quota : 0;
    reps[rep.userId] = {
      userId: rep.userId,
      name: rep.name,
      planKey: rep.commissionPlan,
      planLabel: plan?.label ?? null,
      submissionsMtd,
      monthlyQuota: quota,
      quotaPct,
      quotaStatus: quota > 0 ? quotaStatus(quotaPct, monthElapsedFraction) : "neutral",
      wonMtd,
      wonValueMtd: lines.reduce((s, l) => s + (l.value ?? 0), 0),
      commission: est.amount,
      commissionBasis: est.basis,
    };
    totalCommission += est.amount ?? 0;
  }
  const repIds = new Set(salesReps.map((r) => r.userId));
  const othersWon = won.filter((w) => w.userId === null || !repIds.has(w.userId)).length;

  return {
    month,
    monthLabel: `${fmtDay(month.start)} – ${fmtDay(month.end)}`,
    monthElapsedFraction,
    reps,
    othersWon,
    totalWon: won.length,
    totalCommission,
    wonByUser,
    notes: [
      `Monthly quota, Won (MTD), and Est. commission are always month-to-date for the current calendar month (${fmtDay(month.start)} – ${fmtDay(month.end)}), regardless of the selected date range.`,
      "Won means opportunity status = won: the first won transition, once per opportunity id, in the Army CA or Veteran G.I. Bill pipeline, credited to the opportunity owner at the won event.",
      "Estimated from dashboard counts; the official commission calculation is done outside this dashboard. Plans and rates live in config/commission.json.",
    ],
  };
}

// Estimated commission per rep (owner edits round 6, reworked in round 7).
//
// Est. commission follows the SELECTED DATE RANGE: it is the sum of the
// commission earned on the events (submissions or wins, per the rep's plan)
// that fall inside the range. Each event is priced by its position within
// its own calendar month, because the plan thresholds are monthly:
//   submission-retro: a submission pays the retro rate if the rep's total
//     submissions in that calendar month (through the end of the selected
//     range, or now if the range is still open) reach the threshold;
//   per-won-flat: every won pays the flat rate;
//   won-tiered: a won pays the first-tier rate if it is among the rep's
//     first N wons in that calendar month by won date, otherwise the lower rate.
// Ranges that span months are priced month by month. Month-to-date figures
// (quota, Won (MTD), and an MTD commission for the drilldown header) use the
// same pricing over the current calendar month.
//
// Plans and every rate/threshold live in config/commission.json; each rep's
// plan name and monthly quota live in config/sales-reps.json. "Won" means
// opportunity status = won: the first won transition per opportunity id (the
// same rule as the Won section), in the Army CA or Veteran G.I. Bill
// pipeline, credited to the opportunity owner at the won event. These are
// ESTIMATES from dashboard counts; the official commission calculation is
// done outside this dashboard.

import raw from "../../config/commission.json";
import { getDb } from "@/lib/db";
import { addMonths, fmtDay, resolveRange, startOfMonth, type DateRange } from "@/lib/dates";
import { mappingConfig } from "@/lib/mapping-config";
import { salesReps, type Rep } from "@/lib/reps";
import { computeSubmissions, submissionEvents } from "@/lib/submissions";

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

const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** One sentence per plan, built from the configured numbers, for the column-header tooltip. */
export function planSummary(): string {
  const parts: string[] = [];
  for (const [key, p] of Object.entries(commissionPlans)) {
    if (p.type === "per_submission_retro")
      parts.push(`${key}: ${usd(p.rate)} per combined submission, or ${usd(p.retroRate)} for every submission in a calendar month that reaches ${p.retroThreshold}.`);
    else if (p.type === "per_won_flat") parts.push(`${key}: ${usd(p.rate)} per won opportunity; submissions do not pay.`);
    else parts.push(`${key}: ${usd(p.firstRate)} for each of the first ${p.firstCount} won in a calendar month, then ${usd(p.thenRate)} each; submissions do not pay.`);
  }
  return parts.join(" ");
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

/** First won transition per opportunity, in the two program pipelines, inside [start, end), oldest first. */
export function wonEventsBetween(start: Date, end: Date): WonLine[] {
  const army = mappingConfig.programs.army.pipelineId;
  const vet = mappingConfig.programs.veteran.pipelineId;
  const rows = getDb()
    .prepare(
      `SELECT e.opportunity_id, e.contact_id, e.pipeline_id, e.stage_id, e.value_at_event, e.event_time, e.assigned_to_at_event
         FROM milestone_events e
         JOIN (SELECT opportunity_id, MIN(event_time) AS t FROM milestone_events WHERE kind = 'won' GROUP BY opportunity_id) f
           ON f.opportunity_id = e.opportunity_id AND f.t = e.event_time
        WHERE e.kind = 'won' AND e.pipeline_id IN (?, ?) AND e.event_time >= ? AND e.event_time < ?
        ORDER BY e.event_time ASC, e.opportunity_id ASC`,
    )
    .all(army, vet, start.toISOString(), end.toISOString()) as {
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

export function wonEvents(range: DateRange): WonLine[] {
  return wonEventsBetween(range.start, range.end);
}

/** One priced group of events: n events at one rate ("8 × $100 (retro)"). */
export interface CommissionPart {
  n: number;
  rate: number;
  /** "won" for won-based plans (label reads "4 won × $250"); "retro" marks the retro submission rate. */
  tag?: "won" | "retro";
}

export interface RepCommission {
  /** Null when the rep's plan is not in config/commission.json. */
  amount: number | null;
  /** The calculation, e.g. "2 × $75", "8 × $100 (retro)", "4 won × $250", "1 × $500 + 2 × $250". */
  label: string;
  parts: CommissionPart[];
}

function partLabel(p: CommissionPart): string {
  return `${p.n.toLocaleString("en-US")}${p.tag === "won" ? " won" : ""} × ${usd(p.rate)}${p.tag === "retro" ? " (retro)" : ""}`;
}

function mergeParts(parts: CommissionPart[]): CommissionPart[] {
  const out: CommissionPart[] = [];
  for (const p of parts) {
    const same = out.find((x) => x.rate === p.rate && x.tag === p.tag);
    if (same) same.n += p.n;
    else out.push({ ...p });
  }
  return out.filter((p) => p.n > 0);
}

/** Calendar months (America/New_York) touched by [start, end). */
function monthsSpanned(start: Date, end: Date): { mStart: Date; mEnd: Date }[] {
  const out: { mStart: Date; mEnd: Date }[] = [];
  let mStart = startOfMonth(start);
  while (mStart.getTime() < end.getTime()) {
    const mEnd = addMonths(mStart, 1);
    out.push({ mStart, mEnd });
    mStart = mEnd;
  }
  return out;
}

const minDate = (a: Date, b: Date) => (a.getTime() <= b.getTime() ? a : b);
const maxDate = (a: Date, b: Date) => (a.getTime() >= b.getTime() ? a : b);

/**
 * Commission for every configured rep on the events inside [start, end), priced
 * month by month. `end` is the end of the selected range (now for an open range).
 */
export function commissionBetween(start: Date, end: Date): Map<string, RepCommission> {
  const parts = new Map<string, CommissionPart[]>();
  for (const rep of salesReps) parts.set(rep.userId, []);

  for (const { mStart, mEnd } of monthsSpanned(start, end)) {
    const windowEnd = minDate(mEnd, end);
    const inStart = maxDate(mStart, start);
    const inEnd = minDate(mEnd, end);
    // submissions in the month through the end of the range (the monthly total that decides the retro rate)
    const subs = submissionEvents(mStart, windowEnd);
    const monthTotal = new Map<string | null, number>();
    const inRange = new Map<string | null, number>();
    for (const e of subs) {
      monthTotal.set(e.userId, (monthTotal.get(e.userId) ?? 0) + 1);
      if (e.time >= inStart.toISOString() && e.time < inEnd.toISOString()) inRange.set(e.userId, (inRange.get(e.userId) ?? 0) + 1);
    }
    // wons for the whole month, ranked by won date per user (only earlier wons affect a won's tier)
    const wons = wonEventsBetween(mStart, mEnd);
    const rank = new Map<string | null, number>();
    const inRangeWons = new Map<string | null, { rank: number }[]>();
    for (const w of wons) {
      const r = (rank.get(w.userId) ?? 0) + 1;
      rank.set(w.userId, r);
      if (w.wonAt >= inStart.toISOString() && w.wonAt < inEnd.toISOString()) inRangeWons.set(w.userId, [...(inRangeWons.get(w.userId) ?? []), { rank: r }]);
    }

    for (const rep of salesReps) {
      const plan = planFor(rep);
      const list = parts.get(rep.userId)!;
      if (!plan) continue;
      if (plan.type === "per_submission_retro") {
        const n = inRange.get(rep.userId) ?? 0;
        const retro = (monthTotal.get(rep.userId) ?? 0) >= plan.retroThreshold;
        list.push({ n, rate: retro ? plan.retroRate : plan.rate, tag: retro ? "retro" : undefined });
      } else if (plan.type === "per_won_flat") {
        list.push({ n: (inRangeWons.get(rep.userId) ?? []).length, rate: plan.rate, tag: "won" });
      } else {
        const ws = inRangeWons.get(rep.userId) ?? [];
        list.push({ n: ws.filter((w) => w.rank <= plan.firstCount).length, rate: plan.firstRate });
        list.push({ n: ws.filter((w) => w.rank > plan.firstCount).length, rate: plan.thenRate });
      }
    }
  }

  const out = new Map<string, RepCommission>();
  for (const rep of salesReps) {
    const plan = planFor(rep);
    if (!plan) {
      out.set(rep.userId, { amount: null, label: "plan not found", parts: [] });
      continue;
    }
    const merged = mergeParts(parts.get(rep.userId) ?? []);
    const amount = merged.reduce((s, p) => s + p.n * p.rate, 0);
    const label =
      merged.length > 0
        ? merged.map(partLabel).join(" + ")
        : plan.type === "per_submission_retro"
          ? `0 × ${usd(plan.rate)}`
          : plan.type === "per_won_flat"
            ? `0 won × ${usd(plan.rate)}`
            : `0 won × ${usd(plan.firstRate)}`;
    out.set(rep.userId, { amount, label, parts: merged });
  }
  return out;
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
  /** Commission on the events inside the selected range. */
  commission: RepCommission;
  /** Commission on this calendar month's events so far. */
  commissionMtd: RepCommission;
}

export interface CommissionReport {
  range: DateRange;
  rangeLabel: string;
  month: DateRange;
  monthLabel: string;
  monthElapsedFraction: number;
  reps: Record<string, RepMtd>;
  /** Won this month credited to anyone who is not a configured rep (including unassigned). */
  othersWon: number;
  totalWon: number;
  /** Sum of every rep's commission for the selected range. */
  totalCommission: number;
  totalCommissionMtd: number;
  wonByUser: Map<string | null, WonLine[]>;
  planSummary: string;
  notes: string[];
}

export function quotaStatus(pct: number, monthElapsedFraction: number): QuotaStatus {
  if (pct >= 1) return "good";
  if (pct >= 0.5) return "warn";
  return monthElapsedFraction > 0.5 ? "bad" : "neutral";
}

export function computeCommission(range: DateRange, now: Date): CommissionReport {
  const month = resolveRange("this_month", now);
  const fullMs = month.fullEnd.getTime() - month.start.getTime();
  const monthElapsedFraction = fullMs > 0 ? Math.min(1, Math.max(0, (month.end.getTime() - month.start.getTime()) / fullMs)) : 1;
  // Quota counts every semester's IAU submissions, whatever semester the page is showing.
  const subs = computeSubmissions(month, "all");
  const subsByUser = new Map(subs.rows.map((r) => [r.userId, r.total]));
  const won = wonEvents(month);
  const wonByUser = new Map<string | null, WonLine[]>();
  for (const w of won) wonByUser.set(w.userId, [...(wonByUser.get(w.userId) ?? []), w]);
  const forRange = commissionBetween(range.start, range.end);
  const forMonth = commissionBetween(month.start, month.end);

  const reps: Record<string, RepMtd> = {};
  let totalCommission = 0;
  let totalCommissionMtd = 0;
  for (const rep of salesReps) {
    const plan = planFor(rep);
    const submissionsMtd = subsByUser.get(rep.userId) ?? 0;
    const lines = wonByUser.get(rep.userId) ?? [];
    const quota = rep.monthlyQuota > 0 ? rep.monthlyQuota : 0;
    const quotaPct = quota > 0 ? submissionsMtd / quota : 0;
    const commission = forRange.get(rep.userId)!;
    const commissionMtd = forMonth.get(rep.userId)!;
    reps[rep.userId] = {
      userId: rep.userId,
      name: rep.name,
      planKey: rep.commissionPlan,
      planLabel: plan?.label ?? null,
      submissionsMtd,
      monthlyQuota: quota,
      quotaPct,
      quotaStatus: quota > 0 ? quotaStatus(quotaPct, monthElapsedFraction) : "neutral",
      wonMtd: lines.length,
      wonValueMtd: lines.reduce((s, l) => s + (l.value ?? 0), 0),
      commission,
      commissionMtd,
    };
    totalCommission += commission.amount ?? 0;
    totalCommissionMtd += commissionMtd.amount ?? 0;
  }
  const repIds = new Set(salesReps.map((r) => r.userId));
  const othersWon = won.filter((w) => w.userId === null || !repIds.has(w.userId)).length;
  const monthLabel = `${fmtDay(month.start)} – ${fmtDay(month.end)}`;

  return {
    range,
    rangeLabel: range.label,
    month,
    monthLabel,
    monthElapsedFraction,
    reps,
    othersWon,
    totalWon: won.length,
    totalCommission,
    totalCommissionMtd,
    wonByUser,
    planSummary: planSummary(),
    notes: [
      "Est. commission — follows the selected date range: the commission earned on the submissions or wins (per the rep's plan) that fall inside the range.",
      "Monthly thresholds — each event is priced by its place in its own calendar month: a submission pays the retro rate when the rep's submissions in that month, through the end of the range, reach the threshold; a won pays the first-tier rate when it is among the rep's first wons of that month by won date.",
      "Ranges spanning months — priced month by month.",
      `Monthly quota and Won (MTD) — always month-to-date for the current calendar month (${monthLabel}), regardless of the selected date range.`,
      "Won — opportunity status = won: the first won transition, once per opportunity id, in the Army CA or Veteran G.I. Bill pipeline, credited to the opportunity owner at the won event.",
      "Plans and rates — config/commission.json.",
      "Limitation: commission is estimated from dashboard counts; the official commission calculation is done outside this dashboard.",
    ],
  };
}

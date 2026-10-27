// "My commission" for one rep: this month's estimate with the calculation
// shown, and a month-by-month history, all from the same pricing the
// Program Submissions table uses (commissionBetween, month by month, per the
// rep's plan in config/commission.json). Always labeled "estimated": the
// official commission calculation is done outside this dashboard.

import { commissionBetween, planFor, wonEventsBetween, type CommissionPart, type Plan } from "@/lib/commission";
import { coverage } from "@/lib/metrics";
import { addMonths, fmtDay, nyParts, startOfMonth } from "@/lib/dates";
import type { Rep } from "@/lib/reps";
import { submissionEvents } from "@/lib/submissions";
import { HISTORY_START } from "@/lib/sync/core";

export interface CommissionMonth {
  /** "2026-10" */
  key: string;
  /** "October 2026" */
  label: string;
  /** "Oct 1 – Oct 26, 2026" style (through today for the current month). */
  rangeLabel: string;
  current: boolean;
  amount: number | null;
  calc: string;
  parts: CommissionPart[];
  submissions: number;
  won: number;
  wonValue: number;
  /** The month starts before milestone tracking began, so its counts can be incomplete. */
  partial: boolean;
}

export interface RepCommissionData {
  planKey: string;
  plan: Plan | null;
  planText: string;
  thisMonth: CommissionMonth;
  history: CommissionMonth[];
  notes: string[];
}

const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const monthFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long", year: "numeric" });

export function planText(plan: Plan | null): string {
  if (!plan) return "No commission plan is configured for you; ask Diego.";
  if (plan.type === "per_submission_retro") return `${usd(plan.rate)} per combined submission; once a calendar month reaches ${plan.retroThreshold} submissions, ${usd(plan.retroRate)} applies to every submission that month.`;
  if (plan.type === "per_won_flat") return `${usd(plan.rate)} per won opportunity. Submissions do not pay.`;
  return `${usd(plan.firstRate)} for each of the first ${plan.firstCount} won opportunities in a calendar month, then ${usd(plan.thenRate)} each. Submissions do not pay.`;
}

const MONTHS_OF_HISTORY = 6;

function monthKey(d: Date): string {
  const p = nyParts(d);
  return `${p.y}-${String(p.m).padStart(2, "0")}`;
}

export function computeRepCommission(rep: Rep, now: Date): RepCommissionData {
  const plan = planFor(rep);
  const historyStart = coverage().firstCoreSyncAt ?? HISTORY_START;
  const thisStart = startOfMonth(now);
  const months: CommissionMonth[] = [];
  for (let back = 0; back < MONTHS_OF_HISTORY; back++) {
    const mStart = addMonths(thisStart, -back);
    const mEnd = addMonths(mStart, 1);
    if (mEnd.toISOString() <= HISTORY_START) break;
    const current = back === 0;
    const end = current ? now : mEnd;
    const c = commissionBetween(mStart, end).get(rep.userId);
    const subs = submissionEvents(mStart, end).filter((e) => e.userId === rep.userId);
    const won = wonEventsBetween(mStart, end).filter((w) => w.userId === rep.userId);
    months.push({
      key: monthKey(mStart),
      label: monthFmt.format(mStart),
      rangeLabel: `${fmtDay(mStart)} – ${fmtDay(new Date(end.getTime() - (current ? 0 : 1)))}`,
      current,
      amount: c?.amount ?? null,
      calc: c?.label ?? "plan not found",
      parts: c?.parts ?? [],
      submissions: subs.length,
      won: won.length,
      wonValue: won.reduce((s, w) => s + (w.value ?? 0), 0),
      partial: mStart.toISOString() < historyStart,
    });
  }
  const thisMonth = months[0];
  return {
    planKey: rep.commissionPlan,
    plan,
    planText: planText(plan),
    thisMonth,
    history: months,
    notes: [
      "Estimated — every amount here is an estimate from dashboard counts; the official commission calculation is done outside this dashboard and may differ.",
      `Your plan (${rep.commissionPlan}) — ${planText(plan)}`,
      "Pricing — each submission or won is priced by its place in its own calendar month: the retro rate applies when the month's submissions reach the threshold; a won pays the first-tier rate when it is among the first wons of that month by won date.",
      "Submissions — the first entry into CA 101 submitted or IAU App Submitted (every semester) per contact, credited to the opportunity owner at the event. Won — opportunity status = won, once per opportunity id, in the Army CA or Veteran G.I. Bill pipeline, credited to the owner at the won event. Dollar figures beside won counts are Opportunity Value, never cash.",
      `History — months before milestone tracking began (${fmtDay(new Date(historyStart))}) are marked partial: only contacts still sitting in a stage at the first sync are known for them.`,
    ],
  };
}

// The line items behind a rep's commission for one calendar month: every
// submission or won opportunity that earned something under the rep's plan,
// with the contact, program, event date, rate, and amount, priced with the
// SAME rules as commissionBetween (src/lib/commission.ts): the retro rate
// when the month's submissions reach the threshold; the first-tier rate for
// the first N wons of the month by won date. The total is reconciled
// against commissionBetween for the same window and the result says so.

import { commissionBetween, planFor, wonEventsBetween, type Plan } from "@/lib/commission";
import { getDb } from "@/lib/db";
import { fmtDay } from "@/lib/dates";
import { mappingConfig } from "@/lib/mapping-config";
import type { Rep } from "@/lib/reps";
import { ledgerEventLabel, ledgerFor, ledgerProgramLabel } from "@/lib/submissions";

export interface InvoiceLine {
  kind: "submission" | "won";
  /** The won opportunity (won lines only). */
  opportunityId?: string;
  contactId: string | null;
  contactName: string;
  /** "Army CA 101", "Veteran IAU · FS2", "Army CA", "Veteran G.I. Bill". */
  program: string;
  /** ISO event time. */
  eventAt: string;
  /** "Oct 14, 2026" */
  eventDay: string;
  /** What the line is: "CA 101 submitted", "IAU App Submitted (FS2)", "Won". */
  event: string;
  rate: number;
  amount: number;
  /** "retro", "first 13", or "" */
  tier: string;
}

export interface InvoiceLines {
  planKey: string;
  plan: Plan | null;
  lines: InvoiceLine[];
  total: number;
  /** The calculation as Program Submissions shows it, e.g. "15 × $75". */
  calc: string;
  /** True when the total equals commissionBetween's amount for the same window. */
  reconciled: boolean;
  reconciledAgainst: number | null;
}


function contactNames(ids: string[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    if (chunk.length === 0) continue;
    for (const c of getDb().prepare(`SELECT id, name FROM contacts WHERE id IN (${chunk.map(() => "?").join(",")})`).all(...chunk) as unknown as { id: string; name: string | null }[]) out.set(c.id, c.name);
  }
  return out;
}

export interface RepSubmission {
  contactId: string | null;
  who: string;
  at: string;
  key: string;
  program: string;
  event: string;
}

/** Every counted submission in [start, end) credited to the rep: the submission ledger (src/lib/submissions.ts) filtered to the rep, oldest first. */
export function repSubmissions(rep: Rep, start: Date, end: Date): RepSubmission[] {
  return ledgerFor(rep, start, end).map((x) => ({ contactId: x.contactId, who: x.who, at: x.time, key: x.key, program: ledgerProgramLabel(x), event: ledgerEventLabel(x) }));
}

/** Line items for [start, end): the month's start and either its end or "now" for the month in progress. */
export function computeInvoiceLines(rep: Rep, start: Date, end: Date): InvoiceLines {
  const plan = planFor(rep);
  const lines: InvoiceLine[] = [];
  const against = commissionBetween(start, end).get(rep.userId);
  if (!plan) return { planKey: rep.commissionPlan, plan: null, lines, total: 0, calc: "plan not found", reconciled: against?.amount === null, reconciledAgainst: against?.amount ?? null };

  if (plan.type === "per_submission_retro") {
    // Every counted submission this month credited to the rep: the submission ledger filtered to the rep (the same list Program Submissions and the rep pages count).
    const raw = ledgerFor(rep, start, end);
    const retro = raw.length >= plan.retroThreshold;
    const rate = retro ? plan.retroRate : plan.rate;
    const names = contactNames(raw.map((r) => r.contactId).filter((x): x is string => Boolean(x)));
    for (const r of raw) {
      lines.push({
        kind: "submission",
        contactId: r.contactId,
        contactName: (r.contactId ? names.get(r.contactId) : null) ?? "(no name)",
        program: ledgerProgramLabel(r),
        eventAt: r.time,
        eventDay: fmtDay(new Date(r.time)),
        event: ledgerEventLabel(r),
        rate,
        amount: rate,
        tier: retro ? "retro" : "",
      });
    }
  } else {
    // Wons for the whole month, ranked by won date (the tier depends on earlier wons), kept to the window.
    const monthEnd = end; // callers pass the month end (or now), and ranking only needs earlier wons
    const wons = wonEventsBetween(start, monthEnd).filter((w) => w.userId === rep.userId);
    const names = contactNames(wons.map((w) => w.contactId).filter((x): x is string => Boolean(x)));
    wons.forEach((w, i) => {
      const rank = i + 1;
      const first = plan.type === "per_won_tiered" && rank <= plan.firstCount;
      const rate = plan.type === "per_won_flat" ? plan.rate : first ? plan.firstRate : plan.thenRate;
      lines.push({
        kind: "won",
        opportunityId: w.opportunityId,
        contactId: w.contactId,
        contactName: (w.contactId ? names.get(w.contactId) : null) ?? "(no name)",
        program: w.pipelineId === mappingConfig.programs.army.pipelineId ? "Army CA" : "Veteran G.I. Bill",
        eventAt: w.wonAt,
        eventDay: fmtDay(new Date(w.wonAt)),
        event: "Won",
        rate,
        amount: rate,
        tier: plan.type === "per_won_tiered" ? (first ? `first ${plan.firstCount}` : "after") : "",
      });
    });
  }
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return { planKey: rep.commissionPlan, plan, lines, total, calc: against?.label ?? "", reconciled: against?.amount !== null && against?.amount !== undefined && Math.abs(against.amount - total) < 0.005, reconciledAgainst: against?.amount ?? null };
}

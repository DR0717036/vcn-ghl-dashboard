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
import { mappingConfig, semesters, trackedMilestones } from "@/lib/mapping-config";
import { firstEvents } from "@/lib/milestones";
import type { Rep } from "@/lib/reps";
import { iauKeys } from "@/lib/submissions";

export interface InvoiceLine {
  kind: "submission" | "won";
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

const CA101_KEY = "army_ca101";

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

/** Every counted submission in [start, end) credited to the rep (first entry per contact per stage, as the card counts), oldest first. */
export function repSubmissions(rep: Rep, start: Date, end: Date): RepSubmission[] {
  const raw: RepSubmission[] = [];
  for (const key of [CA101_KEY, ...iauKeys("all")]) {
    const m = trackedMilestones().find((x) => x.key === key);
    if (!m) continue;
    const seen = new Set<string>();
    const sem = semesters().find((x) => x.submittedKey === key);
    for (const r of firstEvents(key, m.reportingGroup, start.toISOString(), end.toISOString())) {
      if (seen.has(r.who)) continue;
      seen.add(r.who);
      if (r.assigned_to_at_event === rep.userId) raw.push({ contactId: r.contact_id, who: r.who, at: r.event_time, key, program: key === CA101_KEY ? "Army CA 101" : `Veteran IAU · ${sem?.short ?? key}`, event: key === CA101_KEY ? "CA 101 submitted" : `IAU App Submitted (${sem?.short ?? key})` });
    }
  }
  return raw.sort((x, y) => (x.at < y.at ? -1 : 1));
}

/** Line items for [start, end): the month's start and either its end or "now" for the month in progress. */
export function computeInvoiceLines(rep: Rep, start: Date, end: Date): InvoiceLines {
  const plan = planFor(rep);
  const lines: InvoiceLine[] = [];
  const against = commissionBetween(start, end).get(rep.userId);
  if (!plan) return { planKey: rep.commissionPlan, plan: null, lines, total: 0, calc: "plan not found", reconciled: against?.amount === null, reconciledAgainst: against?.amount ?? null };

  if (plan.type === "per_submission_retro") {
    // Every counted submission this month credited to the rep (first entry per contact per stage, as the card counts).
    const raw: { contactId: string | null; who: string; at: string; key: string }[] = [];
    for (const key of [CA101_KEY, ...iauKeys("all")]) {
      const m = trackedMilestones().find((x) => x.key === key);
      if (!m) continue;
      const seen = new Set<string>();
      for (const r of firstEvents(key, m.reportingGroup, start.toISOString(), end.toISOString())) {
        if (seen.has(r.who)) continue;
        seen.add(r.who);
        if (r.assigned_to_at_event === rep.userId) raw.push({ contactId: r.contact_id, who: r.who, at: r.event_time, key });
      }
    }
    const retro = raw.length >= plan.retroThreshold;
    const rate = retro ? plan.retroRate : plan.rate;
    const names = contactNames(raw.map((r) => r.contactId).filter((x): x is string => Boolean(x)));
    for (const r of raw.sort((a, b) => (a.at < b.at ? -1 : 1))) {
      const sem = semesters().find((s) => s.submittedKey === r.key);
      lines.push({
        kind: "submission",
        contactId: r.contactId,
        contactName: (r.contactId ? names.get(r.contactId) : null) ?? "(no name)",
        program: r.key === CA101_KEY ? "Army CA 101" : `Veteran IAU · ${sem?.short ?? r.key}`,
        eventAt: r.at,
        eventDay: fmtDay(new Date(r.at)),
        event: r.key === CA101_KEY ? "CA 101 submitted" : `IAU App Submitted (${sem?.short ?? r.key})`,
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

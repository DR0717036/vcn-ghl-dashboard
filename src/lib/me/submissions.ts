// "My submissions" (owner request 2026-11-19): the admin Submissions
// section filtered to one rep, for the date range in the control bar.
//   Row 1, Army CA: CA 101 Submissions, Awaiting Supervisor Approval (with
//     the 5-day deadline list of the rep's leads sitting in that stage now),
//     Enrolled / Won Army.
//   Row 2, Veteran G.I. Bill: IAU App Submitted, IAU App Accepted and
//     Enrolled Won for the selected semester (the semester dropdown).
// Each card's second figure is the ESTIMATED COMMISSION those events earn
// under the rep's plan (owner request 2026-11-20), priced exactly as the
// invoice lines are (computeInvoiceLines, month by month, through the end
// of the range): per-submission plans pay on CA 101 and IAU App Submitted,
// per-won plans pay on wons; a card whose event does not pay under the plan
// shows the count alone. A rep never sees Opportunity Value anywhere (owner
// request 2026-11-24): the rep libraries do not compute it and
// src/lib/me/repSafe.ts strips it from every /api/me response.
// Every count is the rep's share of the same events the team cards count:
// the first entry into the stage per contact (firstEvents, as
// computeMilestone and the drilldowns use it), credited to the opportunity
// owner at the time of the event; won = the first won transition per
// opportunity (wonOpps "period"). Charts bucket those same events per hour,
// day or week (buckets/fill, as the admin charts do). Reads the cache only.

import { buckets, fill, type TimeSeries } from "@/lib/charts";
import { addDays, addMonths, fmtDay, resolveRange, startOfMonth, type DateRange } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { contactUrl, enrich, type EventLike } from "@/lib/drilldown";
import { computeInvoiceLines, type InvoiceLine } from "@/lib/invoices/lines";
import { computeCommission, isWonBased, planFor, planText, type Plan } from "@/lib/commission";
import { mappingConfig, semesters, trackedMilestones, type MilestoneMapping, type Semester } from "@/lib/mapping-config";
import { coverage } from "@/lib/metrics";
import { firstEvents, userNames, type EventRow } from "@/lib/milestones";
import type { Rep } from "@/lib/reps";
import { computeSubmissions, iauKeys } from "@/lib/submissions";
import { wonOpps, wonRow, type WonOpp } from "@/lib/wonRow";
import { repRow, type RepDrillResult } from "./repSafe";
import { bestMonthFor, goalPartFor, prevRangeOf, type BestMonth, type GoalPart } from "./shared";

const CA101_KEY = "army_ca101";
const APPROVAL_KEY = "army_supervisor_approval";
/** Calendar days a lead may sit in Supervisor Approval before it must be resubmitted (the stage is named "Supervisor Approval (5 days)"). */
export const APPROVAL_DEADLINE_DAYS = 5;

const n = (v: number) => v.toLocaleString("en-US");
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** The estimated commission the card's events earn under the rep's plan. */
export interface CardCommission {
  amount: number;
  /** The calculation: "5 × $75", "3 × $75 + 2 × $100 (retro)", "1 × $500 + 2 × $250". */
  label: string;
  /** The same for the comparison period (null when unavailable). */
  prev: number | null;
  /** Events in the range the invoice lines did not price (should be 0; shown when not). */
  unpriced: number;
}

export interface MyMilestoneCard {
  key: string;
  title: string;
  subtitle: string;
  program: "army" | "veteran";
  stageName: string;
  reportingGroup: string;
  /** The rep's contacts that first entered the stage in the range (null = unavailable). */
  achieved: number | null;
  unavailableReason?: string;
  prev: number | null;
  prevUnavailableReason?: string;
  partialHistory: boolean;
  /** Snapshot: the rep's open opportunities sitting in the stage now. */
  currentInStage: number;
  /** Est. commission on these events under the rep's plan; null when this event does not pay under the plan (count alone). */
  commission: CardCommission | null;
  /** Why the card shows (or does not show) commission, in a sentence. */
  commissionNote: string;
  /** Per bucket: count = events; value = est. commission (0 when the event does not pay). */
  series: TimeSeries;
  notes: string[];
}

export interface MyWonCard {
  key: string;
  title: string;
  subtitle: string;
  program: "army" | "veteran";
  count: number;
  prevCount: number | null;
  prevUnavailableReason?: string;
  /** The won stages counted (the semester's Enrolled Won stage for Veterans; every Army CA stage for Army). */
  stageNames: string[];
  /** Est. commission on these wons under the rep's plan; null unless the plan pays per won (count alone). */
  commission: CardCommission | null;
  commissionNote: string;
  /** Per bucket: count = wons; value = est. commission (0 when the plan does not pay per won). */
  series: TimeSeries;
  notes: string[];
}

export interface DeadlineRow {
  opportunityId: string;
  contactId: string | null;
  name: string;
  ghlUrl: string | null;
  /** When the opportunity entered the stage (ISO): GHL's stage-entry time, else the dashboard's own event time, else when it was first seen (estimated). */
  enteredAt: string;
  basis: "ghl" | "event" | "estimated";
  /** enteredAt + 5 calendar days (ISO). */
  deadline: string;
}

export interface DeadlineList {
  days: number;
  rows: DeadlineRow[];
  /** Deadlines inside the next 48 hours (not yet past). */
  expiringSoon: number;
  expired: number;
  asOf: string;
}

export interface MySubmissions {
  rangeLabel: string;
  partial: boolean;
  /** Combined submissions (CA 101 + IAU App, every semester) against the rep's own goal: the only submissions goal. */
  combined: { total: number | null; prev: number | null; goal: GoalPart; unavailable?: string };
  /**
   * Est. commission on the events inside the range: the admin Program
   * Submissions table's "Est. commission (selected range)" cell for this rep,
   * from the same computeCommission call. `otherWon` are wons the plan pays
   * that sit on no card here (Veteran-pipeline wons outside every semester's
   * Enrolled Won stage), so the cards plus this line add up to the amount.
   */
  commission: { amount: number | null; label: string; otherWon: { count: number; amount: number; stages: string[] } };
  best: BestMonth | null;
  army: { ca101: MyMilestoneCard; approval: MyMilestoneCard; deadline: DeadlineList; won: MyWonCard };
  veteran: { submitted: MyMilestoneCard; accepted: MyMilestoneCard; won: MyWonCard; semester: { key: string; label: string; short: string } };
  notes: string[];
}

// ---- the rep's events --------------------------------------------------------------------------------------

/** The rep's counted events for a milestone in [start, end): first entry per contact, owner at the event = the rep. */
export function repMilestoneEvents(m: MilestoneMapping, rep: Rep, start: Date, end: Date): EventRow[] {
  const seen = new Set<string>();
  const out: EventRow[] = [];
  for (const r of firstEvents(m.key, m.reportingGroup, start.toISOString(), end.toISOString())) {
    if (seen.has(r.who)) continue;
    seen.add(r.who);
    if (r.assigned_to_at_event === rep.userId) out.push(r);
  }
  return out;
}

// ---- est. commission per event -----------------------------------------------------------------------------

type PriceKind = "submission" | "won";

/**
 * The invoice line for each of the rep's paid events inside the range, keyed
 * by event (submission: contact id + event time; won: opportunity id). Built
 * from computeInvoiceLines month by month, with each month's window running
 * to the end of the range (an open range ends now), which is exactly how the
 * commission table and the invoices price the same events: the retro rate
 * when that month's combined submissions reach the threshold, the first-tier
 * rate for the first N wons of the month. `pays` is false when the plan does
 * not pay for this kind of event at all (the index is then empty).
 */
export interface PriceIndex {
  plan: Plan | null;
  pays: boolean;
  lines: Map<string, InvoiceLine>;
}

export function priceIndex(rep: Rep, range: DateRange, kind: PriceKind): PriceIndex {
  const plan = planFor(rep);
  const pays = plan !== null && (kind === "submission" ? plan.type === "per_submission_retro" : isWonBased(plan));
  const lines = new Map<string, InvoiceLine>();
  if (!pays) return { plan, pays, lines };
  for (let mStart = startOfMonth(range.start); mStart.getTime() < range.end.getTime(); mStart = addMonths(mStart, 1)) {
    const windowEnd = Math.min(addMonths(mStart, 1).getTime(), range.end.getTime());
    for (const l of computeInvoiceLines(rep, mStart, new Date(windowEnd)).lines) {
      if (l.kind !== kind) continue;
      lines.set(kind === "won" ? (l.opportunityId ?? `${l.contactId ?? ""}|${l.eventAt}`) : `${l.contactId ?? ""}|${l.eventAt}`, l);
    }
  }
  return { plan, pays, lines };
}

export const submissionKey = (contactId: string | null, eventAt: string) => `${contactId ?? ""}|${eventAt}`;

/** Sum and label ("3 × $75 + 2 × $100 (retro)") of the lines behind the given event keys. */
function priceEvents(idx: PriceIndex, keys: string[]): { amount: number; label: string; unpriced: number; perKey: Map<string, number> } {
  const groups: { rate: number; tier: string; n: number }[] = [];
  const perKey = new Map<string, number>();
  let amount = 0;
  let unpriced = 0;
  for (const k of keys) {
    const l = idx.lines.get(k);
    if (!l) {
      unpriced += 1;
      continue;
    }
    amount += l.amount;
    perKey.set(k, l.amount);
    const g = groups.find((x) => x.rate === l.rate && x.tier === l.tier);
    if (g) g.n += 1;
    else groups.push({ rate: l.rate, tier: l.tier, n: 1 });
  }
  const p = idx.plan;
  const baseRate = p ? (p.type === "per_submission_retro" ? p.rate : p.type === "per_won_flat" ? p.rate : p.firstRate) : 0;
  const label = groups.length > 0 ? groups.map((g) => `${n(g.n)} × ${usd(g.rate)}${g.tier === "retro" ? " (retro)" : ""}`).join(" + ") : `0 × ${usd(baseRate)}`;
  return { amount, label: unpriced > 0 ? `${label} · ${n(unpriced)} unpriced` : label, unpriced, perKey };
}

/** Why a card shows commission or the count alone, from the plan. */
function commissionNoteFor(plan: Plan | null, kind: PriceKind, pays: boolean, what: string): string {
  if (!plan) return "Est. commission — unavailable: your commission plan is not in config/commission.json.";
  if (pays) return `Est. commission — what these ${what} earn under your plan (${planText(plan)}), priced month by month through the end of the range, exactly as your invoice lines are; an estimate from dashboard counts, never cash.`;
  if (kind === "won") return `Commission — none attaches to wons under your plan (${planText(plan)}), so this card shows the count alone.`;
  return `Commission — none attaches to this stage under your plan (${planText(plan)}), so this card shows the count alone.`;
}

function seriesOf(range: DateRange, rows: { t: string; v: number | null }[]): TimeSeries {
  const b = buckets(range.start, range.end);
  return { grouping: b.grouping, points: fill(b, rows.map((r) => ({ t: r.t, c: 1, v: r.v ?? 0 }))), total: rows.length };
}

/** The rep's open opportunities sitting in the stage now (with the reporting-group tag when the group is tag-based). */
function snapshotFor(m: MilestoneMapping, rep: Rep): number {
  let tagSql = "";
  const params: string[] = [m.stageId, rep.userId];
  if (m.reportingGroupBasis === "contact_tag") {
    const tag = mappingConfig.reportingGroups[m.reportingGroup]?.tag;
    if (tag) {
      tagSql = ` AND EXISTS (SELECT 1 FROM contacts c WHERE c.id = o.contact_id AND c.tags LIKE ?)`;
      params.push(`%"${tag}"%`);
    }
  }
  const r = getDb().prepare(`SELECT COUNT(*) AS c FROM opportunities o WHERE o.stage_id = ? AND o.assigned_to = ? AND o.missing_since IS NULL AND o.status = 'open'${tagSql}`).get(...params) as { c: number };
  return r.c;
}

/** The milestone keys whose events are "submissions" for commission: CA 101 and every semester's IAU App Submitted. */
function isSubmissionKey(key: string): boolean {
  return key === CA101_KEY || iauKeys("all").includes(key);
}

function milestoneCard(key: string, rep: Rep, range: DateRange, title: string, subtitle: (m: MilestoneMapping) => string, price: { cur: PriceIndex; prev: PriceIndex }): MyMilestoneCard | null {
  const m = trackedMilestones().find((x) => x.key === key);
  if (!m) return null;
  const cov = coverage();
  const snap = snapshotFor(m, rep);
  const pays = price.cur.pays && isSubmissionKey(key);
  const commissionNote = commissionNoteFor(price.cur.plan, "submission", pays, "submissions");
  const base: MyMilestoneCard = {
    key: m.key,
    title,
    subtitle: subtitle(m),
    program: m.program,
    stageName: m.stageName,
    reportingGroup: m.reportingGroup,
    achieved: null,
    prev: null,
    partialHistory: false,
    currentInStage: snap,
    commission: null,
    commissionNote,
    series: { grouping: buckets(range.start, range.end).grouping, points: [], total: 0 },
    notes: [],
  };
  if (!cov.firstCoreSyncAt) return { ...base, unavailableReason: "Milestone tracking has not started yet (no completed sync).", prevUnavailableReason: "No milestone history." };
  const rows = repMilestoneEvents(m, rep, range.start, range.end);
  const prevRows = repMilestoneEvents(m, rep, range.prevStart, range.prevEnd);
  const priced = pays ? priceEvents(price.cur, rows.map((r) => submissionKey(r.contact_id, r.event_time))) : null;
  const prevPriced = pays ? priceEvents(price.prev, prevRows.map((r) => submissionKey(r.contact_id, r.event_time))) : null;
  const partialHistory = range.start.toISOString() < cov.firstCoreSyncAt;
  const prevPartial = range.prevStart.toISOString() < cov.firstCoreSyncAt;
  const notes = [
    `Counting — your contacts' first entry into "${m.stageName}" in reporting group ${m.reportingGroup}, once per contact, credited to the opportunity owner at the time of the event (you); re-entering the stage does not count again. The same events as the team card's row for you.`,
    commissionNote,
    pays
      ? "Chart — the same events per hour, day, or week (contacts on the left axis, est. commission on the right). Click a point for that bucket's contacts; click the card for the whole range."
      : "Chart — the same events per hour, day, or week. Click a point for that bucket's contacts; click the card for the whole range.",
    "Currently in stage — your open opportunities sitting in the stage right now (a snapshot, kept separate from the events).",
  ];
  if (partialHistory) notes.push(`Limitation: milestone tracking began ${fmtDay(new Date(cov.firstCoreSyncAt))}; before that date only contacts still sitting in this stage at the first sync are known, and contacts that had already moved on are not counted.`);
  return {
    ...base,
    achieved: rows.length,
    prev: prevRows.length,
    prevUnavailableReason: prevPartial ? "Comparison period predates full milestone tracking; prior-period count is partial." : undefined,
    partialHistory,
    commission: priced ? { amount: priced.amount, label: priced.label, prev: prevPriced ? prevPriced.amount : null, unpriced: priced.unpriced } : null,
    series: seriesOf(
      range,
      rows.map((r) => ({ t: r.event_time, v: priced ? (priced.perKey.get(submissionKey(r.contact_id, r.event_time)) ?? 0) : 0 })),
    ),
    notes,
  };
}

// ---- won -------------------------------------------------------------------------------------------------

/** The rep's opportunities that first became won in the range, in the program (and, for Veterans, in the semester's Enrolled Won stage). */
export function repWonIn(rep: Rep, range: DateRange, program: "army" | "veteran", semester: Semester | null): WonOpp[] {
  const stageIds = semester ? new Set([trackedMilestones().find((m) => m.key === semester.wonKey)?.stageId].filter((x): x is string => Boolean(x))) : null;
  return wonOpps("period", range).filter((o) => o.assignedTo === rep.userId && o.programKind === program && (!stageIds || stageIds.has(o.stageId)));
}

function wonCard(rep: Rep, range: DateRange, program: "army" | "veteran", semester: Semester | null, price: { cur: PriceIndex; prev: PriceIndex }): MyWonCard {
  const list = repWonIn(rep, range, program, semester);
  const prevList = repWonIn(rep, prevRangeOf(range), program, semester);
  const pays = price.cur.pays;
  const priced = pays ? priceEvents(price.cur, list.map((o) => o.id)) : null;
  const prevPriced = pays ? priceEvents(price.prev, prevList.map((o) => o.id)) : null;
  const commissionNote = commissionNoteFor(price.cur.plan, "won", pays, "wons");
  const cov = coverage();
  const prevPartial = cov.firstCoreSyncAt ? range.prevStart.toISOString() < cov.firstCoreSyncAt : true;
  const wonStage = semester ? trackedMilestones().find((m) => m.key === semester.wonKey) : undefined;
  const stageNames = semester ? [wonStage?.stageName ?? semester.wonKey] : [...new Set(list.map((o) => o.stageName))];
  const programLabel = program === "army" ? "Army CA" : "Veteran G.I. Bill";
  return {
    key: `won-${program}${semester ? `-${semester.key}` : ""}`,
    title: program === "army" ? "Enrolled / Won · Army" : `Enrolled / Won · ${semester?.short ?? "Veteran"}`,
    subtitle: semester ? `${programLabel} · ${semester.label} · "${stageNames[0]}" · status won · became won in period` : `${programLabel} pipeline · status won · became won in period`,
    program,
    count: list.length,
    prevCount: prevList.length,
    prevUnavailableReason: prevPartial ? "Comparison period predates full milestone tracking; prior-period count is partial." : undefined,
    stageNames,
    commission: priced ? { amount: priced.amount, label: priced.label, prev: prevPriced ? prevPriced.amount : null, unpriced: priced.unpriced } : null,
    commissionNote,
    series: seriesOf(
      range,
      list.filter((o) => o.wonAt).map((o) => ({ t: o.wonAt as string, v: priced ? (priced.perKey.get(o.id) ?? 0) : 0 })),
    ),
    notes: [
      `Won — opportunity status = won (the first won transition, once per opportunity id) in the ${programLabel} pipeline, credited to the opportunity owner at the won event (you)${semester ? `, counted when the opportunity was won in the "${stageNames[0]}" stage, the ${semester.label} semester` : ""}. The same events as the Won Opportunities row and your Won / Enrolled card.`,
      commissionNote,
      pays ? "Chart — the same wons per hour, day, or week (wons on the left axis, est. commission on the right). Click a point for that bucket; click the card for the whole range." : "Chart — the same wons per hour, day, or week. Click a point for that bucket; click the card for the whole range.",
    ],
  };
}

// ---- the 5-day deadline list -----------------------------------------------------------------------------

export function approvalDeadlines(rep: Rep, now: Date): DeadlineList {
  const m = trackedMilestones().find((x) => x.key === APPROVAL_KEY);
  const asOf = now.toISOString();
  if (!m) return { days: APPROVAL_DEADLINE_DAYS, rows: [], expiringSoon: 0, expired: 0, asOf };
  type Row = { id: string; contact_id: string | null; name: string | null; cname: string | null; last_stage_change_at: string | null; first_seen_at: string; ev: string | null };
  const rows = getDb()
    .prepare(
      `SELECT o.id, o.contact_id, o.name, c.name AS cname, o.last_stage_change_at, o.first_seen_at,
              (SELECT MAX(e.event_time) FROM milestone_events e WHERE e.opportunity_id = o.id AND e.kind = 'milestone' AND e.milestone_key = ?) AS ev
         FROM opportunities o LEFT JOIN contacts c ON c.id = o.contact_id
        WHERE o.stage_id = ? AND o.assigned_to = ? AND o.missing_since IS NULL AND o.status = 'open'`,
    )
    .all(APPROVAL_KEY, m.stageId, rep.userId) as unknown as Row[];
  const list: DeadlineRow[] = rows.map((r) => {
    const basis: DeadlineRow["basis"] = r.last_stage_change_at ? "ghl" : r.ev ? "event" : "estimated";
    const enteredAt = r.last_stage_change_at ?? r.ev ?? r.first_seen_at;
    return {
      opportunityId: r.id,
      contactId: r.contact_id,
      name: r.cname ?? r.name ?? "(no name)",
      ghlUrl: r.contact_id ? contactUrl(r.contact_id) : null,
      enteredAt,
      basis,
      deadline: addDays(new Date(enteredAt), APPROVAL_DEADLINE_DAYS).toISOString(),
    };
  });
  list.sort((a, b) => (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0));
  const t = now.getTime();
  const soon = t + 48 * 3_600_000;
  return {
    days: APPROVAL_DEADLINE_DAYS,
    rows: list,
    expiringSoon: list.filter((r) => Date.parse(r.deadline) > t && Date.parse(r.deadline) <= soon).length,
    expired: list.filter((r) => Date.parse(r.deadline) <= t).length,
    asOf,
  };
}

// ---- the section -----------------------------------------------------------------------------------------

export function computeMySubmissions(rep: Rep, range: DateRange, semester: Semester): MySubmissions {
  const now = range.asOf;
  const singleDay = range.key === "today" || range.key === "yesterday";
  const subs = computeSubmissions(range, "all");
  const prevSubs = computeSubmissions(prevRangeOf(range), "all");
  const total = subs.value === null ? null : (subs.rows.find((r) => r.userId === rep.userId)?.total ?? 0);
  const prevTotal = prevSubs.value === null ? null : (prevSubs.rows.find((r) => r.userId === rep.userId)?.total ?? 0);

  // Price the rep's paid events once per kind for the range and the comparison period; every card and drilldown reads the same lines.
  const prevRange = prevRangeOf(range);
  const subPrice = { cur: priceIndex(rep, range, "submission"), prev: priceIndex(rep, prevRange, "submission") };
  const wonPrice = { cur: priceIndex(rep, range, "won"), prev: priceIndex(rep, prevRange, "won") };
  const plan = subPrice.cur.plan;

  // The range's est. commission: the SAME call behind the admin table's "Est. commission (selected range)" column.
  const rangeCommission = computeCommission(range, now).reps[rep.userId]?.commission ?? null;
  // Paid wons that no card below shows: Veteran-pipeline wons outside every semester's Enrolled Won stage (stages added in GHL after the mapping, for example).
  const semesterWonStages = new Set(semesters().map((s) => trackedMilestones().find((m) => m.key === s.wonKey)?.stageId).filter((x): x is string => Boolean(x)));
  const otherWonList = wonOpps("period", range).filter((o) => o.assignedTo === rep.userId && o.programKind === "veteran" && !semesterWonStages.has(o.stageId));
  const otherWon = {
    count: otherWonList.length,
    amount: otherWonList.reduce((s, o) => s + (wonPrice.cur.lines.get(o.id)?.amount ?? 0), 0),
    stages: [...new Set(otherWonList.map((o) => o.stageName))],
  };

  const ca101 = milestoneCard(CA101_KEY, rep, range, "Army CA 101 Submissions", (m) => `Army CA · ${m.reportingGroup} · "${m.stageName}" · reached in period`, subPrice);
  const approval = milestoneCard(APPROVAL_KEY, rep, range, "Awaiting Supervisor Approval", (m) => `Army CA · ${m.reportingGroup} · awaiting approval · entered in period`, subPrice);
  const submitted = milestoneCard(semester.submittedKey, rep, range, `${semester.short} Application Submissions`, (m) => `Veteran G.I. Bill · ${semester.label} (${m.reportingGroup}) · "${m.stageName}" · reached in period`, subPrice);
  const accepted = milestoneCard(semester.acceptedKey, rep, range, `${semester.short} Accepted`, (m) => `Veteran G.I. Bill · ${semester.label} (${m.reportingGroup}) · accepted in period`, subPrice);
  const missing = (key: string, program: "army" | "veteran", title: string): MyMilestoneCard => ({
    key,
    title,
    subtitle: "not configured",
    program,
    stageName: "",
    reportingGroup: "",
    achieved: null,
    unavailableReason: `Milestone "${key}" is not tracked in config/ghl-mapping.json.`,
    prev: null,
    partialHistory: false,
    currentInStage: 0,
    commission: null,
    commissionNote: "",
    series: { grouping: "daily", points: [], total: 0 },
    notes: [],
  });

  return {
    rangeLabel: range.label,
    partial: range.partial,
    combined: { total, prev: prevTotal, goal: goalPartFor(rep, subs.goal, total, singleDay), unavailable: subs.unavailableReason },
    commission: { amount: rangeCommission?.amount ?? null, label: rangeCommission?.label ?? "plan not found", otherWon },
    best: bestMonthFor(rep, now),
    army: {
      ca101: ca101 ?? missing(CA101_KEY, "army", "Army CA 101 Submissions"),
      approval: approval ?? missing(APPROVAL_KEY, "army", "Awaiting Supervisor Approval"),
      deadline: approvalDeadlines(rep, now),
      won: wonCard(rep, range, "army", null, wonPrice),
    },
    veteran: {
      submitted: submitted ?? missing(semester.submittedKey, "veteran", `${semester.short} Application Submissions`),
      accepted: accepted ?? missing(semester.acceptedKey, "veteran", `${semester.short} Accepted`),
      won: wonCard(rep, range, "veteran", semester, wonPrice),
      semester: { key: semester.key, label: semester.label, short: semester.short },
    },
    notes: [
      "Every card is the admin Submissions card of the same name filtered to you: the same events, the same counting rules, compared with the same previous period, for the date range in the bar at the top.",
      "Combined goal — the only submissions goal (CA 101 + IAU App, every semester, 5 per rep per week scaled by your plan, pro-rated to the range). Met = at or above the whole range's goal; On Track = at or above the goal for the time elapsed so far ('by now'); Missed = below it. The six cards carry no goal of their own.",
      "Est. commission (this range) — the line under Combined submissions is the admin Program Submissions table's commission cell for you, from the same calculation: every counted submission or won inside the range, priced by calendar month under your plan. The six cards below break it down by stage; a won in a Veteran stage that is not a semester's Enrolled Won stage is paid but sits on no card, so it is noted on that line.",
      "Best month — your highest calendar-month total of combined submissions since milestone tracking began; 'away from beating it' is what this month still needs to pass it.",
      `5-day deadline — every open opportunity of yours sitting in "Supervisor Approval (5 days)" right now, with ${n(APPROVAL_DEADLINE_DAYS)} calendar days from the time it entered the stage: GHL's own stage-entry time (lastStageChangeAt) when it has one, otherwise the time the dashboard recorded the entry, otherwise when the dashboard first saw it there (marked estimated). Yellow under 2 days, red under 24 hours, 'Expired' once the deadline has passed. The countdown ticks on your screen; the dashboard never writes to GHL.`,
      `Semester — the three Veteran cards show ${semester.label}; pick another with the dropdown. Combined submissions and the goal count every semester.`,
      "Enrolled / Won — opportunity status = won (the first won transition per opportunity id), credited to the owner at the won event; the Veteran card counts wons in the selected semester's Enrolled Won stage.",
      plan
        ? `Est. commission — the second figure on a card is what its events earn under your plan (${planText(plan)}): a per-submission plan pays on CA 101 and IAU App Submitted, a per-won plan on Enrolled / Won; a card whose event does not pay shows the count alone. Each event is priced in its own calendar month through the end of the range, exactly as your invoice lines (and the admin commission table) price it, so the card, its chart's right axis, and its drilldown total all agree. Estimates from dashboard counts; the official commission calculation is done outside this dashboard.`
        : "Est. commission — unavailable: your commission plan is not in config/commission.json, so the cards show counts alone.",
      "Drilldowns — click a card for the contacts behind the whole range, a chart point for that hour, day, or week; every row links to the contact in GHL and carries the commission the event earns under your plan (a dash when it earns none). Rows are read from the cache; email and phone are read from GHL for the listed contacts only.",
    ],
  };
}

// ---- drilldowns (the rep's own rows; served by /api/me/drilldown) -----------------------------------------

function bucketFilter<T>(range: DateRange, bucket: string | null, rows: T[], timeOf: (r: T) => string | null): T[] {
  if (!bucket) return rows;
  const b = buckets(range.start, range.end);
  return rows.filter((r) => {
    const t = timeOf(r);
    return t !== null && b.bucketOf(new Date(t)) === bucket;
  });
}

/** The rep's contacts behind one milestone card (or one chart bucket of it). */
export async function myMilestoneDrilldown(rep: Rep, key: string, range: DateRange, bucket: string | null): Promise<RepDrillResult | null> {
  const m = trackedMilestones().find((x) => x.key === key);
  if (!m) return null;
  const events = bucketFilter(range, bucket, repMilestoneEvents(m, rep, range.start, range.end), (r) => r.event_time);
  const enriched = await enrich(events.map((e): EventLike => ({ ...e, stageReached: m.stageName, milestoneKey: m.key })));
  const idx = priceIndex(rep, range, "submission");
  const pays = idx.pays && isSubmissionKey(key);
  const rows = enriched.rows.map((r) => ({ ...repRow(r), commission: pays ? (idx.lines.get(submissionKey(r.contactId, r.reachedOn ?? ""))?.amount ?? null) : null }));
  return { ok: true, title: m.label, rows, count: rows.length, detailsNote: enriched.detailsNote, fetchedAt: new Date().toISOString() };
}

/** The rep's won opportunities behind an Enrolled / Won card (or one chart bucket of it). */
export function myWonDrilldown(rep: Rep, program: "army" | "veteran", semester: Semester | null, range: DateRange, bucket: string | null): RepDrillResult {
  const names = userNames();
  const list = bucketFilter(range, bucket, repWonIn(rep, range, program, semester), (o) => o.wonAt);
  const idx = priceIndex(rep, range, "won");
  const rows = list.map((o) => ({ ...repRow(wonRow(o, names)), commission: idx.pays ? (idx.lines.get(o.id)?.amount ?? null) : null }));
  return { ok: true, title: program === "army" ? "Enrolled / Won · Army" : `Enrolled / Won · ${semester?.short ?? "Veteran"}`, rows, count: rows.length, detailsNote: null, fetchedAt: new Date().toISOString() };
}

/**
 * The rep's counted submissions this calendar month for one program (the
 * Momentum tiles): Army = CA 101 submitted; Veteran = IAU App Submitted,
 * every semester. Each row carries the estimated commission the event earns
 * under the rep's plan, priced exactly as the invoice lines are.
 */
export async function mySubmissionsDrilldown(rep: Rep, program: "army" | "veteran", now: Date): Promise<RepDrillResult> {
  const month = resolveRange("this_month", now);
  const keys = program === "army" ? [CA101_KEY] : iauKeys("all");
  const events: EventLike[] = [];
  for (const key of keys) {
    const m = trackedMilestones().find((x) => x.key === key);
    if (!m) continue;
    const sem = semesters().find((s) => s.submittedKey === key);
    for (const e of repMilestoneEvents(m, rep, month.start, month.end)) events.push({ ...e, stageReached: key === CA101_KEY ? "Army CA 101" : `Veteran IAU · ${sem?.short ?? key}`, milestoneKey: key });
  }
  const enriched = await enrich(events);
  const idx = priceIndex(rep, month, "submission");
  const rows = enriched.rows.map((r) => ({ ...repRow(r), commission: idx.pays ? (idx.lines.get(submissionKey(r.contactId, r.reachedOn ?? ""))?.amount ?? null) : null }));
  return { ok: true, title: program === "army" ? "Army CA 101 submissions this month" : "Veteran IAU App submissions this month", rows, count: rows.length, detailsNote: enriched.detailsNote, fetchedAt: new Date().toISOString() };
}

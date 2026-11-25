// Program Submissions (combined): CA 101 submitted (Army, FY27) + IAU App
// Submitted (Veteran, for the selected semester: the default in
// config/ghl-mapping.json semesters.list, Spring Session 1 since 2026-11-17,
// or another via the Submissions section's semester dropdown), per
// rep and as a team total. This is the ONLY submissions goal (5 per rep per
// week, scaled per rep in config/sales-reps.json). Event-based, like the
// milestone cards it is built from.
//
// Combined, commission and the monthly quota count every semester: a
// submission is a submission whichever semester it was for, and neither
// the combined count nor the quota may drop just because the page is
// showing another semester. The IAU column shows the selected semester.
//
// submissionLedger() is the ONE list of counted submissions (owner request
// 2026-11-25): the table rows here, the rep pages, commission, invoices,
// bounties and Rep Performance all read it, so they cannot diverge.

import type { DateRange } from "@/lib/dates";
import { goalFor, type Goal } from "@/lib/goals";
import { defaultSemester, semesters, trackedMilestones, type Semester } from "@/lib/mapping-config";
import { computeMilestoneByKey, firstEvents, userNames, type MilestoneResult } from "@/lib/milestones";
import { inactiveLabel, repRoster, type Rep } from "@/lib/reps";

export interface SubmissionRow {
  userId: string | null;
  name: string;
  isRep: boolean;
  ca101: number;
  /** IAU App Submitted for the selected semester (or every semester when "all"). */
  iau: number;
  /** IAU App Submitted for every semester (equals iau when "all" is selected). */
  iauAll: number;
  /** Combined = ca101 + iauAll: every semester, like the goal, the quota and commission. */
  total: number;
}

export interface SubmissionsResult {
  key: "programSubmissions";
  title: string;
  value: number | null;
  unavailableReason?: string;
  ca101: number;
  /** IAU App Submitted for the selected semester (the IAU column). */
  iau: number;
  /** IAU App Submitted for every semester (what Combined counts). */
  iauAll: number;
  /** Which semester the IAU column covers. key "all" = every configured semester. */
  semester: { key: string; label: string; short: string };
  /** Stage label for the IAU part, e.g. "IAU App Submitted (FS2)" or "IAU App Submitted (FS2 + Spring Session 1)". */
  iauLabel: string;
  prev: number | null;
  prevUnavailableReason?: string;
  goal: Goal | null;
  /** Opportunity Value behind the team's submissions (sum of the parts). Not revenue. */
  oppValue: number;
  prevOppValue: number | null;
  oppValueMissing: number;
  /** The configured reps (always listed), sorted by combined count. */
  rows: SubmissionRow[];
  /** Everyone else, including unassigned, as one row. */
  others: SubmissionRow | null;
  unmatchedReps: Rep[];
  partialHistory: boolean;
  parts: { ca101: MilestoneResult; iau: MilestoneResult[] } | null;
  notes: string[];
}

const CA101_KEY = "army_ca101";

/** A single semester, or "all" for every configured semester together (commission, quota). */
export type SemesterSelection = Semester | "all";

export interface SubmissionEvent {
  /** Opportunity owner at the time of the event (the credited user). */
  userId: string | null;
  /** Event time (ISO). */
  time: string;
  key: string;
}

/** The IAU App Submitted milestone keys covered by a selection. */
export function iauKeys(sel: SemesterSelection): string[] {
  return sel === "all" ? semesters().map((s) => s.submittedKey) : [sel.submittedKey];
}

/** One counted submission: a contact's first entry into CA 101 submitted or into one semester's IAU App Submitted stage. */
export interface LedgerEntry {
  /** Contact id, or "opp:<id>" when the opportunity has no contact. */
  who: string;
  contactId: string | null;
  opportunityId: string;
  /** Opportunity owner at the time of the event (the credited user). */
  userId: string | null;
  /** Event time (ISO). */
  time: string;
  key: string;
  program: "army" | "veteran";
  /** The semester for an IAU App submission; null for CA 101. */
  semester: Semester | null;
  reportingGroup: string;
}

/**
 * THE list of counted submissions inside [start, end): the first entry per
 * contact into CA 101 submitted (Army CA) and into every semester's IAU App
 * Submitted stage (Veteran G.I. Bill), credited to the opportunity owner at
 * the event, oldest first. Every submissions figure in the dashboard, admin
 * and rep alike, is a count or a filter of this list.
 */
export function submissionLedger(start: Date, end: Date): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  const s = start.toISOString();
  const e = end.toISOString();
  for (const key of [CA101_KEY, ...iauKeys("all")]) {
    const m = trackedMilestones().find((x) => x.key === key);
    if (!m) continue;
    const semester = key === CA101_KEY ? null : (semesters().find((x) => x.submittedKey === key) ?? null);
    for (const r of firstEvents(key, m.reportingGroup, s, e)) {
      out.push({ who: r.who, contactId: r.contact_id, opportunityId: r.opportunity_id, userId: r.assigned_to_at_event, time: r.event_time, key, program: key === CA101_KEY ? "army" : "veteran", semester, reportingGroup: m.reportingGroup });
    }
  }
  return out.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

/** The ledger entries credited to one rep. */
export function ledgerFor(rep: Pick<Rep, "userId">, start: Date, end: Date): LedgerEntry[] {
  return submissionLedger(start, end).filter((x) => x.userId === rep.userId);
}

/** Submission label for a ledger entry: "CA 101 submitted" or "IAU App Submitted (SS1 '27)". */
export function ledgerEventLabel(x: LedgerEntry): string {
  return x.key === CA101_KEY ? "CA 101 submitted" : `IAU App Submitted (${x.semester?.short ?? x.key})`;
}

/** Program label for a ledger entry: "Army CA 101" or "Veteran IAU · SS1 '27". */
export function ledgerProgramLabel(x: LedgerEntry): string {
  return x.key === CA101_KEY ? "Army CA 101" : `Veteran IAU · ${x.semester?.short ?? x.key}`;
}

/** The ledger as the lighter {userId, time, key} rows commission and the bounties count. */
export function submissionEvents(start: Date, end: Date): SubmissionEvent[] {
  return submissionLedger(start, end).map((x) => ({ userId: x.userId, time: x.time, key: x.key }));
}

export function computeSubmissions(range: DateRange, sel: SemesterSelection = defaultSemester()): SubmissionsResult {
  const ca = computeMilestoneByKey(CA101_KEY, range);
  const iauParts = iauKeys(sel).map((k) => computeMilestoneByKey(k, range)).filter((m): m is MilestoneResult => m !== undefined);
  // Every semester's part decides availability, the previous period, partial history and Opportunity Value: Combined counts them all.
  const iauPartsAll = iauKeys("all").map((k) => computeMilestoneByKey(k, range)).filter((m): m is MilestoneResult => m !== undefined);
  const selectedKeys = new Set(iauKeys(sel));
  const semester = sel === "all" ? { key: "all", label: semesters().map((s) => s.label).join(" + "), short: semesters().map((s) => s.short).join(" + ") } : { key: sel.key, label: sel.label, short: sel.short };
  const iauLabel = sel === "all" ? `IAU App Submitted (${semesters().map((s) => s.short).join(" + ")})` : (iauParts[0]?.label ?? `IAU App Submitted (${sel.short})`);
  const base: SubmissionsResult = {
    key: "programSubmissions",
    title: "Program Submissions (combined)",
    value: null,
    ca101: 0,
    iau: 0,
    iauAll: 0,
    semester,
    iauLabel,
    prev: null,
    goal: goalFor("programSubmissions", range),
    oppValue: 0,
    prevOppValue: null,
    oppValueMissing: 0,
    rows: [],
    others: null,
    unmatchedReps: [],
    partialHistory: false,
    parts: null,
    notes: [],
  };
  if (!ca || iauParts.length !== iauKeys(sel).length || iauPartsAll.length !== iauKeys("all").length) return { ...base, unavailableReason: `Milestone mapping for CA 101 or ${iauLabel} is missing in config/ghl-mapping.json.` };
  const parts = [ca, ...iauPartsAll];
  const broken = parts.find((p) => p.achieved === null);
  if (broken) return { ...base, unavailableReason: broken.unavailableReason ?? "Milestone tracking has not started." };

  const roster = repRoster(range);
  const names = userNames();
  const ledger = submissionLedger(range.start, range.end);
  const byUser = new Map<string | null, SubmissionRow>();
  const ensure = (userId: string | null) => {
    let row = byUser.get(userId);
    if (!row) {
      const rep = userId !== null ? roster.byUserId.get(userId) : undefined;
      const inactive = userId !== null ? roster.inactive.get(userId) : undefined;
      const name = userId === null ? "Unassigned" : (rep?.name ?? inactive?.name ?? names.get(userId) ?? userId);
      row = { userId, name: inactive ? `${name} (${inactiveLabel(inactive, roster.day)})` : name, isRep: userId !== null && roster.byUserId.has(userId), ca101: 0, iau: 0, iauAll: 0, total: 0 };
      byUser.set(userId, row);
    }
    return row;
  };
  for (const userId of roster.byUserId.keys()) ensure(userId);
  for (const x of ledger) {
    const row = ensure(x.userId);
    if (x.key === CA101_KEY) row.ca101 += 1;
    else {
      row.iauAll += 1;
      if (selectedKeys.has(x.key)) row.iau += 1;
    }
    row.total = row.ca101 + row.iauAll;
  }
  const repRows = [...byUser.values()].filter((r) => r.isRep).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const otherRows = [...byUser.values()].filter((r) => !r.isRep);
  const others: SubmissionRow | null =
    otherRows.length === 0
      ? null
      : otherRows.reduce(
          (acc, r) => ({ ...acc, ca101: acc.ca101 + r.ca101, iau: acc.iau + r.iau, iauAll: acc.iauAll + r.iauAll, total: acc.total + r.total }),
          { userId: null, name: `Other users, not sales reps (${otherRows.map((r) => r.name).join(", ")})`, isRep: false, ca101: 0, iau: 0, iauAll: 0, total: 0 },
        );

  const sum = (f: (p: MilestoneResult) => number) => parts.reduce((s, p) => s + f(p), 0);
  const anyNull = (f: (p: MilestoneResult) => number | null) => parts.some((p) => f(p) === null);
  const prev = anyNull((p) => p.prev) ? null : submissionLedger(range.prevStart, range.prevEnd).length;
  const partialHistory = parts.some((p) => p.partialHistory);
  const semesterNote =
    sel === "all"
      ? `IAU App Submitted counts every configured semester (${semesters().map((s) => `${s.label}: "${trackedMilestones().find((m) => m.key === s.submittedKey)?.stageName ?? s.submittedKey}"`).join("; ")}).`
      : `Semester — the IAU part is ${sel.label} ("${iauParts[0]?.stageName ?? ""}", reporting group ${sel.key}); pick another semester with the dropdown above the Veteran cards. ${defaultSemester().label} is the default.`;
  return {
    ...base,
    value: ledger.length,
    ca101: ledger.filter((x) => x.key === CA101_KEY).length,
    iau: ledger.filter((x) => selectedKeys.has(x.key)).length,
    iauAll: ledger.filter((x) => x.key !== CA101_KEY).length,
    prev,
    prevUnavailableReason: parts.find((p) => p.prevUnavailableReason)?.prevUnavailableReason,
    oppValue: sum((p) => p.value),
    prevOppValue: anyNull((p) => p.prevValue) ? null : sum((p) => p.prevValue ?? 0),
    oppValueMissing: sum((p) => p.valueMissing),
    rows: repRows,
    others,
    unmatchedReps: roster.unmatched,
    partialHistory,
    parts: { ca101: ca, iau: iauParts },
    notes: [
      `Submission — a CA 101 submitted (Army CA, ${ca.reportingGroup}) or an IAU App Submitted (Veteran G.I. Bill, any semester): the first entry into each stage, once per contact, during the period.`,
      semesterNote,
      "Combined — CA 101 + IAU App for every semester, the same list the rep dashboard, the monthly quota, commission and the invoices count; the IAU column shows the selected semester, with the other semesters' count noted under it when there is one.",
      "Both programs — a contact can appear in both parts, since they are different programs.",
      "Rep credit — the opportunity owner at the time of the event.",
      "Sales reps — from config/sales-reps.json, matched by GHL user id; everyone else is grouped as other users and still counts in the team total.",
      "Goal — the only submissions goal: 5 per rep per week, scaled by each rep's multiplier or override (Sam R. 3); the team goal is the sum of every rep's goal.",
      "Other cards — the Army CA 101, Awaiting Supervisor Approval, and semester cards carry no goal of their own.",
      "Opportunity Value — the value on each opportunity at the time of its event, summed across the parts; not revenue, cash, or commission.",
      "Drilldown — click a row to see the contacts behind it.",
      ...(partialHistory ? [ca.notes.find((t) => t.startsWith("Limitation: milestone tracking began")) ?? ""] : []),
    ].filter(Boolean),
  };
}

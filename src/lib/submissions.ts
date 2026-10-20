// Program Submissions (combined): CA 101 submitted (Army, FY27) + IAU App
// Submitted (Veteran, for the selected semester: Fall Session 2 by default,
// or Spring Session 1 via the Submissions section's semester dropdown), per
// rep and as a team total. This is the ONLY submissions goal (5 per rep per
// week, scaled per rep in config/sales-reps.json). Event-based, like the
// milestone cards it is built from.
//
// Commission and the monthly quota count every semester ("all"): a
// submission is a submission whichever semester it was for, and the quota
// must not drop just because the page is showing another semester.

import type { DateRange } from "@/lib/dates";
import { goalFor, type Goal } from "@/lib/goals";
import { defaultSemester, semesters, trackedMilestones, type Semester } from "@/lib/mapping-config";
import { computeMilestoneByKey, firstEvents, type MilestoneResult } from "@/lib/milestones";
import { repRoster, type Rep } from "@/lib/reps";

export interface SubmissionRow {
  userId: string | null;
  name: string;
  isRep: boolean;
  ca101: number;
  /** IAU App Submitted for the selected semester (or every semester when "all"). */
  iau: number;
  total: number;
}

export interface SubmissionsResult {
  key: "programSubmissions";
  title: string;
  value: number | null;
  unavailableReason?: string;
  ca101: number;
  iau: number;
  /** Which semester the IAU part covers. key "all" = every configured semester. */
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

/**
 * Every counted submission inside [start, end): the first entry into CA 101
 * submitted or an IAU App Submitted stage (every semester) per contact,
 * exactly as the card and the drilldowns count them. Used to price
 * commission event by event.
 */
export function submissionEvents(start: Date, end: Date): SubmissionEvent[] {
  const out: SubmissionEvent[] = [];
  for (const key of [CA101_KEY, ...iauKeys("all")]) {
    const m = trackedMilestones().find((x) => x.key === key);
    if (!m) continue;
    const seen = new Set<string>();
    for (const r of firstEvents(key, m.reportingGroup, start.toISOString(), end.toISOString())) {
      if (seen.has(r.who)) continue;
      seen.add(r.who);
      out.push({ userId: r.assigned_to_at_event, time: r.event_time, key });
    }
  }
  return out;
}

export function computeSubmissions(range: DateRange, sel: SemesterSelection = defaultSemester()): SubmissionsResult {
  const ca = computeMilestoneByKey(CA101_KEY, range);
  const iauParts = iauKeys(sel).map((k) => computeMilestoneByKey(k, range)).filter((m): m is MilestoneResult => m !== undefined);
  const semester = sel === "all" ? { key: "all", label: semesters().map((s) => s.label).join(" + "), short: semesters().map((s) => s.short).join(" + ") } : { key: sel.key, label: sel.label, short: sel.short };
  const iauLabel = sel === "all" ? `IAU App Submitted (${semesters().map((s) => s.short).join(" + ")})` : (iauParts[0]?.label ?? `IAU App Submitted (${sel.short})`);
  const base: SubmissionsResult = {
    key: "programSubmissions",
    title: "Program Submissions (combined)",
    value: null,
    ca101: 0,
    iau: 0,
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
  if (!ca || iauParts.length !== iauKeys(sel).length) return { ...base, unavailableReason: `Milestone mapping for CA 101 or ${iauLabel} is missing in config/ghl-mapping.json.` };
  const parts = [ca, ...iauParts];
  const broken = parts.find((p) => p.achieved === null);
  if (broken) return { ...base, unavailableReason: broken.unavailableReason ?? "Milestone tracking has not started." };

  const roster = repRoster();
  const byUser = new Map<string | null, SubmissionRow>();
  const ensure = (userId: string | null, name: string) => {
    let row = byUser.get(userId);
    if (!row) {
      row = { userId, name, isRep: userId !== null && roster.byUserId.has(userId), ca101: 0, iau: 0, total: 0 };
      byUser.set(userId, row);
    }
    return row;
  };
  for (const [userId, rep] of roster.byUserId) ensure(userId, rep.name);
  for (const r of ca.reps) {
    const row = ensure(r.userId, r.name);
    row.ca101 += r.contacts;
    row.total += r.contacts;
  }
  for (const part of iauParts) {
    for (const r of part.reps) {
      const row = ensure(r.userId, r.name);
      row.iau += r.contacts;
      row.total += r.contacts;
    }
  }
  const repRows = [...byUser.values()].filter((r) => r.isRep).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const otherRows = [...byUser.values()].filter((r) => !r.isRep);
  const others: SubmissionRow | null =
    otherRows.length === 0
      ? null
      : otherRows.reduce(
          (acc, r) => ({ ...acc, ca101: acc.ca101 + r.ca101, iau: acc.iau + r.iau, total: acc.total + r.total }),
          { userId: null, name: `Other users, not sales reps (${otherRows.map((r) => r.name).join(", ")})`, isRep: false, ca101: 0, iau: 0, total: 0 },
        );

  const sum = (f: (p: MilestoneResult) => number) => parts.reduce((s, p) => s + f(p), 0);
  const anyNull = (f: (p: MilestoneResult) => number | null) => parts.some((p) => f(p) === null);
  const iauAchieved = iauParts.reduce((s, p) => s + (p.achieved ?? 0), 0);
  const prev = anyNull((p) => p.prev) ? null : sum((p) => p.prev ?? 0);
  const partialHistory = parts.some((p) => p.partialHistory);
  const semesterNote =
    sel === "all"
      ? `IAU App Submitted counts every configured semester (${semesters().map((s) => `${s.label}: "${trackedMilestones().find((m) => m.key === s.submittedKey)?.stageName ?? s.submittedKey}"`).join("; ")}).`
      : `Semester — the IAU part is ${sel.label} ("${iauParts[0]?.stageName ?? ""}", reporting group ${sel.key}); pick another semester with the dropdown above the Veteran cards. Fall Session 2 is the default.`;
  return {
    ...base,
    value: (ca.achieved ?? 0) + iauAchieved,
    ca101: ca.achieved ?? 0,
    iau: iauAchieved,
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
      `Submission — a CA 101 submitted (Army CA, ${ca.reportingGroup}) or an IAU App Submitted (Veteran G.I. Bill, ${semester.key === "all" ? semester.short : semester.label}): the first entry into each stage, once per contact, during the period.`,
      semesterNote,
      "Both programs — a contact can appear in both parts, since they are different programs.",
      "Rep credit — the opportunity owner at the time of the event.",
      "Sales reps — from config/sales-reps.json, matched by GHL user id; everyone else is grouped as other users and still counts in the team total.",
      "Goal — the only submissions goal: 5 per rep per week, scaled by each rep's multiplier or override (Sam R. 3); the team goal is the sum of every rep's goal.",
      "Monthly quota and commission — count submissions for every semester (FS2 and Spring Session 1 alike), whatever semester the table is showing.",
      "Other cards — the Army CA 101, Awaiting Supervisor Approval, and semester cards carry no goal of their own.",
      "Opportunity Value — the value on each opportunity at the time of its event, summed across the parts; not revenue, cash, or commission.",
      "Drilldown — click a row to see the contacts behind it.",
      ...(partialHistory ? [ca.notes.find((t) => t.startsWith("Limitation: milestone tracking began")) ?? ""] : []),
    ].filter(Boolean),
  };
}

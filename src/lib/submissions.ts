// Program Submissions (combined): CA 101 submitted (Army, FY27) + IAU App
// Submitted (Veteran, FS2), per rep and as a team total. This is the metric
// that carries the combined weekly rep goal. Event-based, like the
// milestone cards it is built from.

import type { DateRange } from "@/lib/dates";
import { goalFor, type Goal } from "@/lib/goals";
import { computeMilestoneByKey, type MilestoneResult } from "@/lib/milestones";
import { repRoster, type Rep } from "@/lib/reps";

export interface SubmissionRow {
  userId: string | null;
  name: string;
  isRep: boolean;
  ca101: number;
  fs2: number;
  total: number;
}

export interface SubmissionsResult {
  key: "programSubmissions";
  title: string;
  value: number | null;
  unavailableReason?: string;
  ca101: number;
  fs2: number;
  prev: number | null;
  prevUnavailableReason?: string;
  goal: Goal | null;
  /** Opportunity Value behind the team's submissions (sum of the two parts). Not revenue. */
  oppValue: number;
  prevOppValue: number | null;
  oppValueMissing: number;
  /** The six configured reps (always listed), sorted by combined count. */
  rows: SubmissionRow[];
  /** Named non-reps shown on their own row (NAMED_NON_REPS), after the reps and before "Other users". */
  named: SubmissionRow[];
  others: SubmissionRow | null;
  unmatchedReps: Rep[];
  partialHistory: boolean;
  parts: { ca101: MilestoneResult; fs2: MilestoneResult } | null;
  notes: string[];
}

const CA101_KEY = "army_ca101";
const FS2_KEY = "vet_iau_app_submitted";

// GHL users who get their own named row in the table without being sales reps
// (no rep goal, no status). Matched on the GHL display name, case-insensitive.
// Deliberately not in config/sales-reps.json (owner, edits round 4).
const NAMED_NON_REPS = ["johnny m"];

export function computeSubmissions(range: DateRange): SubmissionsResult {
  const ca = computeMilestoneByKey(CA101_KEY, range);
  const fs = computeMilestoneByKey(FS2_KEY, range);
  const base: SubmissionsResult = {
    key: "programSubmissions",
    title: "Program Submissions (combined)",
    value: null,
    ca101: 0,
    fs2: 0,
    prev: null,
    goal: goalFor("programSubmissions", range),
    oppValue: 0,
    prevOppValue: null,
    oppValueMissing: 0,
    rows: [],
    named: [],
    others: null,
    unmatchedReps: [],
    partialHistory: false,
    parts: null,
    notes: [],
  };
  if (!ca || !fs) return { ...base, unavailableReason: "Milestone mapping for CA 101 or IAU App Submitted (FS2) is missing." };
  if (ca.achieved === null || fs.achieved === null) {
    return { ...base, unavailableReason: ca.unavailableReason ?? fs.unavailableReason ?? "Milestone tracking has not started." };
  }

  const roster = repRoster();
  const byUser = new Map<string | null, SubmissionRow>();
  const ensure = (userId: string | null, name: string) => {
    let row = byUser.get(userId);
    if (!row) {
      row = { userId, name, isRep: userId !== null && roster.byUserId.has(userId), ca101: 0, fs2: 0, total: 0 };
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
  for (const r of fs.reps) {
    const row = ensure(r.userId, r.name);
    row.fs2 += r.contacts;
    row.total += r.contacts;
  }
  const repRows = [...byUser.values()].filter((r) => r.isRep).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const isNamed = (r: SubmissionRow) => NAMED_NON_REPS.includes(r.name.trim().toLowerCase());
  const named = [...byUser.values()].filter((r) => !r.isRep && isNamed(r)).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const otherRows = [...byUser.values()].filter((r) => !r.isRep && !isNamed(r));
  const others: SubmissionRow | null =
    otherRows.length === 0
      ? null
      : otherRows.reduce(
          (acc, r) => ({ ...acc, ca101: acc.ca101 + r.ca101, fs2: acc.fs2 + r.fs2, total: acc.total + r.total }),
          { userId: null, name: `Other users, not sales reps (${otherRows.map((r) => r.name).join(", ")})`, isRep: false, ca101: 0, fs2: 0, total: 0 },
        );

  const prev = ca.prev === null || fs.prev === null ? null : ca.prev + fs.prev;
  const partialHistory = ca.partialHistory || fs.partialHistory;
  return {
    ...base,
    value: ca.achieved + fs.achieved,
    ca101: ca.achieved,
    fs2: fs.achieved,
    prev,
    prevUnavailableReason: ca.prevUnavailableReason ?? fs.prevUnavailableReason,
    oppValue: ca.value + fs.value,
    prevOppValue: ca.prevValue === null || fs.prevValue === null ? null : ca.prevValue + fs.prevValue,
    oppValueMissing: ca.valueMissing + fs.valueMissing,
    rows: repRows,
    named,
    others,
    unmatchedReps: roster.unmatched,
    partialHistory,
    parts: { ca101: ca, fs2: fs },
    notes: [
      `CA 101 submitted (Army CA, ${ca.reportingGroup}) plus IAU App Submitted (Veteran G.I. Bill, ${fs.reportingGroup}): the first entry into each stage, once per contact, during the period. The two parts are different programs, so a contact can appear in both.`,
      "Rep credit uses the opportunity owner at the time of the event. The six sales reps come from config/sales-reps.json; everyone else is grouped as other users and still counts in the team total.",
      "Opportunity Value is the value on each opportunity at the time of its event, summed across both parts. It is not revenue, cash, or commission.",
      ...(named.length > 0 ? [`${named.map((r) => r.name).join(", ")} ${named.length === 1 ? "has" : "have"} a named row for visibility but ${named.length === 1 ? "is" : "are"} not a sales rep, so no rep goal applies.`] : []),
      ...(partialHistory ? [ca.notes.find((t) => t.startsWith("Milestone tracking began")) ?? ""] : []),
    ].filter(Boolean),
  };
}

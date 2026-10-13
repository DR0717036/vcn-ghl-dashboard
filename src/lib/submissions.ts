// Program Submissions (combined): CA 101 submitted (Army, FY27) + IAU App
// Submitted (Veteran, FS2), per rep and as a team total. This is the ONLY
// submissions goal (5 per rep per week, scaled per rep in
// config/sales-reps.json). Event-based, like the milestone cards it is built
// from.

import type { DateRange } from "@/lib/dates";
import { goalFor, type Goal } from "@/lib/goals";
import { trackedMilestones } from "@/lib/mapping-config";
import { computeMilestoneByKey, firstEvents, type MilestoneResult } from "@/lib/milestones";
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
  /** The configured reps (always listed), sorted by combined count. */
  rows: SubmissionRow[];
  /** Everyone else, including unassigned, as one row. */
  others: SubmissionRow | null;
  unmatchedReps: Rep[];
  partialHistory: boolean;
  parts: { ca101: MilestoneResult; fs2: MilestoneResult } | null;
  notes: string[];
}

const CA101_KEY = "army_ca101";
const FS2_KEY = "vet_iau_app_submitted";

export interface SubmissionEvent {
  /** Opportunity owner at the time of the event (the credited user). */
  userId: string | null;
  /** Event time (ISO). */
  time: string;
  key: string;
}

/**
 * Every counted submission inside [start, end): the first entry into CA 101
 * submitted or IAU App Submitted (FS2) per contact, exactly as the card and the
 * drilldowns count them. Used to price commission event by event.
 */
export function submissionEvents(start: Date, end: Date): SubmissionEvent[] {
  const out: SubmissionEvent[] = [];
  for (const key of [CA101_KEY, FS2_KEY]) {
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
  const otherRows = [...byUser.values()].filter((r) => !r.isRep);
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
    others,
    unmatchedReps: roster.unmatched,
    partialHistory,
    parts: { ca101: ca, fs2: fs },
    notes: [
      `A submission is a CA 101 submitted (Army CA, ${ca.reportingGroup}) or an IAU App Submitted (Veteran G.I. Bill, ${fs.reportingGroup}): the first entry into each stage, once per contact, during the period. The two parts are different programs, so a contact can appear in both.`,
      "Rep credit uses the opportunity owner at the time of the event. The sales reps come from config/sales-reps.json, matched by GHL user id; everyone else is grouped as other users and still counts in the team total.",
      "This is the only submissions goal: 5 per rep per week, scaled by each rep's multiplier or override (Sam R. 3). The team goal is the sum of every rep's goal. The Army CA 101, Awaiting Supervisor Approval, and FS2 cards carry no goal of their own.",
      "Opportunity Value is the value on each opportunity at the time of its event, summed across both parts. It is not revenue, cash, or commission.",
      "Click a row to see the contacts behind it.",
      ...(partialHistory ? [ca.notes.find((t) => t.startsWith("Milestone tracking began")) ?? ""] : []),
    ].filter(Boolean),
  };
}

// The team leaderboard a rep sees: exactly the Rep Performance data the
// admin scorecard builds (computeRepPerformance with the same inputs), minus
// the per-rep drilldown specs, which are admin-only routes a rep could not
// open anyway. Full visibility of every rep's figures is the owner's
// decision (2026-10-26).

import { computeRepAppointments } from "@/lib/appointments";
import { computeCommission } from "@/lib/commission";
import { computeResponseTimes } from "@/lib/conversations";
import type { DateRange } from "@/lib/dates";
import { buildLeads, computeAssignedByUser } from "@/lib/leads";
import { defaultSemester, type Semester } from "@/lib/mapping-config";
import { computeRepCalls } from "@/lib/repCalls";
import { computeRepPerformance, type RepPerformance } from "@/lib/repPerformance";
import { computeSubmissions } from "@/lib/submissions";

export function computeTeamLeaderboard(range: DateRange, now: Date, semester: Semester = defaultSemester()): RepPerformance {
  const repCalls = computeRepCalls(range);
  const repAppts = computeRepAppointments(range);
  const submissions = computeSubmissions(range, semester);
  const commission = computeCommission(range, now);
  const responseTimes = computeResponseTimes(range);
  const leadsByUser = computeAssignedByUser(buildLeads(range));
  const perf = computeRepPerformance({ range, now, repCalls, repAppts, submissions, commission, responseTimes, leadsByUser, rangeQuery: "", rangeLabel: range.label });
  return { ...perf, reps: perf.reps.map((r) => ({ ...r, tabs: [] })), others: perf.others ? { ...perf.others, tabs: [] } : null };
}

// The team leaderboard a rep sees: exactly the Rep Performance data the
// admin scorecard builds (computeRepPerformance with the same inputs), minus
// the per-rep drilldown specs, which are admin-only routes a rep could not
// open anyway, and with the Won column as a count alone (a rep never sees
// Opportunity Value, 2026-11-24). Full visibility of every rep's figures is
// the owner's decision (2026-10-26).

import { computeRepAppointments } from "@/lib/appointments";
import { computeCommission } from "@/lib/commission";
import { computeResponseTimes } from "@/lib/conversations";
import type { DateRange } from "@/lib/dates";
import { buildLeads, computeAssignedByUser } from "@/lib/leads";
import { defaultSemester, type Semester } from "@/lib/mapping-config";
import { computeRepCalls } from "@/lib/repCalls";
import { computeRepPerformance, type RepPerformance, type RepScore } from "@/lib/repPerformance";
import { computeSubmissions } from "@/lib/submissions";

export function computeTeamLeaderboard(range: DateRange, now: Date, semester: Semester = defaultSemester()): RepPerformance {
  const repCalls = computeRepCalls(range);
  const repAppts = computeRepAppointments(range);
  const submissions = computeSubmissions(range, semester);
  const commission = computeCommission(range, now);
  const responseTimes = computeResponseTimes(range);
  const leadsByUser = computeAssignedByUser(buildLeads(range));
  const perf = computeRepPerformance({ range, now, repCalls, repAppts, submissions, commission, responseTimes, leadsByUser, rangeQuery: "", rangeLabel: range.label });
  return {
    ...perf,
    reps: perf.reps.map(repView),
    others: perf.others ? repView(perf.others) : null,
    notes: perf.notes.map((x) => x.replace("credited to the owner at the won event; Opportunity Value, never cash.", "credited to the owner at the won event.")),
  };
}

/** A rep sees the won COUNT only (owner request 2026-11-24: Opportunity Value never appears in rep views) and no drilldown tabs (admin-only routes). */
function repView(r: RepScore): RepScore {
  const won = r.metrics.won;
  const metrics = won ? { ...r.metrics, won: { ...won, text: (won.value ?? 0).toLocaleString("en-US"), title: "Opportunities that first became won during the range, credited to the owner at the won event." } } : r.metrics;
  return { ...r, metrics, tabs: [] };
}

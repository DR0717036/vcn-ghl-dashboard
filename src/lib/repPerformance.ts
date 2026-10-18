// Rep Performance (owner request 2026-10-18): one scorecard per configured
// sales rep, built from the SAME per-rep figures the other bands show, so
// every number on a card equals the rep's row in the band it came from:
//   dials, conversations, connected, talk time, first call  — Rep Call Activity
//   booked, show rate, calls per booking                      — Rep Appointments
//   CA 101, IAU App FS2, combined (+ weekly goal)              — Program Submissions
//   monthly quota pacing, est. commission                      — Program Submissions (month-to-date columns)
//   new leads assigned                                         — New Leads Assigned by User
//   median response time                                       — Response Time card
// Three figures are computed here from the same cache tables with the same
// rules as their bands: leads assigned in the range (assignment events, as
// on Leads Assigned), won in the range (first won event per opportunity
// credited to the rep, as in the Won row's period mode), and the close rate
// (of the contacts the rep submitted in the range, the share whose live
// opportunity is won now).

import fs from "node:fs";
import path from "node:path";
import type { ColumnKey, DrilldownSpec } from "@/app/Drilldown";
import type { CommissionReport } from "@/lib/commission";
import type { ResponseResult } from "@/lib/conversations";
import { buckets, fill } from "@/lib/charts";
import { getDb } from "@/lib/db";
import type { DateRange } from "@/lib/dates";
import { goalFor, repGoalStatus, type GoalStatus } from "@/lib/goals";
import type { AssignedResult } from "@/lib/leads";
import { trackedMilestones } from "@/lib/mapping-config";
import { coverage, fmtMinutes } from "@/lib/metrics";
import { firstEvents } from "@/lib/milestones";
import type { RepApptsResult } from "@/lib/appointments";
import type { RepCallsResult } from "@/lib/repCalls";
import { fmtDuration } from "@/lib/repCalls";
import { salesReps } from "@/lib/reps";
import { submissionEvents, type SubmissionsResult } from "@/lib/submissions";
import { wonOpps } from "@/lib/wonRow";

const n = (v: number) => v.toLocaleString("en-US");
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
const DASH = "—";

export type MetricKind = "count" | "pct" | "minutes" | "usd" | "ratio" | "clock";

export interface MetricDef {
  key: string;
  label: string;
  kind: MetricKind;
  lowerIsBetter?: boolean;
  /** Which band the figure comes from. */
  source: string;
}

export const METRIC_DEFS: MetricDef[] = [
  { key: "leadsAssigned", label: "Leads assigned", kind: "count", source: "Leads Assigned (assignment events in range)" },
  { key: "newLeadsAssigned", label: "New leads assigned", kind: "count", source: "New Leads Assigned by User" },
  { key: "dials", label: "Dials", kind: "count", source: "Rep Call Activity" },
  { key: "conversations", label: "Conversations / connected", kind: "count", source: "Rep Call Activity" },
  { key: "talkMinutes", label: "Talk time", kind: "minutes", source: "Rep Call Activity" },
  { key: "firstCall", label: "First call (avg)", kind: "clock", lowerIsBetter: true, source: "Rep Call Activity" },
  { key: "booked", label: "Appointments booked", kind: "count", source: "Rep Appointments (as host)" },
  { key: "showRate", label: "Show rate", kind: "pct", source: "Rep Appointments" },
  { key: "callsPerBooking", label: "Calls per booking", kind: "ratio", lowerIsBetter: true, source: "Rep Appointments" },
  { key: "ca101", label: "CA 101 submissions", kind: "count", source: "Program Submissions" },
  { key: "fs2", label: "IAU App FS2 submissions", kind: "count", source: "Program Submissions" },
  { key: "combined", label: "Combined submissions", kind: "count", source: "Program Submissions (vs weekly goal)" },
  { key: "quota", label: "Monthly quota pacing", kind: "pct", source: "Program Submissions (month to date)" },
  { key: "won", label: "Won", kind: "count", source: "Won Opportunities (became won in range, credited to the rep)" },
  { key: "closeRate", label: "Close rate", kind: "pct", source: "won ÷ submitted, cohort as of today" },
  { key: "medianResponse", label: "Median response time", kind: "minutes", lowerIsBetter: true, source: "Response Time" },
  { key: "commission", label: "Est. commission", kind: "usd", source: "Program Submissions (selected range)" },
];

export interface Metric {
  value: number | null;
  text: string;
  sub?: string;
  status?: GoalStatus | null;
  title?: string;
}

export interface RepScore {
  userId: string | null;
  name: string;
  initials: string;
  photoUrl: string | null;
  role: "Full-time" | "Part-time" | "Other";
  isRep: boolean;
  planLabel: string | null;
  metrics: Record<string, Metric>;
  spark: { labels: string[]; values: number[]; total: number };
  goals: { met: number; of: number; items: { label: string; status: GoalStatus }[] };
  tabs: { key: string; label: string; spec: DrilldownSpec }[];
}

export interface RepPerformance {
  reps: RepScore[];
  others: RepScore | null;
  defs: MetricDef[];
  defaultSort: string;
  rangeLabel: string;
  notes: string[];
}

const CALL_COLUMNS: ColumnKey[] = ["name", "direction", "callOutcome", "duration", "calledOn", "recording"];
const APPT_COLUMNS: ColumnKey[] = ["name", "program", "calendar", "apptStatus", "assignedUser", "createdBy", "bookedOn", "scheduledFor", "rescheduledAt", "callsBefore"];
const REP_COLUMNS: ColumnKey[] = ["name", "email", "phone", "source", "pipeline", "stageReached", "tags", "reachedOn"];
const WON_COLUMNS: ColumnKey[] = ["name", "pipeline", "stage", "value", "wonOn", "assignedUser", "program", "campaigns", "tags"];

function initialsOf(name: string): string {
  const parts = name.replace(/[.]/g, "").split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function photoFor(rel: string | undefined): string | null {
  if (!rel) return null;
  const clean = rel.replace(/^\/+/, "");
  return fs.existsSync(path.join(process.cwd(), "public", clean)) ? `/${clean}` : null;
}

/** Unique contacts assigned to each user during the range (assignment events), or null when the range predates tracking. */
function leadsAssignedBy(range: DateRange): Map<string, number> | null {
  const cov = coverage();
  if (!cov.firstCoreSyncAt || range.start.toISOString() < cov.firstCoreSyncAt) return null;
  const rows = getDb()
    .prepare(`SELECT to_user, COUNT(DISTINCT contact_id) AS c FROM assignment_events WHERE to_user IS NOT NULL AND observed_at >= ? AND observed_at < ? GROUP BY to_user`)
    .all(range.start.toISOString(), range.end.toISOString()) as unknown as { to_user: string; c: number }[];
  return new Map(rows.map((r) => [r.to_user, r.c]));
}

/** Per credited user: contacts submitted in the range (CA 101 or FS2 first events) and how many of them have a won live opportunity now. */
function closeRates(range: DateRange): Map<string, { submitted: number; won: number }> {
  const start = range.start.toISOString();
  const end = range.end.toISOString();
  const keys = ["army_ca101", "vet_iau_app_submitted"];
  const byUser = new Map<string, Set<string>>();
  for (const key of keys) {
    const m = trackedMilestones().find((x) => x.key === key);
    if (!m) continue;
    for (const e of firstEvents(key, m.reportingGroup, start, end)) {
      const u = e.assigned_to_at_event ?? "__none";
      const set = byUser.get(u) ?? new Set<string>();
      set.add(e.who);
      byUser.set(u, set);
    }
  }
  const wonContacts = new Set(
    (getDb().prepare(`SELECT DISTINCT contact_id FROM opportunities WHERE status = 'won' AND missing_since IS NULL AND contact_id IS NOT NULL`).all() as unknown as { contact_id: string }[]).map((r) => r.contact_id),
  );
  const out = new Map<string, { submitted: number; won: number }>();
  for (const [u, set] of byUser) out.set(u, { submitted: set.size, won: [...set].filter((c) => wonContacts.has(c)).length });
  return out;
}

export function computeRepPerformance(input: {
  range: DateRange;
  now: Date;
  repCalls: RepCallsResult;
  repAppts: RepApptsResult;
  submissions: SubmissionsResult;
  commission: CommissionReport;
  responseTimes: ResponseResult;
  leadsByUser: AssignedResult;
  rangeQuery: string;
  rangeLabel: string;
}): RepPerformance {
  const { range, repCalls, repAppts, submissions, commission, responseTimes, leadsByUser, rangeQuery, rangeLabel } = input;
  const assigned = leadsAssignedBy(range);
  const close = closeRates(range);
  const wonInRange = wonOpps("period", range);
  const completedGoal = goalFor("appointmentsCompleted", range);
  const b = buckets(range.start, range.end);
  const subEvents = submissionEvents(range.start, range.end);
  const cov = coverage();

  const build = (userId: string | null, name: string, isRep: boolean, rep?: (typeof salesReps)[number]): RepScore => {
    const key = userId ?? "others";
    const calls = userId ? repCalls.rows.find((r) => r.userId === userId) : repCalls.others;
    const appt = userId ? repAppts.rows.find((r) => r.userId === userId) : repAppts.others;
    const sub = userId ? submissions.rows.find((r) => r.userId === userId) : submissions.others;
    const mtd = userId ? commission.reps[userId] : undefined;
    const resp = userId ? responseTimes.rows.find((r) => r.userId === userId) : responseTimes.others;
    const leads = userId ? leadsByUser.rows.find((r) => r.userId === userId) : leadsByUser.rows.filter((r) => r.kind !== "rep").reduce((s, r) => s + r.count, 0);
    const newLeads = typeof leads === "number" ? leads : (leads?.count ?? 0);
    const won = wonInRange.filter((o) => (userId ? o.assignedTo === userId : !o.assignedTo || !salesReps.some((r) => r.userId === o.assignedTo)));
    const wonValue = won.reduce((s, o) => s + (o.value ?? 0), 0);
    const cr = userId ? close.get(userId) : [...close.entries()].filter(([u]) => u === "__none" || !salesReps.some((r) => r.userId === u)).reduce((acc, [, v]) => ({ submitted: acc.submitted + v.submitted, won: acc.won + v.won }), { submitted: 0, won: 0 });
    const connected = calls ? calls.outcomes.conversation + calls.outcomes.short : 0;
    const marked = appt ? appt.showed + appt.noshow : 0;
    const combinedGoal = userId && submissions.goal ? submissions.goal.perRep[userId] : undefined;
    const combinedStatus = userId && submissions.goal && sub ? repGoalStatus(sub.total, submissions.goal, userId) : null;
    const completedStatus = userId && completedGoal && appt ? repGoalStatus(appt.showed, completedGoal, userId) : null;
    const assignedCount = assigned ? (userId ? (assigned.get(userId) ?? 0) : [...assigned.entries()].filter(([u]) => !salesReps.some((r) => r.userId === u)).reduce((s, [, c]) => s + c, 0)) : null;

    const metrics: Record<string, Metric> = {
      leadsAssigned: assigned ? { value: assignedCount, text: n(assignedCount ?? 0), title: "Unique contacts assigned to this user during the range (assignment events seen by the sync)." } : { value: null, text: "unavailable", title: `Assignment tracking began ${cov.firstCoreSyncAt ? cov.firstCoreSyncAt.slice(0, 10) : "later"}; this range starts earlier.` },
      newLeadsAssigned: { value: newLeads, text: n(newLeads), title: "Contacts created in the range whose current owner is this user." },
      dials: { value: calls?.dials ?? 0, text: n(calls?.dials ?? 0), status: calls?.callStatus ?? null, title: calls?.callGoal ? `Own goal ${Math.round(calls.callGoal.full)} dials` : undefined },
      conversations: { value: calls?.conversations ?? 0, text: `${n(calls?.conversations ?? 0)} / ${n(connected)}`, sub: `${pct(calls?.conversations ?? 0, calls?.dials ?? 0)} conv · ${pct(connected, calls?.dials ?? 0)} connected`, title: `Conversations (completed, ≥ ${repCalls.conversationMinSeconds}s) / connected calls; rates are of dials.` },
      talkMinutes: { value: calls ? Math.round(calls.talkSeconds / 60) : 0, text: calls && calls.talkSeconds > 0 ? fmtMinutes(Math.round(calls.talkSeconds / 60)) : "0m", status: calls?.talkStatus ?? null, sub: calls && calls.avgSeconds !== null ? `avg ${fmtDuration(calls.avgSeconds)} / call` : undefined },
      firstCall: { value: calls?.firstCallAvg ? clockToSeconds(calls.firstCallAvg) : null, text: calls?.firstCallAvg ?? DASH, sub: calls && calls.firstCallDays > 0 ? `${n(calls.firstCallDays)} days with calls` : undefined },
      booked: { value: appt?.booked ?? 0, text: n(appt?.booked ?? 0), status: appt?.bookedStatus ?? null, sub: appt ? `showed ${n(appt.showed)} · no-show ${n(appt.noshow)}` : undefined, title: appt?.bookedGoal ? `Own goal ${Math.round(appt.bookedGoal.full)} bookings` : undefined },
      showRate: { value: appt && appt.showRate !== null ? appt.showRate : null, text: appt && appt.showRate !== null ? `${Math.round(appt.showRate * 100)}%` : DASH, status: completedStatus, sub: marked > 0 ? `${n(appt?.showed ?? 0)} of ${n(marked)} marked` : "none marked yet", title: completedGoal && userId && completedGoal.perRep[userId] ? `Showed goal ${Math.round(completedGoal.perRep[userId].full)}` : undefined },
      callsPerBooking: { value: appt && appt.callsPerBooking !== null ? appt.callsPerBooking : null, text: appt && appt.callsPerBooking !== null ? appt.callsPerBooking.toFixed(1) : DASH, title: `Host dials to the contact in the ${repAppts.windowDays} days before each booking ÷ bookings.` },
      ca101: { value: sub?.ca101 ?? 0, text: n(sub?.ca101 ?? 0) },
      fs2: { value: sub?.fs2 ?? 0, text: n(sub?.fs2 ?? 0) },
      combined: { value: sub?.total ?? 0, text: n(sub?.total ?? 0), status: combinedStatus, sub: combinedGoal ? `goal ${Math.round(combinedGoal.full)}${submissions.goal?.partial && Math.round(combinedGoal.scaled) !== Math.round(combinedGoal.full) ? ` · ${Math.round(combinedGoal.scaled)} by now` : ""}` : undefined },
      quota: mtd ? { value: mtd.monthlyQuota > 0 ? mtd.submissionsMtd / mtd.monthlyQuota : null, text: `${n(mtd.submissionsMtd)}/${n(mtd.monthlyQuota)}`, sub: `${Math.round(mtd.quotaPct * 100)}% · ${commission.monthLabel}`, status: mtd.quotaStatus === "good" ? "met" : mtd.quotaStatus === "warn" ? "on_track" : mtd.quotaStatus === "bad" ? "missed" : null, title: "Combined submissions this calendar month over the monthly quota." } : { value: null, text: DASH },
      won: { value: won.length, text: `${n(won.length)} · ${usd(wonValue)}`, title: "Opportunities that first became won during the range, credited to the owner at the won event; Opportunity Value, not cash." },
      closeRate: { value: cr && cr.submitted > 0 ? cr.won / cr.submitted : null, text: cr && cr.submitted > 0 ? pct(cr.won, cr.submitted) : DASH, sub: cr ? `${n(cr.won)} won of ${n(cr.submitted)} submitted` : undefined, title: "Of the contacts this rep submitted in the range (CA 101 or FS2), the share whose opportunity is won now." },
      medianResponse: { value: resp?.medianMinutes ?? null, text: resp && resp.medianMinutes !== null ? fmtMinutes(Math.round(resp.medianMinutes)) : DASH, sub: resp ? `${n(resp.replied)} of ${n(resp.episodes)} replied` : undefined, title: `Median business-time response to inbound messages (${responseTimes.windowLabel}).` },
      commission: mtd ? { value: mtd.commission.amount, text: mtd.commission.amount === null ? DASH : usd(mtd.commission.amount), sub: mtd.commission.label, title: `Plan ${mtd.planKey}; estimated from dashboard counts for the selected range.` } : { value: null, text: DASH },
    };

    const goalItems: { label: string; status: GoalStatus }[] = [];
    if (metrics.dials.status) goalItems.push({ label: "Dials", status: metrics.dials.status });
    if (metrics.talkMinutes.status) goalItems.push({ label: "Talk time", status: metrics.talkMinutes.status });
    if (metrics.booked.status) goalItems.push({ label: "Bookings", status: metrics.booked.status });
    if (metrics.showRate.status) goalItems.push({ label: "Showed", status: metrics.showRate.status });
    if (metrics.combined.status) goalItems.push({ label: "Submissions", status: metrics.combined.status });
    if (metrics.quota.status) goalItems.push({ label: "Quota pacing", status: metrics.quota.status });
    const met = goalItems.filter((g) => g.status !== "missed").length;

    const mine = subEvents.filter((e) => (userId ? e.userId === userId : e.userId === null || !salesReps.some((r) => r.userId === e.userId)));
    const points = fill(b, mine.map((e) => ({ t: e.time, c: 1 })));

    const notesCommon = [`Source — every figure equals this rep's row in the band it comes from (${rangeLabel}).`];
    const tabs: RepScore["tabs"] = [
      { key: "submissions", label: "Submissions", spec: { query: `kind=rep&user=${encodeURIComponent(key)}&${rangeQuery}`, title: `${name} · submissions`, subtitle: `CA 101 and IAU App (FS2) contacts credited to this user · ${rangeLabel}`, expected: sub?.total ?? 0, columns: REP_COLUMNS, notes: notesCommon, csvName: `${name} submissions ${rangeLabel}` } },
      { key: "calls", label: "Calls", spec: { query: `kind=calls&user=${encodeURIComponent(key)}&${rangeQuery}`, title: `${name} · calls`, subtitle: `Calls in the selected range · ${rangeLabel}`, columns: CALL_COLUMNS, perDayTable: { title: "Per day: dials, talk time, and first outbound call" }, heatmap: true, outcomeFilter: true, expectedConversations: calls?.conversations ?? 0, notes: notesCommon, csvName: `${name} calls ${rangeLabel}` } },
      { key: "appointments", label: "Appointments", spec: { query: `kind=apptRep&user=${encodeURIComponent(key)}&${rangeQuery}`, title: `${name} · appointments`, subtitle: `Appointments counted on this rep's row · ${rangeLabel}`, columns: APPT_COLUMNS, segments: [{ key: "booked", label: "Booked (as host)", expected: appt?.booked ?? 0 }, { key: "bookedBy", label: "Booked by them", expected: appt?.bookedBy ?? 0 }, { key: "showed", label: "Showed", expected: appt?.showed ?? 0 }, { key: "noshow", label: "No-show", expected: appt?.noshow ?? 0 }, { key: "cancelled", label: "Cancelled", expected: appt?.cancelled ?? 0 }], notes: notesCommon, csvName: `${name} appointments ${rangeLabel}` } },
      { key: "won", label: "Won", spec: { query: `kind=won&which=user&arg=${encodeURIComponent(key)}&mode=period&${rangeQuery}`, title: `${name} · won`, subtitle: `Became won during ${rangeLabel}, credited to this user`, expected: won.length, columns: WON_COLUMNS, notes: notesCommon, csvName: `${name} won ${rangeLabel}` } },
    ];

    return {
      userId,
      name,
      initials: initialsOf(name),
      photoUrl: photoFor(rep?.photo),
      role: !isRep ? "Other" : (rep?.kpiMultiplier ?? 1) >= 1 ? "Full-time" : "Part-time",
      isRep,
      planLabel: mtd?.planLabel ?? null,
      metrics,
      spark: { labels: points.map((p) => p.label), values: points.map((p) => p.count), total: mine.length },
      goals: { met, of: goalItems.length, items: goalItems },
      tabs,
    };
  };

  const reps = salesReps.map((r) => build(r.userId, r.name, true, r));
  const others = build(null, "Other users, not sales reps", false);
  return {
    reps,
    others,
    defs: METRIC_DEFS,
    defaultSort: "combined",
    rangeLabel,
    notes: [
      "Cards — one per sales rep in config/sales-reps.json, including reps with no activity; every figure equals the rep's row in the band it comes from for the selected range.",
      "Leads assigned — unique contacts assigned to the rep during the range (assignment events the sync observed; unavailable for ranges before tracking began). New leads assigned — contacts created in the range whose current owner is the rep.",
      "Dials, conversations, talk time, first call — Rep Call Activity. Bookings, show rate, calls per booking — Rep Appointments (as host).",
      "CA 101, IAU App FS2, combined — Program Submissions (first entry per contact, credited to the owner at the event); the combined goal is the rep's own weekly rate pro-rated to the range. Quota pacing and est. commission — the month-to-date and selected-range columns of the same table.",
      "Won — opportunities that first became won during the range, credited to the owner at the won event; Opportunity Value, never cash. Close rate — of the contacts the rep submitted in the range, the share whose opportunity is won now (as of the last sync).",
      "Median response time — the Response Time card's median for the rep.",
      "Goals met — KPIs with a per-rep goal (dials, talk time, bookings, showed, combined submissions, quota pacing) that are Met or On Track.",
      "Sparkline — the rep's combined submissions per day (per hour for a single day, per week beyond 92 days).",
      "Rank — position under the selected sort; the crown marks #1. Lower is better for first call, calls per booking, and median response time.",
    ],
  };
}

/** "9:14 AM" → seconds since midnight, for sorting. */
function clockToSeconds(s: string): number | null {
  const m = s.match(/^(\d{1,2}):(\d{2}) (AM|PM)$/);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3] === "PM") h += 12;
  return h * 3600 + Number(m[2]) * 60;
}

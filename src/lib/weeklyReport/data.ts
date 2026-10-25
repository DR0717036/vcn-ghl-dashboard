// Weekly sales report: the numbers. Every figure comes from the SAME functions
// the scorecard pages call (metrics, submissions, repCalls, appointments,
// leads, wonRow, commission, conversations, messaging, repPerformance), run
// for the report week, the previous week, the four trend weeks, and the
// current calendar month. Nothing is recomputed or estimated here; where the
// dashboard would say "unavailable", so does the email (value null + reason).
// The only figures assembled in this file that have no card of their own are
// the approval-queue aging buckets (from the same opportunity rows the
// Awaiting Supervisor Approval snapshot counts) and the working-day pacing
// arithmetic (quota, month-to-date count, and the business-day calendar in
// config/weekly-report.json). Reads the local cache only; never GHL.

import { computeRates, computeRepAppointments, computeStatusCards } from "@/lib/appointments";
import { computeCommission } from "@/lib/commission";
import { computeResponseTimes, computeStale } from "@/lib/conversations";
import { getDb, getState, latestSyncRuns } from "@/lib/db";
import { addDays, dayKeysBetween, fmtDateTime, fmtDay, fmtRange, fmtRangeShort, nyParts, parseNyDay, resolveRange, startOfDay, type DateRange } from "@/lib/dates";
import { buildLeads, computeAssignedByUser, computeOutcomes, computeStaleLeads } from "@/lib/leads";
import { semesters, trackedMilestones } from "@/lib/mapping-config";
import { analyzeMessaging, keywordCard, replyRateCard } from "@/lib/messaging";
import { coverage, fmtMinutes, kpiLeadsAssigned, kpiNewLeads, kpiTalkTime } from "@/lib/metrics";
import { computeMilestoneByKey } from "@/lib/milestones";
import { computeRepCalls } from "@/lib/repCalls";
import { computeRepPerformance } from "@/lib/repPerformance";
import { salesReps } from "@/lib/reps";
import { computeSubmissions } from "@/lib/submissions";
import { CORE_SYNC_KIND, HISTORY_START } from "@/lib/sync/core";
import { failedPhases, runningTooLong } from "@/lib/syncStatus";
import { computeHeadline, wonOpps } from "@/lib/wonRow";
import { dashboardBaseUrl, weekRange, weeklyReportConfig } from "./config";

export type Kind = "count" | "minutes" | "pct" | "usd";

/** One headline figure: this week, last week, goal, as the scorecard card reports them. */
export interface Headline {
  key: string;
  label: string;
  kind: Kind;
  value: number | null;
  unavailable?: string;
  prev: number | null;
  prevUnavailable?: string;
  goal: number | null;
  lowerIsBetter?: boolean;
  /** Smaller lines under the figure (e.g. CA 101 and each semester's IAU part); `short` is the label for tight spaces. */
  parts?: { label: string; short: string; value: number | null; prev: number | null }[];
  /** Opportunity Value behind the figure (value at the time of each event, distinct opportunities), as the card reports it. Never revenue. */
  oppValue?: { value: number | null; prev: number | null; missing: number };
  /** Where the figure comes from on the dashboard. */
  source: string;
}

export interface RepRow {
  userId: string;
  name: string;
  rank: number;
  /** As the Rep Performance cards show them: initials, a photo under public/ ("/reps/jane-doe.jpg") or null, and Full-time / Part-time from the rep's kpiMultiplier. */
  initials: string;
  photo: string | null;
  role: string;
  combined: number;
  combinedPrev: number | null;
  combinedGoal: number | null;
  attainment: number | null;
  ca101: number;
  iau: number;
  dials: number;
  dialsPrev: number | null;
  dialsGoal: number | null;
  talkMinutes: number;
  talkPrev: number | null;
  booked: number;
  bookedPrev: number | null;
  showed: number;
  noshow: number;
  showRate: number | null;
  showRatePrev: number | null;
  won: number;
  wonValue: number;
  wonPrev: number | null;
  newLeadsAssigned: number;
  leadsAssigned: number | null;
}

export interface RepPace {
  userId: string;
  name: string;
  initials: string;
  photo: string | null;
  role: string;
  mtd: number;
  quota: number;
  quotaPct: number | null;
  projected: number | null;
  neededPerDay: number | null;
  commissionMtd: number | null;
  commissionLabel: string;
  planLabel: string | null;
}

export interface FunnelStep {
  key: string;
  label: string;
  cur: number | null;
  prev: number | null;
  unavailable?: string;
}

export interface TrendWeek {
  label: string;
  /** "Sep 21": the Monday, no year, for chart axes and captions. */
  shortLabel: string;
  start: string;
  combined: number | null;
  dials: number;
  talkMinutes: number | null;
  booked: number | null;
  completed: number | null;
  showRate: number | null;
  newLeads: number | null;
  won: number;
  wonValue: number;
}

export interface Flag {
  level: "warn" | "bad" | "info";
  /** Two or three words naming the kind of flag ("Below goal", "Sync"). */
  label: string;
  text: string;
}

export interface WeeklyReportData {
  weekStart: string;
  rangeLabel: string;
  rangeText: string;
  prevRangeText: string;
  /** The same ranges without the year, for headings. */
  rangeShort: string;
  prevRangeShort: string;
  partial: boolean;
  generatedAt: string;
  dataAsOf: string | null;
  dashboardUrl: string | null;
  headlines: Headline[];
  reps: RepRow[];
  topPerformer: RepRow | null;
  biggestImprover: { rep: RepRow; delta: number } | null;
  pace: {
    monthLabel: string;
    monthShort: string;
    asOf: string;
    workingDaysTotal: number;
    workingDaysElapsed: number;
    workingDaysRemaining: number;
    /** Where the team would be if quota were spread evenly over the month's working days (quota × elapsed ÷ total); null without a quota. */
    expectedToday: number | null;
    team: { mtd: number; quota: number; projected: number | null; neededPerDay: number | null; othersMtd: number };
    reps: RepPace[];
    semesters: { key: string; label: string; short: string; submittedMtd: number | null; acceptedMtd: number | null; submittedToDate: number | null; acceptedToDate: number | null }[];
    toDateSince: string | null;
    commissionMtd: number;
  };
  funnel: {
    steps: FunnelStep[];
    cohort: { label: string; leads: number; appointment: number; submitted: number; won: number; historyUnavailable: number }[];
  };
  pipeline: {
    windowLabel: string;
    windowShort: string;
    stale: { count: number; staleAfterDays: number; estimated: number; byUser: { name: string; count: number; oldestDays: number }[] };
    untouched: { count: number; cohort: number; days: number };
    approval: { inStage: number; value: number; buckets: { label: string; count: number }[]; oldestDays: number | null; unknownAge: number };
    unassigned: { fourWeeks: number; thisWeek: number };
    deadEnd: { parked: number; lost: number; stillNewLead: number; cohort: number };
    staleConversations: { conversations: number; unread: number; oldestMinutes: number | null; afterMinutes: number };
  };
  trend: TrendWeek[];
  flags: Flag[];
  notes: string[];
}

const n = (v: number) => v.toLocaleString("en-US");
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function fmtValue(kind: Kind, v: number | null): string {
  if (v === null) return "unavailable";
  switch (kind) {
    case "minutes":
      return fmtMinutes(Math.round(v));
    case "pct":
      return `${Math.round(v * 100)}%`;
    case "usd":
      return usd(v);
    default:
      return Number.isInteger(v) ? n(v) : v.toLocaleString("en-US", { maximumFractionDigits: 1 });
  }
}

/** Everything the leaderboard needs for one week, built exactly as the scorecard builds it. */
function repBundle(range: DateRange, now: Date) {
  const repCalls = computeRepCalls(range);
  const repAppts = computeRepAppointments(range);
  // Every semester counts, as the monthly quota and commission do.
  const submissions = computeSubmissions(range, "all");
  const commission = computeCommission(range, now);
  const responseTimes = computeResponseTimes(range);
  const leads = buildLeads(range);
  const leadsByUser = computeAssignedByUser(leads);
  const perf = computeRepPerformance({ range, now, repCalls, repAppts, submissions, commission, responseTimes, leadsByUser, rangeQuery: "", rangeLabel: range.label });
  return { repCalls, repAppts, submissions, commission, leads, leadsByUser, perf };
}

function ratio(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

/** Working days (config calendar) in [start, end) as New York calendar days. */
function workingDayKeys(start: Date, end: Date, days: number[]): string[] {
  return dayKeysBetween(start, end).filter((k) => {
    const d = parseNyDay(k);
    return d ? days.includes(nyParts(d).wd) : false;
  });
}

export function buildWeeklyReport(weekStart: Date, now: Date): WeeklyReportData {
  const cfg = weeklyReportConfig();
  const week = weekRange(weekStart, now);
  const lastWeek = weekRange(addDays(weekStart, -7), now);
  const cov = coverage();
  const notes: string[] = [];

  // ---- 1. headline numbers --------------------------------------------------------------
  const subs = computeSubmissions(week, "all");
  const subsPrev = computeSubmissions(lastWeek, "all");
  const calls = computeRepCalls(week);
  const callsPrev = computeRepCalls(lastWeek);
  const talk = kpiTalkTime(week);
  const appts = computeStatusCards(week);
  const rates = computeRates(week);
  const ratesPrev = computeRates(lastWeek);
  const newLeads = kpiNewLeads(week);
  const assigned = kpiLeadsAssigned(week);
  const wonNow = computeHeadline(wonOpps("period", week), "period", week);
  const wonPrev = computeHeadline(wonOpps("period", lastWeek), "period", lastWeek);

  const headlines: Headline[] = [
    {
      key: "combined",
      label: "Combined submissions",
      kind: "count",
      value: subs.value,
      unavailable: subs.unavailableReason,
      prev: subs.prev,
      prevUnavailable: subs.prevUnavailableReason,
      goal: subs.goal?.full ?? null,
      parts: [
        { label: "CA 101 (Army)", short: "Army CA 101", value: subs.parts?.ca101.achieved ?? null, prev: subs.parts?.ca101.prev ?? null },
        ...(subs.parts?.iau ?? []).map((p) => ({ label: p.label, short: `Veteran IAU (${semesters().find((s) => s.submittedKey === p.key)?.short ?? p.reportingGroup})`, value: p.achieved, prev: p.prev })),
      ],
      oppValue: subs.value === null ? undefined : { value: subs.oppValue, prev: subs.prevOppValue, missing: subs.oppValueMissing },
      source: "Program Submissions (combined), every semester",
    },
    {
      key: "army",
      label: "Army CA 101 submissions",
      kind: "count",
      value: subs.value === null ? null : subs.ca101,
      unavailable: subs.unavailableReason,
      prev: subs.parts?.ca101.prev ?? null,
      prevUnavailable: subs.parts?.ca101.prevUnavailableReason,
      goal: null,
      oppValue: subs.parts ? { value: subs.parts.ca101.value, prev: subs.parts.ca101.prevValue, missing: subs.parts.ca101.valueMissing } : undefined,
      source: "Army CA 101 Submitted card (the CA 101 part of combined submissions)",
    },
    {
      key: "iau",
      label: "Veteran IAU submissions",
      kind: "count",
      value: subs.value === null ? null : subs.iau,
      unavailable: subs.unavailableReason,
      prev: !subs.parts || subs.parts.iau.some((p) => p.prev === null) ? null : subs.parts.iau.reduce((s, p) => s + (p.prev ?? 0), 0),
      prevUnavailable: subs.parts?.iau.find((p) => p.prevUnavailableReason)?.prevUnavailableReason,
      goal: null,
      parts: (subs.parts?.iau ?? []).map((p) => {
        const sem = semesters().find((s) => s.submittedKey === p.key);
        return { label: p.label, short: sem?.short ?? p.reportingGroup, value: p.achieved, prev: p.prev };
      }),
      oppValue: subs.parts
        ? { value: subs.parts.iau.reduce((s, p) => s + p.value, 0), prev: subs.parts.iau.some((p) => p.prevValue === null) ? null : subs.parts.iau.reduce((s, p) => s + (p.prevValue ?? 0), 0), missing: subs.parts.iau.reduce((s, p) => s + p.valueMissing, 0) }
        : undefined,
      source: "IAU App Submitted cards, every semester (the IAU part of combined submissions)",
    },
    { key: "dials", label: "Dials", kind: "count", value: calls.total.dials, prev: callsPrev.total.dials, goal: calls.callsGoal?.full ?? null, source: "Rep Call Activity (outbound human dials)" },
    { key: "talk", label: "Talk time", kind: "minutes", value: talk.value, unavailable: talk.unavailableReason, prev: talk.prev, prevUnavailable: talk.prevUnavailableReason, goal: talk.goal?.full ?? null, source: "Talk Time card" },
    { key: "booked", label: "Appointments booked", kind: "count", value: appts.booked.split.total, prev: appts.booked.prev, prevUnavailable: appts.booked.prevUnavailableReason, goal: appts.booked.goal?.full ?? null, source: "Appointments Booked card" },
    { key: "completed", label: "Appointments completed", kind: "count", value: appts.completed.split.total, prev: appts.completed.prev, prevUnavailable: appts.completed.prevUnavailableReason, goal: appts.completed.goal?.full ?? null, source: "Appointments Completed card (Showed)" },
    { key: "showRate", label: "Show rate", kind: "pct", value: ratio(rates.showRate.num, rates.showRate.den), prev: ratio(ratesPrev.showRate.num, ratesPrev.showRate.den), goal: null, source: "Appointment Rates (Showed ÷ Showed + No-show)" },
    { key: "newLeads", label: "Leads created", kind: "count", value: newLeads.value, unavailable: newLeads.unavailableReason, prev: newLeads.prev, prevUnavailable: newLeads.prevUnavailableReason, goal: newLeads.goal?.full ?? null, source: "New Leads Created card" },
    { key: "assigned", label: "Leads assigned", kind: "count", value: assigned.value, unavailable: assigned.unavailableReason, prev: assigned.prev, prevUnavailable: assigned.prevUnavailableReason, goal: assigned.goal?.full ?? null, source: "Leads Assigned card" },
    { key: "won", label: "Won opportunities", kind: "count", value: wonNow.total.count, prev: wonPrev.total.count, goal: null, source: "Won row, Became Won During Period (Army CA + Veteran G.I. Bill)" },
    { key: "wonValue", label: "Won Opportunity Value", kind: "usd", value: wonNow.total.value, prev: wonPrev.total.value, goal: null, source: "Won row (Opportunity Value, never cash or commission)" },
  ];
  if (subs.oppValueMissing > 0) notes.push(`${n(subs.oppValueMissing)} submitted opportunit${subs.oppValueMissing === 1 ? "y has" : "ies have"} no Opportunity Value in GHL and add nothing to the submissions value.`);
  if (wonNow.total.valueMissing > 0) notes.push(`${n(wonNow.total.valueMissing)} won opportunit${wonNow.total.valueMissing === 1 ? "y has" : "ies have"} no Opportunity Value in GHL and add nothing to the value total.`);

  // ---- 2. rep leaderboard ----------------------------------------------------------------
  const cur = repBundle(week, now);
  const prev = repBundle(lastWeek, now);
  const wonWeek = wonOpps("period", week);
  const num = (v: number | null | undefined) => (typeof v === "number" ? v : 0);
  const reps: RepRow[] = cur.perf.reps
    .filter((r) => r.userId)
    .map((r) => {
      const p = prev.perf.reps.find((x) => x.userId === r.userId);
      const m = r.metrics;
      const pm = p?.metrics;
      const callRow = cur.repCalls.rows.find((x) => x.userId === r.userId);
      const apptRow = cur.repAppts.rows.find((x) => x.userId === r.userId);
      const wonRows = wonWeek.filter((o) => o.assignedTo === r.userId);
      const combinedGoal = r.userId && cur.submissions.goal ? (cur.submissions.goal.perRep[r.userId]?.full ?? null) : null;
      const combined = num(m.combined.value);
      return {
        userId: r.userId as string,
        name: r.name,
        rank: 0,
        initials: r.initials,
        photo: r.photoUrl,
        role: r.role,
        combined,
        combinedPrev: pm ? num(pm.combined.value) : null,
        combinedGoal,
        attainment: combinedGoal && combinedGoal > 0 ? combined / combinedGoal : null,
        ca101: num(m.ca101.value),
        iau: num(m.iau.value),
        dials: num(m.dials.value),
        dialsPrev: pm ? num(pm.dials.value) : null,
        dialsGoal: callRow?.callGoal?.full ?? null,
        talkMinutes: num(m.talkMinutes.value),
        talkPrev: pm ? num(pm.talkMinutes.value) : null,
        booked: num(m.booked.value),
        bookedPrev: pm ? num(pm.booked.value) : null,
        showed: apptRow?.showed ?? 0,
        noshow: apptRow?.noshow ?? 0,
        showRate: m.showRate.value,
        showRatePrev: pm ? pm.showRate.value : null,
        won: num(m.won.value),
        wonValue: wonRows.reduce((s, o) => s + (o.value ?? 0), 0),
        wonPrev: pm ? num(pm.won.value) : null,
        newLeadsAssigned: num(m.newLeadsAssigned.value),
        leadsAssigned: m.leadsAssigned.value,
      };
    })
    .sort((a, b) => b.combined - a.combined || b.dials - a.dials || a.name.localeCompare(b.name));
  reps.forEach((r, i) => (r.rank = i + 1));
  const topPerformer = reps.length > 0 && (reps[0].combined > 0 || reps[0].dials > 0) ? reps[0] : null;
  const improvers = reps
    .filter((r) => r.combinedPrev !== null)
    .map((r) => ({ rep: r, delta: r.combined - (r.combinedPrev as number), dialDelta: r.dials - (r.dialsPrev ?? 0) }))
    .sort((a, b) => b.delta - a.delta || b.dialDelta - a.dialDelta);
  const biggestImprover = improvers.length > 0 && improvers[0].delta > 0 ? { rep: improvers[0].rep, delta: improvers[0].delta } : null;

  // ---- 3. month-to-date pace --------------------------------------------------------------
  const commission = cur.commission;
  const month = commission.month;
  const allWd = workingDayKeys(month.start, month.fullEnd, cfg.workingDays);
  const elapsedWd = workingDayKeys(month.start, addDays(startOfDay(now), 1), cfg.workingDays).filter((k) => allWd.includes(k));
  const remainingWd = allWd.length - elapsedWd.length;
  const project = (mtd: number) => (elapsedWd.length > 0 ? Math.round((mtd / elapsedWd.length) * allWd.length) : null);
  const needed = (mtd: number, quota: number) => (remainingWd > 0 ? Math.max(0, quota - mtd) / remainingWd : null);
  const paceReps: RepPace[] = salesReps.map((rep) => {
    const r = commission.reps[rep.userId];
    const mtd = r?.submissionsMtd ?? 0;
    const quota = r?.monthlyQuota ?? 0;
    const row = reps.find((x) => x.userId === rep.userId);
    return {
      userId: rep.userId,
      name: rep.name,
      initials: row?.initials ?? (rep.name.replace(/[.]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?"),
      photo: row?.photo ?? null,
      role: row?.role ?? ((rep.kpiMultiplier ?? 1) >= 1 ? "Full-time" : "Part-time"),
      mtd,
      quota,
      quotaPct: quota > 0 ? mtd / quota : null,
      projected: project(mtd),
      neededPerDay: quota > 0 ? needed(mtd, quota) : null,
      commissionMtd: r?.commissionMtd.amount ?? null,
      commissionLabel: r?.commissionMtd.label ?? "plan not found",
      planLabel: r?.planLabel ?? null,
    };
  });
  const teamMtd = paceReps.reduce((s, r) => s + r.mtd, 0);
  const teamQuota = paceReps.reduce((s, r) => s + r.quota, 0);
  const monthSubs = computeSubmissions(month, "all");
  // "To date" = every recorded milestone event: those seen since the first sync plus the ones dated by GHL's
  // stage-entry time for contacts already in the stage then (the dashboard's history start, not the sync date).
  const toDateStart = cov.firstCoreSyncAt ? new Date(Date.parse(HISTORY_START) + 12 * 3_600_000) : null; // the New York day of the history start
  const toDate = toDateStart ? resolveRange("custom", now, { from: fmtKey(toDateStart), to: fmtKey(now) }) : null;
  const semRows = semesters().map((s) => {
    const sm = computeMilestoneByKey(s.submittedKey, month);
    const am = computeMilestoneByKey(s.acceptedKey, month);
    const st = toDate ? computeMilestoneByKey(s.submittedKey, toDate) : undefined;
    const at = toDate ? computeMilestoneByKey(s.acceptedKey, toDate) : undefined;
    return { key: s.key, label: s.label, short: s.short, submittedMtd: sm?.achieved ?? null, acceptedMtd: am?.achieved ?? null, submittedToDate: st?.achieved ?? null, acceptedToDate: at?.achieved ?? null };
  });

  // ---- 4. funnel ---------------------------------------------------------------------------
  const acceptedSum = (r: DateRange): { v: number | null; why?: string } => {
    const parts = semesters().map((s) => computeMilestoneByKey(s.acceptedKey, r));
    const broken = parts.find((p) => !p || p.achieved === null);
    if (broken !== undefined || parts.length === 0) return { v: null, why: parts.find((p) => p?.unavailableReason)?.unavailableReason ?? "Milestone tracking has not started." };
    return { v: parts.reduce((s, p) => s + (p?.achieved ?? 0), 0) };
  };
  const apptsPrev = computeStatusCards(lastWeek);
  const newLeadsPrev = kpiNewLeads(lastWeek);
  const accNow = acceptedSum(week);
  const accPrev = acceptedSum(lastWeek);
  const steps: FunnelStep[] = [
    { key: "leads", label: "New leads created", cur: newLeads.value, prev: newLeadsPrev.value },
    { key: "appointments", label: "Appointments booked", cur: appts.booked.split.total, prev: apptsPrev.booked.split.total },
    { key: "submissions", label: "Submissions (CA 101 + IAU App, every semester)", cur: subs.value, prev: subsPrev.value, unavailable: subs.unavailableReason },
    { key: "accepted", label: "IAU App Accepted (Veteran, every semester)", cur: accNow.v, prev: accPrev.v, unavailable: accNow.why },
    { key: "won", label: "Won (Army CA + Veteran G.I. Bill)", cur: wonNow.total.count, prev: wonPrev.total.count },
  ];
  const cohortOf = (r: DateRange, label: string, leads: ReturnType<typeof buildLeads>) => {
    const o = computeOutcomes(leads);
    const row = (k: string) => o.rows.find((x) => x.key === k)?.count ?? 0;
    return { label, leads: o.cohort, appointment: row("appointment"), submitted: row("submitted"), won: row("won"), historyUnavailable: o.historyUnavailable };
  };
  const cohort = [cohortOf(week, "This week's new leads", cur.leads), cohortOf(lastWeek, "Last week's new leads", prev.leads)];

  // ---- 5. pipeline health ------------------------------------------------------------------
  const fourWeeksStart = addDays(weekStart, -21);
  const fourWeeks = resolveRange("custom", now, { from: fmtKey(fourWeeksStart), to: fmtKey(addDays(weekStart, 6)) });
  const leads4w = buildLeads(fourWeeks);
  const stale4w = computeStaleLeads(leads4w);
  const outcomes4w = computeOutcomes(leads4w);
  const touchedRow = outcomes4w.rows.find((r) => r.key === "touched")?.count ?? 0;
  const assigned4w = computeAssignedByUser(leads4w);
  const approvalKey = "army_supervisor_approval";
  const approval = computeMilestoneByKey(approvalKey, week);
  const approvalStage = trackedMilestones().find((m) => m.key === approvalKey);
  const ageRows = approvalStage
    ? (getDb()
        .prepare(`SELECT last_stage_change_at AS t FROM opportunities WHERE stage_id = ? AND missing_since IS NULL`)
        .all(approvalStage.stageId) as unknown as { t: string | null }[])
    : [];
  const buckets = [
    { label: "under 7 days", lo: 0, hi: 7 },
    { label: "7 to 14 days", lo: 7, hi: 14 },
    { label: "14 to 30 days", lo: 14, hi: 30 },
    { label: "over 30 days", lo: 30, hi: Infinity },
  ].map((b) => ({ label: b.label, count: 0 }));
  let oldestDays: number | null = null;
  let unknownAge = 0;
  for (const r of ageRows) {
    const t = r.t ? Date.parse(r.t) : NaN;
    if (Number.isNaN(t)) {
      unknownAge += 1;
      continue;
    }
    const days = Math.max(0, (now.getTime() - t) / 86_400_000);
    oldestDays = oldestDays === null ? days : Math.max(oldestDays, days);
    const i = days < 7 ? 0 : days < 14 ? 1 : days < 30 ? 2 : 3;
    buckets[i].count += 1;
  }
  const staleConv = computeStale(now);
  const pipeline: WeeklyReportData["pipeline"] = {
    windowLabel: `leads created ${fmtRange(fourWeeks.start, fourWeeks.end, false)}`,
    windowShort: fmtRangeShort(fourWeeks.start, fourWeeks.end),
    stale: { count: stale4w.count, staleAfterDays: stale4w.staleAfterDays, estimated: stale4w.estimated, byUser: stale4w.byUser.slice(0, 6).map((u) => ({ name: u.name, count: u.count, oldestDays: Math.round(u.oldestDays) })) },
    untouched: { count: outcomes4w.cohort - touchedRow, cohort: outcomes4w.cohort, days: outcomes4w.touchWindowDays },
    approval: { inStage: approval?.currentInStage ?? 0, value: approval?.currentValue ?? 0, buckets, oldestDays: oldestDays === null ? null : Math.round(oldestDays), unknownAge },
    unassigned: { fourWeeks: assigned4w.rows.find((r) => r.kind === "unassigned")?.count ?? 0, thisWeek: cur.leadsByUser.rows.find((r) => r.kind === "unassigned")?.count ?? 0 },
    deadEnd: { parked: outcomes4w.deadEnd, lost: outcomes4w.rows.find((r) => r.key === "lost")?.count ?? 0, stillNewLead: outcomes4w.rows.find((r) => r.key === "newLead")?.count ?? 0, cohort: outcomes4w.cohort },
    staleConversations: { conversations: staleConv.total.conversations, unread: staleConv.total.unread, oldestMinutes: staleConv.total.oldestMinutes, afterMinutes: staleConv.staleAfterMinutes },
  };

  // ---- 6. four-week trend ------------------------------------------------------------------
  const trend: TrendWeek[] = [3, 2, 1, 0].map((back) => {
    const ws = addDays(weekStart, -7 * back);
    const r = weekRange(ws, now);
    const s = computeSubmissions(r, "all");
    const c = computeRepCalls(r);
    const t = kpiTalkTime(r);
    const a = computeStatusCards(r);
    const rt = computeRates(r);
    const l = kpiNewLeads(r);
    const w = computeHeadline(wonOpps("period", r), "period", r);
    return { label: `Week of ${fmtDay(ws)}`, shortLabel: fmtRangeShort(ws, addDays(ws, 1)), start: fmtKey(ws), combined: s.value, dials: c.total.dials, talkMinutes: t.value, booked: a.booked.split.total, completed: a.completed.split.total, showRate: ratio(rt.showRate.num, rt.showRate.den), newLeads: l.value, won: w.total.count, wonValue: w.total.value };
  });

  // ---- 7. flags ----------------------------------------------------------------------------
  const flags: Flag[] = [];
  const under = reps.filter((r) => r.combinedGoal && r.combinedGoal > 0 && r.combined < r.combinedGoal * cfg.flags.underGoalShare);
  if (under.length > 0) {
    flags.push({ level: "bad", label: "Below goal", text: `Under ${Math.round(cfg.flags.underGoalShare * 100)}% of the weekly submissions goal: ${under.map((r) => `${r.name} (${n(r.combined)} of ${Math.round(r.combinedGoal as number)})`).join(", ")}.` });
  }
  const teamShow = headlines.find((h) => h.key === "showRate")!;
  if (teamShow.value !== null && teamShow.prev !== null && (teamShow.prev - teamShow.value) * 100 >= cfg.flags.showRateDropPoints) {
    flags.push({ level: "warn", label: "Show rate", text: `Team show rate fell from ${fmtValue("pct", teamShow.prev)} to ${fmtValue("pct", teamShow.value)} week over week (${rates.showRate.num} showed of ${rates.showRate.den} marked).` });
  }
  const minMarked = cur.repAppts.minMarked;
  const repDrops = reps.filter((r) => r.showRate !== null && r.showRatePrev !== null && r.showed + r.noshow >= minMarked && (r.showRatePrev - r.showRate) * 100 >= cfg.flags.showRateDropPoints);
  if (repDrops.length > 0) flags.push({ level: "warn", label: "Show rate", text: `Show rate dropped ${cfg.flags.showRateDropPoints}+ points for ${repDrops.map((r) => `${r.name} (${fmtValue("pct", r.showRatePrev)} to ${fmtValue("pct", r.showRate)})`).join(", ")}.` });
  const messaging = analyzeMessaging(week);
  const optOuts = keywordCard(messaging, "optout");
  const email = replyRateCard(messaging, "email");
  if (optOuts.contacts > 0) {
    const high = optOuts.rows.filter((t) => t.optOutRate !== null && t.optOutRate >= messaging.cfg.optOutRateLevels.high);
    flags.push({ level: high.length > 0 ? "bad" : "info", label: "Opt-outs", text: `${n(optOuts.contacts)} contact${optOuts.contacts === 1 ? "" : "s"} opted out this week (STOP or similar)${high.length > 0 ? `; ${high.length} template${high.length === 1 ? " is" : "s are"} at a High opt-out rate` : ""}.` });
  }
  if (email.engagement && email.engagement.bounced > 0) {
    const e = email.engagement;
    flags.push({ level: e.hard > 0 ? "bad" : "warn", label: "Bounces", text: `${n(e.bounced)} of ${n(e.sends)} emails sent this week bounced (${n(e.hard)} hard, ${n(e.soft)} soft, ${n(e.unknownBounce)} unknown).` });
  }
  const notMarked = rates.lines.find((l) => l.key === "notMarked");
  if (notMarked && notMarked.total.num > 0) flags.push({ level: "warn", label: "Unmarked appointments", text: `${n(notMarked.total.num)} appointment${notMarked.total.num === 1 ? "" : "s"} scheduled this week ${notMarked.total.num === 1 ? "has" : "have"} passed without Showed or No-show being marked; the show rate leaves them out.` });
  const runs = latestSyncRuns(CORE_SYNC_KIND, 400).filter((r) => r.started_at >= week.start.toISOString() && r.started_at < week.end.toISOString());
  const failed = runs.filter((r) => r.ok === 0);
  const latest = latestSyncRuns(CORE_SYNC_KIND, 1)[0];
  if (failed.length > 0) {
    const phases = new Set<string>();
    for (const r of failed) for (const p of failedPhases(r.summary)) phases.add(p);
    flags.push({ level: failed.length > runs.length / 2 ? "bad" : "warn", label: "Sync", text: `${n(failed.length)} of ${n(runs.length)} automatic syncs this week did not finish fully${phases.size ? ` (phases: ${[...phases].join(", ")})` : ""}. Numbers come from the data that did load; see the Mapping page.` });
  }
  if (latest && runningTooLong(latest.started_at, latest.ok)) flags.push({ level: "bad", label: "Sync", text: "A sync has been running for over 30 minutes; the server may be wedged. See the Mapping page." });
  if (cov.lastCoreSyncOkAt && now.getTime() - Date.parse(cov.lastCoreSyncOkAt) > 2 * 3_600_000) flags.push({ level: "bad", label: "Sync", text: `The last successful sync was ${fmtDateTime(cov.lastCoreSyncOkAt)}; the figures may be behind GHL.` });
  if (!cov.lastCoreSyncOkAt) flags.push({ level: "bad", label: "Sync", text: "No sync has completed yet; every figure below is unavailable." });
  for (const h of headlines) if (h.unavailable) flags.push({ level: "info", label: "Unavailable", text: `${h.label}: unavailable. ${h.unavailable}` });
  if (subs.unmatchedReps.length > 0) flags.push({ level: "warn", label: "Rep mapping", text: `Configured reps not found among GHL users: ${subs.unmatchedReps.map((r) => r.name).join(", ")}.` });

  // ---- notes shown in the footer ----------------------------------------------------------
  notes.push(
    "Submissions count CA 101 submitted plus IAU App Submitted for every configured semester (the quota rule), once per contact, credited to the opportunity owner at the event.",
    "Dials are outbound human call attempts; talk time is the recorded duration of connected calls; show rate is Showed ÷ (Showed + No-show) for appointments scheduled in the week.",
    "Won means opportunity status = won, once per opportunity id, in the Army CA and Veteran G.I. Bill pipelines; dollar figures are Opportunity Value, never cash or commission.",
    "Commission figures are estimates from dashboard counts; the official calculation is done outside this dashboard.",
    ...(subs.partialHistory ? [`Milestone tracking began ${cov.firstCoreSyncAt ? fmtDay(new Date(cov.firstCoreSyncAt)) : "recently"}; comparisons that reach back before that are partial.`] : []),
  );

  return {
    weekStart: fmtKey(weekStart),
    rangeLabel: week.label,
    rangeText: fmtRange(week.start, week.end, week.partial),
    prevRangeText: fmtRange(week.prevStart, week.prevEnd, week.partial),
    rangeShort: fmtRangeShort(week.start, week.end),
    prevRangeShort: fmtRangeShort(week.prevStart, week.prevEnd),
    partial: week.partial,
    generatedAt: now.toISOString(),
    dataAsOf: cov.lastCoreSyncOkAt ?? null,
    dashboardUrl: dashboardBaseUrl(),
    headlines,
    reps,
    topPerformer,
    biggestImprover,
    pace: {
      monthLabel: commission.monthLabel,
      monthShort: fmtRangeShort(month.start, month.end),
      asOf: now.toISOString(),
      workingDaysTotal: allWd.length,
      workingDaysElapsed: elapsedWd.length,
      workingDaysRemaining: remainingWd,
      expectedToday: teamQuota > 0 && allWd.length > 0 ? (teamQuota * elapsedWd.length) / allWd.length : null,
      team: { mtd: teamMtd, quota: teamQuota, projected: project(teamMtd), neededPerDay: teamQuota > 0 ? needed(teamMtd, teamQuota) : null, othersMtd: monthSubs.others?.total ?? 0 },
      reps: [...paceReps].sort((a, b) => (b.quotaPct ?? -1) - (a.quotaPct ?? -1) || b.mtd - a.mtd),
      semesters: semRows,
      toDateSince: toDateStart ? fmtDay(toDateStart) : null,
      commissionMtd: commission.totalCommissionMtd,
    },
    funnel: { steps, cohort },
    pipeline,
    trend,
    flags,
    notes,
  };
}

function fmtKey(d: Date): string {
  const p = nyParts(d);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

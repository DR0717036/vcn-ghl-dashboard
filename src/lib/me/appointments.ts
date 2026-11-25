// "My appointments" (owner requests 2026-10-26 and 2026-11-24, round 5): the
// admin Appointments band filtered to one rep, for the date range in the
// control bar, plus two fixed-window lists.
//   Lists (fixed windows): upcoming appointments the rep hosts from now to the
//     end of this week; past appointments from the last 30 days the rep hosted
//     whose calendar status is still Confirmed (or New), oldest first.
//   Rate cards (selected range): bookings as host with the rep's own goal and
//     calls per booking; booking rate (bookings ÷ the rep's outbound dials);
//     show rate (Showed ÷ Showed + No-show, scheduled in range) with the
//     completed goal — each with the prior-period change.
//   Outcomes: the rep's appointments scheduled in the range by what happened
//     (Showed / No-show / Cancelled / Unmarked / Upcoming) and how many were
//     rescheduled.
//   NGT, post-appointment losses, and the appointment → outcome cohort: the
//     admin rules (src/lib/appointmentOutcomes.ts) restricted to the rep's
//     contacts: cohort = contacts with an appointment the rep hosted in the
//     range; lost after showing = of those who showed with the rep, an
//     opportunity lost at or after that appointment; NGT = entries into the
//     NGT stage in the range on opportunities assigned to the rep.
//   Army vs Veteran and Booked vs Showed for the same appointments.
// Host = the appointment's assigned user. Every list links to the contact in
// GHL; marking Showed / No-show happens in GHL, never here. A rep never sees
// Opportunity Value. Reads the local cache only.

import { appointmentsConfig, apptDrillRows, bookedIn, calendarNames, callsBeforeBooking, cancelledIn, dialsByContact, emptySplit, scheduledIn, splitOf, STATUS_LABEL, TAG_CLASS_LABEL, type Appt, type Split } from "@/lib/appointments";
import { buildNgt, computeOutcome, memberRows, ngtRows, stageNames, type CohortMember, type NgtMember } from "@/lib/appointmentOutcomes";
import { buckets, fill, type Grouping, type TimePoint } from "@/lib/charts";
import { addDays, fmtDay, startOfWeek, type DateRange } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { contactUrl } from "@/lib/drilldown";
import { goalFor, type Goal } from "@/lib/goals";
import { coverage } from "@/lib/metrics";
import { computeRepCalls } from "@/lib/repCalls";
import type { Rep } from "@/lib/reps";
import { repRow, type RepDrillResult } from "./repSafe";
import { prevRangeOf, repGoalOf } from "./shared";

export interface ApptRow {
  id: string;
  contactId: string | null;
  name: string;
  ghlUrl: string | null;
  program: string;
  calendar: string;
  status: string;
  startTime: string;
  /** Past rows: how long since the start time, in days (fractional). */
  overdueDays: number;
  rescheduled: boolean;
}

/** A figure with its prior-period value (null when the comparison period predates the history). */
export interface Fig {
  value: number | null;
  prev: number | null;
  prevReason?: string;
}

export interface RepApptSection {
  rangeLabel: string;
  upcoming: ApptRow[];
  toMark: ApptRow[];
  weekLabel: string;
  lookbackDays: number;
  booked: { count: number; split: Split; prev: number | null; prevReason?: string; goal: Goal | null; callsBefore: number; callsPerBooking: number | null; prevCallsPerBooking: number | null; windowDays: number };
  bookingRate: Fig & { bookings: number; dials: number };
  showRate: Fig & { showed: number; noshow: number; goal: Goal | null };
  outcomes: { showed: number; noshow: number; cancelled: number; unmarked: number; upcoming: number; rescheduled: number; total: number; byProgram: Record<"showed" | "noshow" | "cancelled" | "unmarked" | "upcoming" | "rescheduled", Split> };
  cohort: { total: Split; withHistory: Split; showed: Split; converted: Split; won: Split; lost: Split; conversionRate: number | null; asOf: string; historyStart: string | undefined };
  losses: { showedContacts: Split; lostAfterShowed: Split; byStage: { stage: string; pipeline: string; count: number }[] };
  ngt: { entered: Split; fs2: Split; won: Split; lost: Split; open: Split; stageName: string };
  /** Army vs Veteran counts for the paired chart. */
  compare: { label: string; army: number; veteran: number; aDetail: string; bDetail: string; muted?: boolean }[];
  series: { grouping: Grouping; booked: TimePoint[]; showed: TimePoint[]; bookedTotal: number; showedTotal: number };
  notes: string[];
}

const LOOKBACK_DAYS = 30;
/** Calendar statuses that mean "the outcome was never recorded". */
const UNMARKED = new Set(["confirmed", "new"]);
const CLOSED = new Set(["showed", "noshow", "cancelled", "invalid"]);
const iso = (d: Date) => d.toISOString();
const n = (v: number) => v.toLocaleString("en-US");

function contactNames(ids: (string | null)[]): Map<string, string | null> {
  const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const out = new Map<string, string | null>();
  for (let i = 0; i < list.length; i += 500) {
    const chunk = list.slice(i, i + 500);
    for (const c of getDb().prepare(`SELECT id, name FROM contacts WHERE id IN (${chunk.map(() => "?").join(",")})`).all(...chunk) as unknown as { id: string; name: string | null }[]) out.set(c.id, c.name);
  }
  return out;
}

function splitWhere<T extends { cls: Split extends infer _ ? "army" | "veteran" | "both" | "untagged" : never }>(items: T[], f: (x: T) => boolean): Split {
  const s = emptySplit();
  for (const it of items) {
    if (!f(it)) continue;
    s[it.cls] += 1;
    s.total += 1;
  }
  return s;
}

/** The rep's share of the appointment → outcome cohort and of the NGT entries for the range. */
function repCohort(rep: Rep, range: DateRange) {
  const outcome = computeOutcome(range);
  const hosted = (m: CohortMember) => m.appointments.some((a) => a.hostId === rep.userId);
  const members = outcome.members.filter(hosted);
  const showedWithRep = (m: CohortMember) => m.appointments.find((a) => a.hostId === rep.userId && a.status === "showed");
  const showedMembers = members.filter((m) => showedWithRep(m) !== undefined);
  const lostMembers = showedMembers.filter((m) => m.lost !== null && m.lost.at >= (showedWithRep(m)?.startTime ?? ""));
  // NGT entries in the range on opportunities assigned to the rep.
  const ngtAll = buildNgt(range);
  const oppIds = ngtAll.map((m) => m.opportunityId);
  const assigned = new Map<string, string | null>();
  for (let i = 0; i < oppIds.length; i += 500) {
    const chunk = oppIds.slice(i, i + 500);
    for (const o of getDb().prepare(`SELECT id, assigned_to FROM opportunities WHERE id IN (${chunk.map(() => "?").join(",")})`).all(...chunk) as unknown as { id: string; assigned_to: string | null }[]) assigned.set(o.id, o.assigned_to);
  }
  const ngtMembers: NgtMember[] = ngtAll.filter((m) => assigned.get(m.opportunityId) === rep.userId);
  return { outcome, members, showedMembers, lostMembers, ngtMembers };
}

export function computeRepAppointmentSection(rep: Rep, range: DateRange, now: Date): RepApptSection {
  const cfg = appointmentsConfig();
  const mine = (list: Appt[]) => list.filter((a) => a.hostId === rep.userId);
  const start = iso(range.start);
  const end = iso(range.end);
  const nowIso = iso(range.asOf);
  const prev = prevRangeOf(range);
  const historyStart = coverage().historyStart;
  const prevReason = iso(range.prevStart) < historyStart ? `Appointment history starts ${fmtDay(new Date(historyStart))}, after the comparison period began.` : undefined;

  // ---- the two fixed-window lists ----
  const weekEnd = addDays(startOfWeek(now), 7);
  const calendars = calendarNames();
  const upcomingAppts = mine(scheduledIn(iso(now), iso(weekEnd))).filter((a) => a.status !== "cancelled" && a.status !== "invalid");
  const pastAppts = mine(scheduledIn(iso(addDays(now, -LOOKBACK_DAYS)), iso(now))).filter((a) => UNMARKED.has(a.status));
  const names = contactNames([...upcomingAppts, ...pastAppts].map((a) => a.contactId));
  const row = (a: Appt): ApptRow => ({
    id: a.id,
    contactId: a.contactId,
    name: (a.contactId ? names.get(a.contactId) : null) ?? "(no name)",
    ghlUrl: a.contactId ? contactUrl(a.contactId) : null,
    program: TAG_CLASS_LABEL[a.cls],
    calendar: a.calendarId ? (calendars.get(a.calendarId) ?? a.calendarId) : "—",
    status: STATUS_LABEL[a.status] + (a.status === "other" && a.rawStatus ? ` (${a.rawStatus})` : ""),
    startTime: a.startTime ?? "",
    overdueDays: a.startTime ? Math.max(0, (now.getTime() - Date.parse(a.startTime)) / 86_400_000) : 0,
    rescheduled: Boolean(a.rescheduledAt),
  });

  // ---- booked, calls per booking, booking rate ----
  const booked = mine(bookedIn(start, end));
  const prevBooked = prevReason ? null : mine(bookedIn(iso(prev.start), iso(prev.end)));
  const window = cfg.callsBeforeBookingDays * 86_400_000;
  const isRep = (u: string | null) => u === rep.userId;
  const callsOf = (list: Appt[], from: Date, to: string) => {
    const dials = dialsByContact(new Date(from.getTime() - window).toISOString(), to);
    return list.reduce((s, a) => s + callsBeforeBooking(dials, a, cfg.callsBeforeBookingDays, isRep), 0);
  };
  const callsBefore = callsOf(booked, range.start, end);
  const prevCalls = prevBooked ? callsOf(prevBooked, prev.start, iso(prev.end)) : null;
  const dialsNow = computeRepCalls(range).rows.find((r) => r.userId === rep.userId)?.dials ?? 0;
  const dialsPrev = prevReason ? null : (computeRepCalls(prev).rows.find((r) => r.userId === rep.userId)?.dials ?? 0);

  // ---- scheduled in range: show rate and outcomes ----
  const scheduled = mine(scheduledIn(start, end));
  const prevScheduled = prevReason ? null : mine(scheduledIn(iso(prev.start), iso(prev.end)));
  const count = (list: Appt[], f: (a: Appt) => boolean) => list.filter(f).length;
  const showed = count(scheduled, (a) => a.status === "showed");
  const noshow = count(scheduled, (a) => a.status === "noshow");
  const cancelledSched = count(scheduled, (a) => a.status === "cancelled");
  const unmarked = count(scheduled, (a) => !CLOSED.has(a.status) && (a.startTime ?? "") < nowIso);
  const upcoming = count(scheduled, (a) => !CLOSED.has(a.status) && (a.startTime ?? "") >= nowIso);
  const invalid = count(scheduled, (a) => a.status === "invalid");
  const rate = (s: number, ns: number) => (s + ns > 0 ? s / (s + ns) : null);
  const prevShow = prevScheduled ? rate(count(prevScheduled, (a) => a.status === "showed"), count(prevScheduled, (a) => a.status === "noshow")) : null;
  const cancelled = mine(cancelledIn(start, end));

  // ---- cohort, losses, NGT ----
  const { outcome, members, showedMembers, lostMembers, ngtMembers } = repCohort(rep, range);
  const hist = (m: CohortMember) => m.historyAvailable;
  const cohortTotal = splitWhere(members, () => true);
  const withHistory = splitWhere(members, hist);
  const converted = splitWhere(members, (m) => hist(m) && m.converted !== null);
  const won = splitWhere(members, (m) => m.won !== null);
  const lost = splitWhere(members, (m) => m.lost !== null);
  const { stages, pipelines } = stageNames();
  const byStage = new Map<string, { stage: string; pipeline: string; count: number }>();
  for (const m of lostMembers) {
    const o = (m.lost as NonNullable<CohortMember["lost"]>).opp;
    const key = `${o.pipelineId}:${o.stageId}`;
    const cur = byStage.get(key) ?? { stage: stages.get(o.stageId) ?? o.stageId, pipeline: pipelines.get(o.pipelineId) ?? o.pipelineId, count: 0 };
    cur.count += 1;
    byStage.set(key, cur);
  }
  const ngtSplit = (f: (m: NgtMember) => boolean) => splitWhere(ngtMembers, f);

  // ---- charts ----
  const b = buckets(range.start, range.end);
  const showedAppts = scheduled.filter((a) => a.status === "showed" && a.startTime);
  const bookedSplit = splitOf(booked);
  const showedSplit = splitOf(showedAppts);
  const noshowSplit = splitOf(scheduled.filter((a) => a.status === "noshow"));
  const cancelledSplit = splitOf(cancelled);
  const detail = (s: Split, k: "army" | "veteran") => `${n(s[k])} ${k === "army" ? "Army" : "Veteran"}`;
  const pctOf = (num: number, den: number) => (den > 0 ? `${Math.round((num / den) * 100)}%` : "—");

  return {
    rangeLabel: range.label,
    upcoming: upcomingAppts.map(row).sort((a, z) => (a.startTime < z.startTime ? -1 : 1)),
    toMark: pastAppts.map(row).sort((a, z) => (a.startTime < z.startTime ? -1 : 1)),
    weekLabel: "through Sunday",
    lookbackDays: LOOKBACK_DAYS,
    booked: {
      count: booked.length,
      split: bookedSplit,
      prev: prevBooked ? prevBooked.length : null,
      prevReason,
      goal: repGoalOf(goalFor("appointmentsBooked", range), rep),
      callsBefore,
      callsPerBooking: booked.length > 0 ? callsBefore / booked.length : null,
      prevCallsPerBooking: prevBooked && prevBooked.length > 0 && prevCalls !== null ? prevCalls / prevBooked.length : null,
      windowDays: cfg.callsBeforeBookingDays,
    },
    bookingRate: { value: dialsNow > 0 ? booked.length / dialsNow : null, prev: prevBooked && dialsPrev ? prevBooked.length / dialsPrev : null, prevReason, bookings: booked.length, dials: dialsNow },
    showRate: { value: rate(showed, noshow), prev: prevShow, prevReason, showed, noshow, goal: repGoalOf(goalFor("appointmentsCompleted", range), rep) },
    outcomes: {
      showed,
      noshow,
      cancelled: cancelledSched,
      unmarked,
      upcoming,
      rescheduled: count(scheduled, (a) => Boolean(a.rescheduledAt)),
      total: scheduled.length - invalid,
      byProgram: {
        showed: showedSplit,
        noshow: noshowSplit,
        cancelled: splitOf(scheduled.filter((a) => a.status === "cancelled")),
        unmarked: splitOf(scheduled.filter((a) => !CLOSED.has(a.status) && (a.startTime ?? "") < nowIso)),
        upcoming: splitOf(scheduled.filter((a) => !CLOSED.has(a.status) && (a.startTime ?? "") >= nowIso)),
        rescheduled: splitOf(scheduled.filter((a) => Boolean(a.rescheduledAt))),
      },
    },
    cohort: { total: cohortTotal, withHistory, showed: splitWhere(showedMembers, () => true), converted, won, lost, conversionRate: withHistory.total > 0 ? converted.total / withHistory.total : null, asOf: outcome.asOf, historyStart: outcome.historyStart },
    losses: { showedContacts: splitWhere(showedMembers, () => true), lostAfterShowed: splitWhere(lostMembers, () => true), byStage: [...byStage.values()].sort((a, z) => z.count - a.count) },
    ngt: { entered: ngtSplit(() => true), fs2: ngtSplit((m) => m.fs2 !== null), won: ngtSplit((m) => m.won !== null), lost: ngtSplit((m) => m.lost !== null), open: ngtSplit((m) => m.fs2 === null && m.won === null && m.lost === null), stageName: cfg.ngtStage.stageName },
    compare: [
      { label: "Booked (as host)", army: bookedSplit.army, veteran: bookedSplit.veteran, aDetail: detail(bookedSplit, "army"), bDetail: detail(bookedSplit, "veteran") },
      { label: "Showed", army: showedSplit.army, veteran: showedSplit.veteran, aDetail: `${pctOf(showedSplit.army, showedSplit.army + noshowSplit.army)} show rate`, bDetail: `${pctOf(showedSplit.veteran, showedSplit.veteran + noshowSplit.veteran)} show rate` },
      { label: "No-show", army: noshowSplit.army, veteran: noshowSplit.veteran, aDetail: detail(noshowSplit, "army"), bDetail: detail(noshowSplit, "veteran") },
      { label: "Cancelled", army: cancelledSplit.army, veteran: cancelledSplit.veteran, aDetail: detail(cancelledSplit, "army"), bDetail: detail(cancelledSplit, "veteran"), muted: true },
      { label: "Converted after appt", army: converted.army, veteran: converted.veteran, aDetail: `${pctOf(converted.army, withHistory.army)} of ${n(withHistory.army)} with history`, bDetail: `${pctOf(converted.veteran, withHistory.veteran)} of ${n(withHistory.veteran)} with history` },
      { label: "Won after appt", army: won.army, veteran: won.veteran, aDetail: `${pctOf(won.army, cohortTotal.army)} of cohort`, bDetail: `${pctOf(won.veteran, cohortTotal.veteran)} of cohort` },
    ],
    series: {
      grouping: b.grouping,
      booked: fill(b, booked.filter((a) => a.bookedAt).map((a) => ({ t: a.bookedAt as string, c: 1 }))),
      showed: fill(b, showedAppts.map((a) => ({ t: a.startTime as string, c: 1 }))),
      bookedTotal: booked.length,
      showedTotal: showedAppts.length,
    },
    notes: [
      "Every figure here is your row of the admin Appointments section: the same appointment rows, the same rules, the same previous period, for the date range in the bar at the top; the two lists have fixed windows instead.",
      "Host — the appointment's assigned user; an appointment counts as yours when you host it.",
      "Upcoming — appointments you host that start between now and the end of this week (Sunday night, New York), not cancelled.",
      `Mark the outcome — appointments you hosted in the last ${LOOKBACK_DAYS} days whose start time has passed but whose calendar status is still Confirmed (or New): record Showed or No-show in GHL so your show rate and the team's are right. Showed is the only status that counts as completed. Links open the contact in GHL; nothing here changes GHL.`,
      "Appointments Booked — bookings created in the range with you as host (the Appointments Booked card's rule), against your own booking goal; deleted appointments never count.",
      `Calls per booking — your outbound dials to the booked contact in the ${cfg.callsBeforeBookingDays} days before the booking was created, averaged over your bookings.`,
      "Booking rate — bookings created in the range with you as host ÷ your outbound human dials in the range (one per call ID, as the Dials figure in My activity).",
      "Show rate — Showed ÷ (Showed + No-show) among appointments you hosted that were scheduled to start in the range; appointments not yet marked are left out of both sides. The goal badge is your own completed-appointments goal applied to the Showed count.",
      "Outcomes — the same scheduled appointments by what happened: Showed, No-show, Cancelled (status cancelled), Unmarked (start time passed, status still open), Upcoming (start time still ahead). Rescheduled counts those GHL stamps as rescheduled at least once and overlaps the other buckets, so it is listed beside the donut rather than in it.",
      "Cohort — contacts with an appointment you hosted that was scheduled in the range, judged as of the last sync: converted = reached CA 101 submitted, IAU App Submitted (any tracked semester), or the NGT stage at or after the appointment (only contacts whose appointment falls after milestone tracking began count for the %); won / lost = an opportunity whose status changed to won / lost at or after the appointment.",
      "Lost after showing — of the contacts who showed with you in the range, those with an opportunity lost at or after that appointment; the stage shown is the stage the opportunity sits in now, which is where it was lost from.",
      `${cfg.ngtStage.stageName} — opportunities assigned to you that entered the stage during the range (stage changes the sync observed, or GHL's stage-entry time for opportunities already there at the first sync), with what each became since: IAU App Submitted, won, lost, or still open.`,
      "Army / Veteran — the contact's current tags; Both and No tag count in the totals only.",
      "Booked vs Showed — bookings created per bucket (booking time) and appointments showed per bucket (scheduled time): hourly for a single day, daily up to 92 days, weekly beyond.",
      "Limitation: Showed and No-show are set by hand in GHL, so the show rate is only as current as your marking; GHL does not record when an appointment was cancelled, so the cancelled count uses the last-updated time.",
    ],
  };
}

// ---- drilldowns (served by /api/me/drilldown, kind=appt) -----------------------------------------------------

/** The rep's rows behind one appointment card: booked (as host), scheduled (with outcome segments), the cohort, lost after showing, or NGT entries. */
export function myApptDrilldown(rep: Rep, which: string, range: DateRange, now: Date): RepDrillResult | null {
  const start = iso(range.start);
  const end = iso(range.end);
  const nowIso = iso(now);
  const mine = (list: Appt[]) => list.filter((a) => a.hostId === rep.userId);
  const stamp = new Date().toISOString();
  if (which === "booked") {
    const cfg = appointmentsConfig();
    const booked = mine(bookedIn(start, end));
    const dials = dialsByContact(new Date(range.start.getTime() - cfg.callsBeforeBookingDays * 86_400_000).toISOString(), end);
    const rows = apptDrillRows(booked).map((r) => {
      const a = booked.find((x) => x.id === r.opportunityId);
      return { ...repRow(r), callsBefore: a ? callsBeforeBooking(dials, a, cfg.callsBeforeBookingDays, (u) => u === rep.userId) : null };
    });
    return { ok: true, title: "Appointments Booked · yours", rows, count: rows.length, detailsNote: null, fetchedAt: stamp };
  }
  if (which === "scheduled") {
    const scheduled = mine(scheduledIn(start, end)).filter((a) => a.status !== "invalid");
    const segs = (a: Appt): string[] => {
      const out: string[] = ["scheduled"];
      if (a.status === "showed") out.push("showed");
      else if (a.status === "noshow") out.push("noshow");
      else if (a.status === "cancelled") out.push("cancelled");
      else out.push((a.startTime ?? "") < nowIso ? "unmarked" : "upcoming");
      if (a.rescheduledAt) out.push("rescheduled");
      return out;
    };
    const rows = apptDrillRows(scheduled).map((r) => {
      const a = scheduled.find((x) => x.id === r.opportunityId);
      return { ...repRow(r), reachedOn: a?.startTime ?? r.reachedOn, segments: a ? segs(a) : [] };
    });
    rows.sort((a, z) => (a.reachedOn < z.reachedOn ? 1 : -1));
    return { ok: true, title: "Appointments scheduled in the range · yours", rows, count: rows.length, detailsNote: null, fetchedAt: stamp };
  }
  if (which === "cohort" || which === "lost" || which === "ngt") {
    const { members, lostMembers, ngtMembers } = repCohort(rep, range);
    if (which === "ngt") {
      const rows = ngtRows(ngtMembers).map(repRow);
      return { ok: true, title: "Appointment Booked (NGT) entries · yours", rows, count: rows.length, detailsNote: null, fetchedAt: stamp };
    }
    if (which === "lost") {
      const rows = memberRows(lostMembers, () => ["lost"]).map((r) => ({ ...repRow(r), apptStatus: "Showed" }));
      rows.sort((a, z) => ((a.lostOn ?? "") < (z.lostOn ?? "") ? 1 : -1));
      return { ok: true, title: "Lost after showing · yours", rows, count: rows.length, detailsNote: null, fetchedAt: stamp };
    }
    const rows = memberRows(members, (m) => [
      "cohort",
      ...(m.historyAvailable ? ["withHistory"] : ["historyUnavailable"]),
      ...(m.appointments.some((a) => a.hostId === rep.userId && a.status === "showed") ? ["showed"] : []),
      ...(m.historyAvailable && m.converted ? ["converted"] : []),
      ...(m.won ? ["won"] : []),
      ...(m.lost ? ["lost"] : []),
    ]).map(repRow);
    rows.sort((a, z) => (a.reachedOn < z.reachedOn ? 1 : -1));
    return { ok: true, title: "Appointment → Outcome cohort · yours", rows, count: rows.length, detailsNote: null, fetchedAt: stamp };
  }
  return null;
}

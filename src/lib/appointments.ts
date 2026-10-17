// The Appointments row (owner request 2026-10-17): status cards split by
// program, rates, the rep appointments table, and their drilldowns. Reads the
// local cache only; nothing here calls GHL.
//
// Cohorts (everything is for the selected range unless marked snapshot):
//   booked     = appointments whose booking was created in the range (dateAdded)
//   scheduled  = appointments whose start time falls in the range (startTime)
//   cancelled  = appointments with status cancelled whose last update is in the
//                range (GHL records no cancellation time; see the card note)
//   confirmed  = SNAPSHOT: contacts whose opportunity sits in the "Appointment
//                Confirmed (VCN)" stage of a program pipeline right now
// Army / Veteran / Both / No tag always come from the contact's current tags,
// the same classification used everywhere else on the dashboard. Deleted
// appointments are never counted.

import raw from "../../config/appointments.json";
import { buckets, fill, type Grouping, type TimePoint } from "@/lib/charts";
import { getDb, readSnapshots } from "@/lib/db";
import { fmtDay, type DateRange } from "@/lib/dates";
import { contactUrl, type DrillResult, type DrillRow } from "@/lib/drilldown";
import { goalFor, repGoalStatus, type Goal, type GoalStatus } from "@/lib/goals";
import { mappingConfig, type ProgramKey } from "@/lib/mapping-config";
import { classifyTags, coverage, type Breakdown } from "@/lib/metrics";
import { userNames } from "@/lib/milestones";
import { repRoster, type Rep } from "@/lib/reps";

// ---- config ---------------------------------------------------------------------------

export interface AppointmentsConfig {
  callsBeforeBookingDays: number;
  showRateLeaderMinMarked: number;
  ngtStage: { pipelineId: string; stageId: string; stageName: string };
  outcomeMilestones: string[];
}

export function appointmentsConfig(): AppointmentsConfig {
  const c = raw as unknown as Partial<AppointmentsConfig>;
  const int = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : d);
  return {
    callsBeforeBookingDays: int(c.callsBeforeBookingDays, 14),
    showRateLeaderMinMarked: int(c.showRateLeaderMinMarked, 5),
    ngtStage: c.ngtStage ?? { pipelineId: "", stageId: "", stageName: "Appointment Booked (NGT)" },
    outcomeMilestones: Array.isArray(c.outcomeMilestones) ? c.outcomeMilestones : ["army_ca101", "vet_iau_app_submitted"],
  };
}

// ---- shared types -----------------------------------------------------------------------

export type TagClass = "army" | "veteran" | "both" | "untagged";
export const TAG_CLASS_LABEL: Record<TagClass, string> = { army: "Army", veteran: "Veteran", both: "Both (army + veteran)", untagged: "No tag" };

export type ApptStatus = "showed" | "noshow" | "cancelled" | "confirmed" | "new" | "invalid" | "other";
export const STATUS_LABEL: Record<ApptStatus, string> = {
  showed: "Showed",
  noshow: "No-show",
  cancelled: "Cancelled",
  confirmed: "Confirmed (calendar status)",
  new: "New",
  invalid: "Invalid",
  other: "Other",
};

export function normStatus(s: string | null | undefined): ApptStatus {
  const v = (s ?? "").toLowerCase();
  if (v === "showed") return "showed";
  if (v === "noshow" || v === "no-show" || v === "no_show") return "noshow";
  if (v === "cancelled" || v === "canceled") return "cancelled";
  if (v === "confirmed") return "confirmed";
  if (v === "new") return "new";
  if (v === "invalid") return "invalid";
  return "other";
}

export interface Appt {
  id: string;
  calendarId: string | null;
  contactId: string | null;
  status: ApptStatus;
  rawStatus: string | null;
  /** The appointment's assigned user: the host who takes the appointment. */
  hostId: string | null;
  /** The user who created the booking, when GHL identifies one (booking-widget bookings have none). */
  creatorId: string | null;
  creatorSource: string | null;
  startTime: string | null;
  bookedAt: string | null;
  updatedAt: string | null;
  rescheduledAt: string | null;
  cls: TagClass;
}

export interface Split {
  army: number;
  veteran: number;
  both: number;
  untagged: number;
  total: number;
}

export const emptySplit = (): Split => ({ army: 0, veteran: 0, both: 0, untagged: 0, total: 0 });

export function splitOf(items: { cls: TagClass }[]): Split {
  const s = emptySplit();
  for (const it of items) {
    s[it.cls] += 1;
    s.total += 1;
  }
  return s;
}

/** Distinct contacts (by contact id) with their tag class. Appointments without a contact id count once each. */
export function distinctContacts(items: Appt[]): { contactId: string | null; cls: TagClass; first: Appt }[] {
  const seen = new Map<string, { contactId: string | null; cls: TagClass; first: Appt }>();
  for (const a of items) {
    const key = a.contactId ?? `appt:${a.id}`;
    if (!seen.has(key)) seen.set(key, { contactId: a.contactId, cls: a.cls, first: a });
  }
  return [...seen.values()];
}

export const iso = (d: Date) => d.toISOString();
export const pct = (num: number, den: number, digits = 0): string => (den > 0 ? `${((num / den) * 100).toFixed(digits)}%` : "—");
const n = (v: number) => v.toLocaleString("en-US");

// ---- loading --------------------------------------------------------------------------

interface ApptRowDb {
  id: string;
  calendar_id: string | null;
  contact_id: string | null;
  status: string | null;
  assigned_user_id: string | null;
  created_by_user_id: string | null;
  created_by_source: string | null;
  start_time: string | null;
  date_added: string | null;
  date_updated: string | null;
  rescheduled_at: string | null;
  tags: string | null;
}

function loadAppts(where: string, params: (string | number)[]): Appt[] {
  const rows = getDb()
    .prepare(
      `SELECT a.id, a.calendar_id, a.contact_id, a.status, a.assigned_user_id, a.created_by_user_id, a.created_by_source,
              a.start_time, a.date_added, a.date_updated, a.rescheduled_at, c.tags
         FROM appointments a LEFT JOIN contacts c ON c.id = a.contact_id
        WHERE a.deleted = 0 AND ${where}`,
    )
    .all(...params) as unknown as ApptRowDb[];
  return rows.map((r) => ({
    id: r.id,
    calendarId: r.calendar_id,
    contactId: r.contact_id,
    status: normStatus(r.status),
    rawStatus: r.status,
    hostId: r.assigned_user_id || null,
    creatorId: r.created_by_user_id || null,
    creatorSource: r.created_by_source,
    startTime: r.start_time,
    bookedAt: r.date_added,
    updatedAt: r.date_updated,
    rescheduledAt: r.rescheduled_at,
    cls: classifyTags(r.tags),
  }));
}

/** Bookings created in [start, end). */
export function bookedIn(start: string, end: string): Appt[] {
  return loadAppts(`a.date_added >= ? AND a.date_added < ?`, [start, end]);
}

/** Appointments scheduled to start in [start, end). */
export function scheduledIn(start: string, end: string): Appt[] {
  return loadAppts(`a.start_time >= ? AND a.start_time < ?`, [start, end]);
}

/** Appointments with status cancelled whose last update falls in [start, end). */
export function cancelledIn(start: string, end: string): Appt[] {
  return loadAppts(`lower(COALESCE(a.status, '')) IN ('cancelled', 'canceled') AND a.date_updated >= ? AND a.date_updated < ?`, [start, end]);
}

/** Calendar names from the mapping snapshot (read-only cache of GET /calendars). */
export function calendarNames(): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of readSnapshots("mapping:calendars")) {
    if (!s.payload) continue;
    try {
      const p = JSON.parse(s.payload) as { calendars?: { id: string; name: string }[] };
      for (const c of p.calendars ?? []) map.set(c.id, c.name);
    } catch {
      // ignore a malformed snapshot; names fall back to ids
    }
  }
  return map;
}

/** Contacts currently sitting in an "Appointment Confirmed (VCN)" stage, with the program pipeline(s) they sit in. */
export function confirmedSnapshot(): Map<string, { cls: TagClass; programs: Set<ProgramKey>; opps: { id: string; pipelineId: string; stageId: string; status: string; assignedTo: string | null }[] }> {
  const stages = mappingConfig.snapshotStages.appointmentConfirmed;
  const out = new Map<string, { cls: TagClass; programs: Set<ProgramKey>; opps: { id: string; pipelineId: string; stageId: string; status: string; assignedTo: string | null }[] }>();
  if (stages.length === 0) return out;
  const marks = stages.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT o.id, o.contact_id, o.pipeline_id, o.stage_id, o.status, o.assigned_to, c.tags FROM opportunities o LEFT JOIN contacts c ON c.id = o.contact_id
        WHERE o.stage_id IN (${marks}) AND o.missing_since IS NULL`,
    )
    .all(...stages.map((s) => s.stageId)) as unknown as { id: string; contact_id: string | null; pipeline_id: string; stage_id: string; status: string; assigned_to: string | null; tags: string | null }[];
  for (const r of rows) {
    const key = r.contact_id ?? `opp:${r.id}`;
    const program = stages.find((s) => s.stageId === r.stage_id)?.program ?? "veteran";
    const cur = out.get(key) ?? { cls: classifyTags(r.tags), programs: new Set<ProgramKey>(), opps: [] };
    cur.programs.add(program);
    cur.opps.push({ id: r.id, pipelineId: r.pipeline_id, stageId: r.stage_id, status: r.status, assignedTo: r.assigned_to });
    out.set(key, cur);
  }
  return out;
}

function prevReason(range: DateRange): string | undefined {
  const dataStart = coverage().historyStart;
  if (iso(range.prevStart) < dataStart) return `Appointment history starts ${fmtDay(new Date(dataStart))}, after the comparison period began.`;
  return undefined;
}

// ---- 1. status cards -----------------------------------------------------------------------

export interface StatusCardResult {
  key: "appointmentsBooked" | "appointmentsCompleted" | "appointmentsConfirmed" | "appointmentsCancelled";
  title: string;
  subtitle: string;
  snapshot: boolean;
  /** Army / Veteran / Both / No tag by contact tag; total is the headline. */
  split: Split;
  /** Snapshot card only: the per-pipeline counts that define Army and Veteran on the headline. */
  byPipeline: { army: number; veteran: number } | null;
  goal: Goal | null;
  prev: number | null;
  prevUnavailableReason?: string;
  breakdown: Breakdown[];
  notes: string[];
  drill: { which: "booked" | "completed" | "confirmed" | "cancelled"; expected: number };
}

export interface StatusCards {
  booked: StatusCardResult;
  completed: StatusCardResult;
  confirmed: StatusCardResult;
  cancelled: StatusCardResult;
}

const TAG_NOTE = "Army / Veteran — from the contact's current tags (army / veteran); a contact with both tags is Both, with neither is No tag. The four buckets add up to the headline.";

function splitRows(s: Split): Breakdown[] {
  return [
    { label: "Both (army + veteran)", value: n(s.both) },
    { label: "No tag", value: n(s.untagged) },
  ];
}

export function computeStatusCards(range: DateRange): StatusCards {
  const start = iso(range.start);
  const end = iso(range.end);
  const now = iso(range.asOf);
  const reason = prevReason(range);

  // Booked
  const booked = bookedIn(start, end);
  const bookedSplit = splitOf(booked);
  const statusNow: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  let rescheduled = 0;
  for (const a of booked) {
    statusNow[a.status] = (statusNow[a.status] ?? 0) + 1;
    const src = a.creatorSource ?? "(unknown)";
    bySource[src] = (bySource[src] ?? 0) + 1;
    if (a.rescheduledAt) rescheduled += 1;
  }
  const bookedCard: StatusCardResult = {
    key: "appointmentsBooked",
    title: "Appointments Booked",
    subtitle: "Bookings created in period · Army / Veteran by contact tag",
    snapshot: false,
    split: bookedSplit,
    byPipeline: null,
    goal: goalFor("appointmentsBooked", range),
    prev: reason ? null : bookedIn(iso(range.prevStart), iso(range.prevEnd)).length,
    prevUnavailableReason: reason,
    breakdown: [
      ...splitRows(bookedSplit),
      ...Object.entries(statusNow)
        .sort((a, b) => b[1] - a[1])
        .map(([s, c]) => ({ label: `Status now: ${STATUS_LABEL[s as ApptStatus]}`, value: n(c) })),
      { label: "Rescheduled at least once", value: n(rescheduled) },
      ...Object.entries(bySource)
        .sort((a, b) => b[1] - a[1])
        .map(([s, c]) => ({ label: `Booked via: ${s}`, value: n(c) })),
    ],
    notes: [
      "Counting — unique appointment IDs by booking creation time, whatever the appointment's date; deleted appointments are excluded.",
      "Cancellations — stay in the count; their status is listed under Status now.",
      TAG_NOTE,
      "Booked via — GHL's record of where the booking was created (mobile app, contact page, booking widget, …).",
      "Goal — applies to the total, not to each program.",
    ],
    drill: { which: "booked", expected: bookedSplit.total },
  };

  // Completed (showed), scheduled in period
  const scheduled = scheduledIn(start, end);
  const showed = scheduled.filter((a) => a.status === "showed");
  const showedSplit = splitOf(showed);
  const noshow = scheduled.filter((a) => a.status === "noshow").length;
  const cancelledSched = scheduled.filter((a) => a.status === "cancelled").length;
  const invalid = scheduled.filter((a) => a.status === "invalid").length;
  const pendingPast = scheduled.filter((a) => !["showed", "noshow", "cancelled", "invalid"].includes(a.status) && (a.startTime ?? "") < now).length;
  const upcoming = scheduled.filter((a) => !["showed", "noshow", "cancelled", "invalid"].includes(a.status) && (a.startTime ?? "") >= now).length;
  const completedCard: StatusCardResult = {
    key: "appointmentsCompleted",
    title: "Appointments Completed",
    subtitle: "Scheduled in period and marked Showed · Army / Veteran by contact tag",
    snapshot: false,
    split: showedSplit,
    byPipeline: null,
    goal: goalFor("appointmentsCompleted", range),
    prev: reason ? null : scheduledIn(iso(range.prevStart), iso(range.prevEnd)).filter((a) => a.status === "showed").length,
    prevUnavailableReason: reason,
    breakdown: [
      ...splitRows(showedSplit),
      { label: "Scheduled in period (all statuses)", value: n(scheduled.length) },
      { label: "No-show", value: n(noshow) },
      { label: "Cancelled", value: n(cancelledSched) },
      { label: "Past start, attendance not yet marked", value: n(pendingPast) },
      { label: "Upcoming", value: n(upcoming) },
      ...(invalid > 0 ? [{ label: "Invalid", value: n(invalid) }] : []),
    ],
    notes: [
      "Completed — appointments scheduled to start in the period whose calendar status is Showed; only an explicit Showed counts.",
      "Not counted — a past start time or a completed call never counts as attendance.",
      TAG_NOTE,
      "Goal — applies to the total, not to each program.",
    ],
    drill: { which: "completed", expected: showedSplit.total },
  };

  // Confirmed (snapshot)
  const snap = confirmedSnapshot();
  const confirmedSplit = emptySplit();
  let armyPipe = 0;
  let vetPipe = 0;
  for (const c of snap.values()) {
    confirmedSplit[c.cls] += 1;
    confirmedSplit.total += 1;
    if (c.programs.has("army")) armyPipe += 1;
    if (c.programs.has("veteran")) vetPipe += 1;
  }
  const stages = mappingConfig.snapshotStages.appointmentConfirmed;
  const confirmedCard: StatusCardResult = {
    key: "appointmentsConfirmed",
    title: "Appointments Confirmed",
    subtitle: `In stage "${stages[0]?.stageName ?? "Appointment Confirmed (VCN)"}" now · snapshot · Army / Veteran by pipeline`,
    snapshot: true,
    split: confirmedSplit,
    byPipeline: { army: armyPipe, veteran: vetPipe },
    goal: goalFor("appointmentsConfirmed", range),
    prev: null,
    prevUnavailableReason: "This is a current snapshot of stage occupancy; there is no prior-period value.",
    breakdown: [
      { label: "By contact tag: Army", value: n(confirmedSplit.army) },
      { label: "By contact tag: Veteran", value: n(confirmedSplit.veteran) },
      ...splitRows(confirmedSplit),
      ...(armyPipe + vetPipe !== confirmedSplit.total ? [{ label: "Contacts in both pipelines' stages (counted once in the total)", value: n(armyPipe + vetPipe - confirmedSplit.total) }] : []),
    ],
    notes: [
      "Snapshot — distinct contacts whose opportunity currently sits in the Appointment Confirmed (VCN) stage, as of the last sync; not a count of confirmations during the period, and the date range is not applied.",
      "Army / Veteran on the headline — the program pipeline whose stage the contact sits in (Army CA Pipeline or Veteran G.I. Bill); the contact-tag split is in Details.",
      "Calendar status — the calendar's own 'confirmed' status is a different field (GHL sets it on every new booking) and is not used here.",
      "Goal — applies to the total, compared with the current snapshot.",
    ],
    drill: { which: "confirmed", expected: confirmedSplit.total },
  };

  // Cancelled
  const cancelled = cancelledIn(start, end);
  const cancelledSplit = splitOf(cancelled);
  const byStart = scheduled.filter((a) => a.status === "cancelled").length;
  const byBooked = booked.filter((a) => a.status === "cancelled").length;
  const cancelledCard: StatusCardResult = {
    key: "appointmentsCancelled",
    title: "Appointments Cancelled",
    subtitle: "Status cancelled · last changed in period · Army / Veteran by contact tag",
    snapshot: false,
    split: cancelledSplit,
    byPipeline: null,
    goal: goalFor("appointmentsCancelled", range),
    prev: reason ? null : cancelledIn(iso(range.prevStart), iso(range.prevEnd)).length,
    prevUnavailableReason: reason,
    breakdown: [
      ...splitRows(cancelledSplit),
      { label: "Cancelled, scheduled to start in period", value: n(byStart) },
      { label: "Cancelled, booked in period", value: n(byBooked) },
    ],
    notes: [
      "Cancellation time — the appointment's last-updated time, which is exact unless the appointment was edited again after cancelling.",
      "Extra lines — count cancelled appointments by scheduled start and by booking date instead.",
      TAG_NOTE,
      "Limitation: GHL does not record when an appointment was cancelled.",
    ],
    drill: { which: "cancelled", expected: cancelledSplit.total },
  };

  return { booked: bookedCard, completed: completedCard, confirmed: confirmedCard, cancelled: cancelledCard };
}

// ---- 2. rates ------------------------------------------------------------------------------

export interface Ratio {
  num: number;
  den: number;
}

export interface RateLine {
  key: string;
  label: string;
  /** What the numerator and denominator are, shown under the label. */
  basis: string;
  army: Ratio;
  veteran: Ratio;
  total: Ratio;
  /** Count lines show "num" only (den gives context in the title). */
  kind: "rate" | "count";
  lowerIsBetter: boolean;
  unavailableReason?: string;
}

export interface RatesResult {
  lines: RateLine[];
  /** Headline pair. */
  showRate: Ratio;
  cancelRate: Ratio;
  rescheduledInPeriod: Split;
  notes: string[];
}

function triple<T extends { cls: TagClass }>(items: T[], num: (x: T) => boolean, den: (x: T) => boolean): { army: Ratio; veteran: Ratio; total: Ratio } {
  const r = { army: { num: 0, den: 0 }, veteran: { num: 0, den: 0 }, total: { num: 0, den: 0 } };
  for (const it of items) {
    const inDen = den(it);
    const inNum = inDen && num(it);
    for (const k of [it.cls === "army" ? "army" : it.cls === "veteran" ? "veteran" : null, "total"] as const) {
      if (!k) continue;
      if (inDen) r[k].den += 1;
      if (inNum) r[k].num += 1;
    }
  }
  return r;
}

export function computeRates(range: DateRange): RatesResult {
  const start = iso(range.start);
  const end = iso(range.end);
  const now = iso(range.asOf);
  const booked = bookedIn(start, end);
  const scheduled = scheduledIn(start, end);
  const marked = (a: Appt) => a.status === "showed" || a.status === "noshow";

  const cancel = triple(booked, (a) => a.status === "cancelled", () => true);
  const show = triple(scheduled, (a) => a.status === "showed", (a) => marked(a));
  const noShow = triple(scheduled, (a) => a.status === "noshow", (a) => marked(a));
  const resched = triple(booked, (a) => Boolean(a.rescheduledAt), () => true);
  const notMarked = triple(scheduled, (a) => !["showed", "noshow", "cancelled", "invalid"].includes(a.status), (a) => (a.startTime ?? "") < now);

  // confirm rate: contacts with an appointment scheduled in the period whose opportunity sits in Appointment Confirmed (VCN) now
  const snap = confirmedSnapshot();
  const contacts = distinctContacts(scheduled);
  const confirm = triple(
    contacts.map((c) => ({ cls: c.cls, contactId: c.contactId })),
    (c) => Boolean(c.contactId && snap.has(c.contactId as string)),
    () => true,
  );

  const rescheduledInPeriod = splitOf(loadAppts(`a.rescheduled_at >= ? AND a.rescheduled_at < ?`, [start, end]));

  const lines: RateLine[] = [
    { key: "showRate", label: "Show rate", basis: "Showed ÷ (Showed + No-show), appointments scheduled in period", kind: "rate", lowerIsBetter: false, ...show },
    { key: "noShowRate", label: "No-show rate", basis: "No-show ÷ (Showed + No-show), appointments scheduled in period", kind: "rate", lowerIsBetter: true, ...noShow },
    { key: "cancelRate", label: "Cancel rate", basis: "Status cancelled ÷ bookings created in period", kind: "rate", lowerIsBetter: true, ...cancel },
    { key: "confirmRate", label: "Confirm rate", basis: "Contacts in Appointment Confirmed (VCN) now ÷ contacts with an appointment scheduled in period", kind: "rate", lowerIsBetter: false, ...confirm },
    { key: "rescheduleRate", label: "Rescheduled", basis: "Bookings created in period that GHL marks rescheduled (rescheduledAt) ÷ bookings created in period", kind: "rate", lowerIsBetter: true, ...resched },
    { key: "notMarked", label: "Attendance not yet marked", basis: "Past start time, status still open (not Showed / No-show / Cancelled / Invalid)", kind: "count", lowerIsBetter: true, ...notMarked },
  ];

  return {
    lines,
    showRate: show.total,
    cancelRate: cancel.total,
    rescheduledInPeriod,
    notes: [
      "Show rate — Showed ÷ (Showed + No-show) among appointments scheduled to start in the period; appointments not yet marked are left out of both sides.",
      "No-show rate — the complement of the show rate on the same appointments.",
      "Cancel rate — of the bookings created in the period, the share whose status is now cancelled (one cohort, so the rate can never exceed 100%); the Cancelled card counts by cancellation time instead, so its headline can differ.",
      "Confirm rate — contacts with an appointment scheduled in the period whose opportunity sits in the Appointment Confirmed (VCN) stage of a program pipeline right now (stage snapshot as of the last sync) ÷ contacts with an appointment scheduled in the period; contacts move out of the stage after the appointment, so past periods read low.",
      "Rescheduled — GHL stamps rescheduledAt on an appointment when its time is changed; this is the only reschedule signal the API exposes (masterEventId is empty on every event, so a reschedule cannot be linked to the slot it replaced, and an appointment rescheduled twice counts once). The rate uses bookings created in the period; the count line uses the time of the reschedule.",
      "Attendance not yet marked — appointments whose start time has passed but whose status is still open; the host has not recorded Showed or No-show.",
      TAG_NOTE.replace("The four buckets add up to the headline.", "Both and No tag count in Total only."),
      "Limitation: Showed and No-show are set by hand in GHL, so the show rate is only as current as the team's marking.",
    ],
  };
}

// ---- 3. rep appointments table ---------------------------------------------------------------

export interface RepApptRow {
  userId: string | null;
  name: string;
  isRep: boolean;
  /** Bookings created in period where this user is the host (assigned user). */
  booked: number;
  bookedSplit: Split;
  /** Bookings created in period that this user created (GHL's createdBy), whoever hosts them. */
  bookedBy: number;
  /** Scheduled in period, as host. */
  showed: number;
  noshow: number;
  /** Status cancelled, last changed in period, as host. */
  cancelled: number;
  showRate: number | null;
  /** Host dials to the booked contact in the window before each booking, summed over the host's bookings. */
  callsBefore: number;
  callsPerBooking: number | null;
  bookedGoal: { full: number; scaled: number } | null;
  bookedStatus: GoalStatus | null;
  leaderBooked: boolean;
  leaderShow: boolean;
}

export interface RepApptsResult {
  rows: RepApptRow[];
  others: RepApptRow | null;
  total: RepApptRow;
  windowDays: number;
  minMarked: number;
  bookedGoal: Goal | null;
  unmatchedReps: Rep[];
  notes: string[];
}

interface DialRef {
  u: string | null;
  t: string;
}

/** Outbound human dials in [start, end), one per call id, grouped by contact. */
function dialsByContact(start: string, end: string): Map<string, DialRef[]> {
  const rows = getDb()
    .prepare(
      `SELECT MIN(NULLIF(user_id, '')) AS u, MIN(date_added) AS t, MIN(contact_id) AS cid
         FROM calls WHERE automated = 0 AND direction = 'outbound' AND contact_id IS NOT NULL AND date_added >= ? AND date_added < ?
        GROUP BY COALESCE(alt_id, id)`,
    )
    .all(start, end) as unknown as { u: string | null; t: string; cid: string }[];
  const map = new Map<string, DialRef[]>();
  for (const r of rows) map.set(r.cid, [...(map.get(r.cid) ?? []), { u: r.u, t: r.t }]);
  return map;
}

/** Dials to the booked contact in the `days` before the booking: the host's own dials when the host is a configured rep, otherwise anyone's. */
export function callsBeforeBooking(dials: Map<string, DialRef[]>, a: Appt, days: number, isRep: (u: string | null) => boolean): number {
  if (!a.contactId || !a.bookedAt) return 0;
  const to = Date.parse(a.bookedAt);
  const from = to - days * 86400000;
  const hostOnly = isRep(a.hostId);
  let c = 0;
  for (const d of dials.get(a.contactId) ?? []) {
    const t = Date.parse(d.t);
    if (t < from || t >= to) continue;
    if (hostOnly && d.u !== a.hostId) continue;
    c += 1;
  }
  return c;
}

export function computeRepAppointments(range: DateRange): RepApptsResult {
  const cfg = appointmentsConfig();
  const start = iso(range.start);
  const end = iso(range.end);
  const roster = repRoster();
  const names = userNames();
  const isRep = (u: string | null) => u !== null && roster.byUserId.has(u);
  const bucket = (u: string | null) => (isRep(u) ? (u as string) : "__others");
  const bookedGoal = goalFor("appointmentsBooked", range);

  const booked = bookedIn(start, end);
  const scheduled = scheduledIn(start, end);
  const cancelled = cancelledIn(start, end);
  const dials = dialsByContact(new Date(range.start.getTime() - cfg.callsBeforeBookingDays * 86400000).toISOString(), end);

  const acc = new Map<string, { booked: Appt[]; bookedBy: number; showed: number; noshow: number; cancelled: number; calls: number }>();
  const get = (k: string) => {
    const cur = acc.get(k) ?? { booked: [], bookedBy: 0, showed: 0, noshow: 0, cancelled: 0, calls: 0 };
    acc.set(k, cur);
    return cur;
  };
  let totalCalls = 0;
  for (const a of booked) {
    const h = get(bucket(a.hostId));
    h.booked.push(a);
    const c = callsBeforeBooking(dials, a, cfg.callsBeforeBookingDays, isRep);
    h.calls += c;
    totalCalls += c;
    get(bucket(a.creatorId)).bookedBy += 1;
  }
  for (const a of scheduled) {
    if (a.status === "showed") get(bucket(a.hostId)).showed += 1;
    else if (a.status === "noshow") get(bucket(a.hostId)).noshow += 1;
  }
  for (const a of cancelled) get(bucket(a.hostId)).cancelled += 1;

  const row = (userId: string | null, name: string, key: string): RepApptRow => {
    const v = acc.get(key) ?? { booked: [], bookedBy: 0, showed: 0, noshow: 0, cancelled: 0, calls: 0 };
    const marked = v.showed + v.noshow;
    const configured = userId !== null && roster.byUserId.has(userId);
    const g = configured && bookedGoal ? bookedGoal.perRep[userId] : undefined;
    return {
      userId,
      name,
      isRep: configured,
      booked: v.booked.length,
      bookedSplit: splitOf(v.booked),
      bookedBy: v.bookedBy,
      showed: v.showed,
      noshow: v.noshow,
      cancelled: v.cancelled,
      showRate: marked > 0 ? v.showed / marked : null,
      callsBefore: v.calls,
      callsPerBooking: v.booked.length > 0 ? v.calls / v.booked.length : null,
      bookedGoal: g ? { full: g.full, scaled: g.scaled } : null,
      bookedStatus: configured && bookedGoal && userId ? repGoalStatus(v.booked.length, bookedGoal, userId) : null,
      leaderBooked: false,
      leaderShow: false,
    };
  };

  const rows = [...roster.byUserId.entries()].map(([id, rep]) => row(id, rep.name, id)).sort((a, b) => b.booked - a.booked || a.name.localeCompare(b.name));
  if (rows.length > 0 && rows[0].booked > 0) rows[0].leaderBooked = true;
  const eligible = rows.filter((r) => r.showRate !== null && r.showed + r.noshow >= cfg.showRateLeaderMinMarked);
  if (eligible.length > 0) {
    const best = Math.max(...eligible.map((r) => r.showRate as number));
    const leader = eligible.find((r) => r.showRate === best);
    if (leader) leader.leaderShow = true;
  }

  const otherIds = new Set<string | null>();
  for (const a of booked) {
    if (!isRep(a.hostId)) otherIds.add(a.hostId);
    if (!isRep(a.creatorId)) otherIds.add(a.creatorId);
  }
  for (const a of [...scheduled, ...cancelled]) if (!isRep(a.hostId)) otherIds.add(a.hostId);
  const otherNames = [...otherIds].map((u) => (u === null ? "no user" : (names.get(u) ?? u))).sort();
  const others = acc.has("__others") ? row(null, `Other users, not sales reps (${otherNames.join(", ")})`, "__others") : null;

  const allRows = others ? [...rows, others] : rows;
  const sum = (f: (r: RepApptRow) => number) => allRows.reduce((s, r) => s + f(r), 0);
  const totalSplit = splitOf(booked);
  const totalShowed = sum((r) => r.showed);
  const totalNoshow = sum((r) => r.noshow);
  const total: RepApptRow = {
    userId: null,
    name: "Team total",
    isRep: false,
    booked: booked.length,
    bookedSplit: totalSplit,
    bookedBy: sum((r) => r.bookedBy),
    showed: totalShowed,
    noshow: totalNoshow,
    cancelled: cancelled.length,
    showRate: totalShowed + totalNoshow > 0 ? totalShowed / (totalShowed + totalNoshow) : null,
    callsBefore: totalCalls,
    callsPerBooking: booked.length > 0 ? totalCalls / booked.length : null,
    bookedGoal: null,
    bookedStatus: null,
    leaderBooked: false,
    leaderShow: false,
  };

  return {
    rows,
    others,
    total,
    windowDays: cfg.callsBeforeBookingDays,
    minMarked: cfg.showRateLeaderMinMarked,
    bookedGoal,
    unmatchedReps: roster.unmatched,
    notes: [
      "Booked (as host) — bookings created in the period whose assigned user is the rep; the team total equals the Appointments Booked card.",
      "Booked by them — bookings created in the period that GHL records the rep as having created (createdBy), whoever hosts them; bookings from the public booking widget name no creator and fall under other users.",
      "Showed / No-show — appointments scheduled to start in the period, by host and calendar status; the Showed total equals the Appointments Completed card.",
      "Cancelled — status cancelled, last changed in the period, by host; the total equals the Appointments Cancelled card.",
      "Show rate — Showed ÷ (Showed + No-show).",
      `Calls per booking — the host's outbound dials to the booked contact in the ${cfg.callsBeforeBookingDays} days before the booking was created, averaged over the host's bookings; the team figure is all such dials ÷ all bookings, not an average of the rep averages. For bookings hosted by someone who is not a configured rep, dials from any user count.`,
      "Army / Veteran — the booked contacts' current tags; Both and No tag are in the drilldown.",
      `Leader — the rep with the most bookings, and the best show rate among reps with at least ${cfg.showRateLeaderMinMarked} appointments marked Showed or No-show.`,
      ...(bookedGoal ? [`Booking goal — ${bookedGoal.basis}; each rep is judged against their own goal.`] : []),
      "Credit — the appointment's assigned user; appointments with no host, or hosted by users who are not sales reps, are grouped as other users and still count in the team total.",
    ],
  };
}

// ---- chart: booked vs showed over time ------------------------------------------------------------------

export interface BookedShowedSeries {
  grouping: Grouping;
  /** Bookings created per bucket (booking creation time). */
  booked: TimePoint[];
  /** Appointments marked Showed per bucket (scheduled start time). */
  showed: TimePoint[];
  bookedTotal: number;
  showedTotal: number;
}

/** Booked (by booking time) and Showed (by scheduled time) per day — hourly for one day, weekly beyond 92 days. */
export function bookedShowedSeries(range: DateRange): BookedShowedSeries {
  const b = buckets(range.start, range.end);
  const booked = bookedIn(iso(range.start), iso(range.end)).filter((a) => a.bookedAt);
  const showed = scheduledIn(iso(range.start), iso(range.end)).filter((a) => a.status === "showed" && a.startTime);
  return {
    grouping: b.grouping,
    booked: fill(b, booked.map((a) => ({ t: a.bookedAt as string, c: 1 }))),
    showed: fill(b, showed.map((a) => ({ t: a.startTime as string, c: 1 }))),
    bookedTotal: booked.length,
    showedTotal: showed.length,
  };
}

// ---- drilldowns ---------------------------------------------------------------------------------

function baseRow(a: Appt, ctx: { names: Map<string, string>; contactName: Map<string, string | null>; calendars: Map<string, string> }): DrillRow {
  return {
    contactId: a.contactId,
    opportunityId: a.id,
    name: a.contactId ? (ctx.contactName.get(a.contactId) ?? null) : null,
    ghlUrl: a.contactId ? contactUrl(a.contactId) : null,
    source: a.creatorSource,
    assignedUser: a.hostId ? (ctx.names.get(a.hostId) ?? a.hostId) : null,
    pipeline: null,
    status: null,
    phone: null,
    email: null,
    value: null,
    stage: null,
    stageReached: "appointment",
    milestoneKey: "appointment",
    tags: [],
    createdOn: null,
    reachedOn: a.bookedAt ?? a.startTime ?? "",
    tagClass: TAG_CLASS_LABEL[a.cls],
    calendar: a.calendarId ? (ctx.calendars.get(a.calendarId) ?? a.calendarId) : null,
    apptStatus: STATUS_LABEL[a.status] + (a.status === "other" && a.rawStatus ? ` (${a.rawStatus})` : ""),
    scheduledFor: a.startTime,
    createdBy: a.creatorId ? (ctx.names.get(a.creatorId) ?? a.creatorId) : a.creatorSource === "booking_widget" ? "booking widget" : null,
    rescheduledAt: a.rescheduledAt,
  };
}

function drillContext(appts: Appt[]) {
  const names = userNames();
  const calendars = calendarNames();
  const ids = [...new Set(appts.map((a) => a.contactId).filter((x): x is string => Boolean(x)))];
  const contactName = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const marks = chunk.map(() => "?").join(",");
    for (const c of getDb().prepare(`SELECT id, name FROM contacts WHERE id IN (${marks})`).all(...chunk) as unknown as { id: string; name: string | null }[]) contactName.set(c.id, c.name);
  }
  return { names, contactName, calendars };
}

/** The appointments (or, for the snapshot, the contacts) behind one status card. Row count equals the card's headline. */
export function statusCardDrilldown(which: string, range: DateRange): DrillResult | null {
  const start = iso(range.start);
  const end = iso(range.end);
  const cfg = appointmentsConfig();
  const roster = repRoster();
  const isRep = (u: string | null) => u !== null && roster.byUserId.has(u);
  if (which === "confirmed") {
    const snap = confirmedSnapshot();
    const names = userNames();
    const stages = new Map<string, string>();
    const pipelines = new Map<string, string>();
    for (const p of mappingConfig.pipelines) {
      pipelines.set(p.id, p.name);
      for (const s of p.stages) stages.set(s.id, s.name);
    }
    const ids = [...snap.keys()].filter((k) => !k.startsWith("opp:"));
    const contactName = new Map<string, string | null>();
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      for (const c of getDb().prepare(`SELECT id, name FROM contacts WHERE id IN (${chunk.map(() => "?").join(",")})`).all(...chunk) as unknown as { id: string; name: string | null }[]) contactName.set(c.id, c.name);
    }
    const rows: DrillRow[] = [...snap.entries()].map(([key, c]) => {
      const o = c.opps[0];
      const contactId = key.startsWith("opp:") ? null : key;
      return {
        contactId,
        opportunityId: o.id,
        name: contactId ? (contactName.get(contactId) ?? null) : null,
        ghlUrl: contactId ? contactUrl(contactId) : null,
        source: null,
        assignedUser: o.assignedTo ? (names.get(o.assignedTo) ?? o.assignedTo) : null,
        pipeline: c.opps.map((x) => pipelines.get(x.pipelineId) ?? x.pipelineId).join(" + "),
        status: o.status,
        phone: null,
        email: null,
        value: null,
        stage: stages.get(o.stageId) ?? o.stageId,
        stageReached: "confirmed",
        milestoneKey: "confirmed",
        tags: [],
        createdOn: null,
        reachedOn: "",
        tagClass: TAG_CLASS_LABEL[c.cls],
      };
    });
    rows.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    return { ok: true, title: "Appointments Confirmed", rows, count: rows.length, detailsNote: null, fetchedAt: new Date().toISOString() };
  }
  const appts = which === "booked" ? bookedIn(start, end) : which === "completed" ? scheduledIn(start, end).filter((a) => a.status === "showed") : which === "cancelled" ? cancelledIn(start, end) : null;
  if (!appts) return null;
  const ctx = drillContext(appts);
  const dials = which === "booked" ? dialsByContact(new Date(range.start.getTime() - cfg.callsBeforeBookingDays * 86400000).toISOString(), end) : null;
  const rows = appts.map((a) => ({ ...baseRow(a, ctx), callsBefore: dials ? callsBeforeBooking(dials, a, cfg.callsBeforeBookingDays, isRep) : null }));
  rows.sort((a, b) => (a.reachedOn < b.reachedOn ? 1 : a.reachedOn > b.reachedOn ? -1 : 0));
  const title = which === "booked" ? "Appointments Booked" : which === "completed" ? "Appointments Completed" : "Appointments Cancelled";
  return { ok: true, title, rows, count: rows.length, detailsNote: null, fetchedAt: new Date().toISOString() };
}

/**
 * One rep's appointments: everything counted on their row, tagged with the
 * segments it was counted in (booked / bookedBy / showed / noshow / cancelled)
 * so the modal's segment filter reconciles with each column.
 */
export function repAppointmentsDrilldown(user: string, range: DateRange): DrillResult {
  const cfg = appointmentsConfig();
  const start = iso(range.start);
  const end = iso(range.end);
  const roster = repRoster();
  const names = userNames();
  const isRep = (u: string | null) => u !== null && roster.byUserId.has(u);
  const owned = (u: string | null) => (user === "others" ? !isRep(u) : u === user);

  const byId = new Map<string, { a: Appt; segments: Set<string> }>();
  const tag = (a: Appt, seg: string) => {
    const cur = byId.get(a.id) ?? { a, segments: new Set<string>() };
    cur.segments.add(seg);
    byId.set(a.id, cur);
  };
  for (const a of bookedIn(start, end)) {
    if (owned(a.hostId)) tag(a, "booked");
    if (owned(a.creatorId)) tag(a, "bookedBy");
  }
  for (const a of scheduledIn(start, end)) {
    if (!owned(a.hostId)) continue;
    if (a.status === "showed") tag(a, "showed");
    else if (a.status === "noshow") tag(a, "noshow");
  }
  for (const a of cancelledIn(start, end)) if (owned(a.hostId)) tag(a, "cancelled");

  const appts = [...byId.values()].map((x) => x.a);
  const ctx = drillContext(appts);
  const dials = dialsByContact(new Date(range.start.getTime() - cfg.callsBeforeBookingDays * 86400000).toISOString(), end);
  const rows: DrillRow[] = [...byId.values()].map(({ a, segments }) => ({
    ...baseRow(a, ctx),
    callsBefore: segments.has("booked") ? callsBeforeBooking(dials, a, cfg.callsBeforeBookingDays, isRep) : null,
    segments: [...segments],
  }));
  rows.sort((a, b) => (a.reachedOn < b.reachedOn ? 1 : a.reachedOn > b.reachedOn ? -1 : 0));
  const title = user === "others" ? "Other users, not sales reps" : (roster.byUserId.get(user)?.name ?? names.get(user) ?? user);
  return { ok: true, title, rows, count: rows.length, detailsNote: null, fetchedAt: new Date().toISOString() };
}

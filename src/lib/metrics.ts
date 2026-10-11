// KPI calculations for the executive scorecard. Everything reads the local
// cache; nothing here calls GHL. Each KPI returns either a number or an
// explicit "unavailable" reason. Zero is never substituted for missing data.

import { getDb, getState, lastSuccessfulSync } from "@/lib/db";
import type { DateRange } from "@/lib/dates";
import { fmtDay } from "@/lib/dates";
import { goalFor } from "@/lib/goals";
import { mappingConfig } from "@/lib/mapping-config";
import { CORE_SYNC_KIND, HISTORY_START } from "@/lib/sync/core";

export interface Breakdown {
  label: string;
  value: string;
}

export interface KpiResult {
  key: string;
  title: string;
  subtitle?: string;
  format: "count" | "minutes";
  value: number | null;
  unavailableReason?: string;
  goal: number | null;
  prev: number | null;
  prevUnavailableReason?: string;
  breakdown: Breakdown[];
  notes: string[];
}

export interface Coverage {
  firstCoreSyncAt: string | undefined;
  lastCoreSyncOkAt: string | undefined;
  historyStart: string;
}

export function coverage(): Coverage {
  return {
    firstCoreSyncAt: getState("first_core_sync_at"),
    lastCoreSyncOkAt: lastSuccessfulSync(CORE_SYNC_KIND)?.finished_at ?? undefined,
    historyStart: HISTORY_START,
  };
}

const n = (v: number | null | undefined) => (v === null || v === undefined ? "unavailable" : v.toLocaleString("en-US"));

function iso(d: Date): string {
  return d.toISOString();
}

function one<T>(sql: string, ...params: (string | number | null)[]): T {
  return getDb().prepare(sql).get(...params) as T;
}

function all<T>(sql: string, ...params: (string | number | null)[]): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

/** Why a previous-period comparison is not available, or undefined if it is. */
function prevReason(range: DateRange, dataStart: string | undefined, what: string): string | undefined {
  if (!dataStart) return `${what} history has not been loaded yet.`;
  if (iso(range.prevStart) < dataStart) return `${what} history starts ${fmtDay(new Date(dataStart))}, after the comparison period began.`;
  return undefined;
}

// ---- New Leads ---------------------------------------------------------------------

function newLeadsCount(start: string, end: string): number {
  return one<{ c: number }>(`SELECT COUNT(*) AS c FROM contacts WHERE date_added >= ? AND date_added < ?`, start, end).c;
}

export function kpiNewLeads(range: DateRange): KpiResult {
  const start = iso(range.start);
  const end = iso(range.end);
  const value = newLeadsCount(start, end);
  const sources = all<{ source: string | null; c: number }>(
    `SELECT source, COUNT(*) AS c FROM contacts WHERE date_added >= ? AND date_added < ? GROUP BY source ORDER BY c DESC LIMIT 5`,
    start,
    end,
  );
  // Bulk-created contacts (25 or more sharing the same minute) are a sign of an import.
  const bulk = one<{ c: number | null }>(
    `SELECT SUM(c) AS c FROM (SELECT substr(date_added, 1, 16) AS minute, COUNT(*) AS c FROM contacts
       WHERE date_added >= ? AND date_added < ? GROUP BY minute HAVING c >= 25)`,
    start,
    end,
  ).c;
  const breakdown: Breakdown[] = sources.map((s) => ({ label: s.source ? `Source: ${s.source}` : "Source: (none)", value: n(s.c) }));
  const notes = ["Counted by contact creation date (GHL dateAdded), unique contact IDs."];
  if (bulk && bulk > 0) {
    breakdown.unshift({ label: "Bulk-created (possible import)", value: n(bulk) });
    notes.push("Bulk-created means 25 or more contacts created within the same minute. This is a name-and-time heuristic, not a GHL import flag.");
  }
  return {
    key: "newLeads",
    title: "New Leads",
    subtitle: range.label,
    format: "count",
    value,
    goal: goalFor("newLeads", range.key),
    prev: newLeadsCount(iso(range.prevStart), iso(range.prevEnd)),
    breakdown,
    notes,
  };
}

// ---- Total Leads Assigned -----------------------------------------------------------

export function kpiLeadsAssigned(range: DateRange): KpiResult {
  const cov = coverage();
  const currently = one<{ c: number }>(`SELECT COUNT(*) AS c FROM contacts WHERE assigned_to IS NOT NULL AND assigned_to != ''`).c;
  const base: KpiResult = {
    key: "leadsAssigned",
    title: "Total Leads Assigned",
    format: "count",
    value: null,
    goal: goalFor("leadsAssigned", range.key),
    prev: null,
    breakdown: [{ label: "Currently assigned leads (snapshot)", value: n(currently) }],
    notes: ["GHL does not expose assignment history. Assignment changes are recorded by this dashboard from its first sync forward."],
  };
  if (!cov.firstCoreSyncAt) {
    return { ...base, unavailableReason: "Assignment tracking has not started yet (no completed sync).", prevUnavailableReason: "No assignment history." };
  }
  if (iso(range.start) < cov.firstCoreSyncAt) {
    return {
      ...base,
      unavailableReason: `Assignment tracking began ${fmtDay(new Date(cov.firstCoreSyncAt))}; this period starts earlier.`,
      prevUnavailableReason: "Comparison period predates assignment tracking.",
    };
  }
  const start = iso(range.start);
  const end = iso(range.end);
  const row = one<{ unique: number; first: number; re: number }>(
    `SELECT COUNT(DISTINCT contact_id) AS unique_c,
            SUM(CASE WHEN from_user IS NULL THEN 1 ELSE 0 END) AS first_c,
            SUM(CASE WHEN from_user IS NOT NULL THEN 1 ELSE 0 END) AS re_c
       FROM assignment_events WHERE to_user IS NOT NULL AND observed_at >= ? AND observed_at < ?`,
    start,
    end,
  ) as unknown as { unique_c: number; first_c: number | null; re_c: number | null };
  const prevRow = iso(range.prevStart) >= cov.firstCoreSyncAt
    ? one<{ c: number }>(`SELECT COUNT(DISTINCT contact_id) AS c FROM assignment_events WHERE to_user IS NOT NULL AND observed_at >= ? AND observed_at < ?`, iso(range.prevStart), iso(range.prevEnd)).c
    : null;
  return {
    ...base,
    value: row.unique_c,
    prev: prevRow,
    prevUnavailableReason: prevRow === null ? "Comparison period predates assignment tracking." : undefined,
    breakdown: [
      { label: "First-time assignments", value: n(row.first_c ?? 0) },
      { label: "Reassignments", value: n(row.re_c ?? 0) },
      ...base.breakdown,
    ],
    notes: [...base.notes, "Unique contacts with an assignment change observed during the period. Event time is the sync that noticed the change (within 15 minutes)."],
  };
}

// ---- Calls Made -----------------------------------------------------------------------

interface CallAgg {
  total: number;
  outbound: number;
  inbound: number;
  automated: number;
  unattributed: number;
  byStatus: { s: string | null; c: number }[];
}

function callAgg(start: string, end: string): CallAgg {
  const row = one<{ total: number; outbound: number; inbound: number; unattributed: number }>(
    `SELECT COUNT(DISTINCT COALESCE(alt_id, id)) AS total,
            COUNT(DISTINCT CASE WHEN direction = 'outbound' THEN COALESCE(alt_id, id) END) AS outbound,
            COUNT(DISTINCT CASE WHEN direction = 'inbound' THEN COALESCE(alt_id, id) END) AS inbound,
            COUNT(DISTINCT CASE WHEN user_id IS NULL OR user_id = '' THEN COALESCE(alt_id, id) END) AS unattributed
       FROM calls WHERE automated = 0 AND date_added >= ? AND date_added < ?`,
    start,
    end,
  );
  const automated = one<{ c: number }>(
    `SELECT COUNT(DISTINCT COALESCE(alt_id, id)) AS c FROM calls WHERE automated = 1 AND date_added >= ? AND date_added < ?`,
    start,
    end,
  ).c;
  const byStatus = all<{ s: string | null; c: number }>(
    `SELECT call_status AS s, COUNT(DISTINCT COALESCE(alt_id, id)) AS c FROM calls WHERE automated = 0 AND date_added >= ? AND date_added < ? GROUP BY call_status ORDER BY c DESC`,
    start,
    end,
  );
  return { ...row, automated, byStatus };
}

export function kpiCallsMade(range: DateRange): KpiResult {
  const cov = coverage();
  const cur = callAgg(iso(range.start), iso(range.end));
  const reason = prevReason(range, cov.historyStart, "Call");
  const prev = reason ? null : callAgg(iso(range.prevStart), iso(range.prevEnd)).total;
  return {
    key: "callsMade",
    title: "Calls Made",
    subtitle: "Human call attempts",
    format: "count",
    value: cur.total,
    goal: goalFor("callsMade", range.key),
    prev,
    prevUnavailableReason: reason,
    breakdown: [
      { label: "Outbound", value: n(cur.outbound) },
      { label: "Inbound", value: n(cur.inbound) },
      ...cur.byStatus.map((s) => ({ label: `Outcome: ${s.s ?? "(none)"}`, value: n(s.c) })),
      { label: "Unattributed (no user)", value: n(cur.unattributed) },
      { label: "Automated / campaign calls (excluded)", value: n(cur.automated) },
    ],
    notes: [
      "One call per call ID (linked legs and repeated updates deduplicated). Automated, campaign, and IVR calls are excluded from the human count.",
    ],
  };
}

// ---- Talk Time -------------------------------------------------------------------------

function talkSeconds(start: string, end: string): { total: number; outbound: number; inbound: number; calls: number } {
  const row = one<{ total: number | null; outbound: number | null; inbound: number | null; calls: number }>(
    `SELECT SUM(d) AS total,
            SUM(CASE WHEN direction = 'outbound' THEN d ELSE 0 END) AS outbound,
            SUM(CASE WHEN direction = 'inbound' THEN d ELSE 0 END) AS inbound,
            COUNT(*) AS calls
       FROM (SELECT COALESCE(alt_id, id) AS k, MAX(duration) AS d, MIN(direction) AS direction
               FROM calls WHERE automated = 0 AND call_status IN ('completed', 'answered') AND duration > 0
                AND date_added >= ? AND date_added < ? GROUP BY k)`,
    start,
    end,
  );
  return { total: row.total ?? 0, outbound: row.outbound ?? 0, inbound: row.inbound ?? 0, calls: row.calls };
}

export function kpiTalkTime(range: DateRange): KpiResult {
  const cov = coverage();
  const cur = talkSeconds(iso(range.start), iso(range.end));
  const reason = prevReason(range, cov.historyStart, "Call");
  const prev = reason ? null : Math.round(talkSeconds(iso(range.prevStart), iso(range.prevEnd)).total / 60);
  return {
    key: "talkTime",
    title: "Talk Time",
    subtitle: "Recorded Call Duration",
    format: "minutes",
    value: Math.round(cur.total / 60),
    goal: goalFor("talkTimeMinutes", range.key),
    prev,
    prevUnavailableReason: reason,
    breakdown: [
      { label: "Outbound", value: fmtMinutes(Math.round(cur.outbound / 60)) },
      { label: "Inbound", value: fmtMinutes(Math.round(cur.inbound / 60)) },
      { label: "Connected calls counted", value: n(cur.calls) },
    ],
    notes: [
      "Sum of GHL call duration on human calls with status completed or answered. Calls GHL flags as voicemail, busy, no-answer, or failed are excluded. A completed status still may include answering-machine pickups GHL did not detect, so this is recorded duration, not verified conversation time.",
    ],
  };
}

export function fmtMinutes(min: number | null): string {
  if (min === null) return "unavailable";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ---- Appointments Booked ---------------------------------------------------------------

function classifyTags(json: string | null): "army" | "veteran" | "both" | "untagged" {
  if (!json) return "untagged";
  let tags: string[] = [];
  try {
    tags = JSON.parse(json) as string[];
  } catch {
    return "untagged";
  }
  const a = mappingConfig.classificationTags.army.some((t) => tags.includes(t));
  const v = mappingConfig.classificationTags.veteran.some((t) => tags.includes(t));
  if (a && v) return "both";
  if (a) return "army";
  if (v) return "veteran";
  return "untagged";
}

function bookedAgg(start: string, end: string) {
  const rows = all<{ id: string; status: string | null; tags: string | null; rescheduled_at: string | null }>(
    `SELECT a.id, a.status, c.tags, a.rescheduled_at FROM appointments a LEFT JOIN contacts c ON c.id = a.contact_id
      WHERE a.deleted = 0 AND a.date_added >= ? AND a.date_added < ?`,
    start,
    end,
  );
  const cls = { army: 0, veteran: 0, both: 0, untagged: 0 };
  const status: Record<string, number> = {};
  let rescheduled = 0;
  for (const r of rows) {
    cls[classifyTags(r.tags)] += 1;
    const s = r.status ?? "(none)";
    status[s] = (status[s] ?? 0) + 1;
    if (r.rescheduled_at) rescheduled += 1;
  }
  return { total: rows.length, cls, status, rescheduled };
}

export function kpiAppointmentsBooked(range: DateRange): KpiResult {
  const cov = coverage();
  const cur = bookedAgg(iso(range.start), iso(range.end));
  const reason = prevReason(range, cov.historyStart, "Appointment");
  const prev = reason ? null : bookedAgg(iso(range.prevStart), iso(range.prevEnd)).total;
  return {
    key: "appointmentsBooked",
    title: "Appointments Booked",
    subtitle: "Bookings created in period",
    format: "count",
    value: cur.total,
    goal: goalFor("appointmentsBooked", range.key),
    prev,
    prevUnavailableReason: reason,
    breakdown: [
      { label: "Army", value: n(cur.cls.army) },
      { label: "Veteran", value: n(cur.cls.veteran) },
      { label: "Both / Needs Review", value: n(cur.cls.both) },
      { label: "Untagged", value: n(cur.cls.untagged) },
      ...Object.entries(cur.status).sort((a, b) => b[1] - a[1]).map(([s, c]) => ({ label: `Status now: ${s}`, value: n(c) })),
      { label: "Rescheduled at least once", value: n(cur.rescheduled) },
    ],
    notes: [
      "Unique appointment IDs by booking creation time, regardless of when the appointment takes place. Cancellations stay in the count; their status is shown separately.",
      "Army / Veteran classification is based on the contact's current tags, not tags at booking time.",
    ],
  };
}

// ---- Appointments Completed -----------------------------------------------------------

function completedAgg(start: string, end: string, asOf: string) {
  const rows = all<{ status: string | null; start_time: string; c: number }>(
    `SELECT status, MIN(start_time) AS start_time, COUNT(*) AS c FROM appointments
      WHERE deleted = 0 AND start_time >= ? AND start_time < ? GROUP BY status`,
    start,
    end,
  );
  let showed = 0;
  let noshow = 0;
  let cancelled = 0;
  let other = 0;
  for (const r of rows) {
    const s = (r.status ?? "").toLowerCase();
    if (s === "showed") showed += r.c;
    else if (s === "noshow" || s === "no-show" || s === "no_show") noshow += r.c;
    else if (s === "cancelled" || s === "canceled") cancelled += r.c;
    else other += r.c;
  }
  const pendingPast = one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM appointments WHERE deleted = 0 AND start_time >= ? AND start_time < ? AND start_time < ?
        AND lower(COALESCE(status, '')) NOT IN ('showed', 'noshow', 'no-show', 'no_show', 'cancelled', 'canceled', 'invalid')`,
    start,
    end,
    asOf,
  ).c;
  return { showed, noshow, cancelled, other, pendingPast };
}

export function kpiAppointmentsCompleted(range: DateRange): KpiResult {
  const cov = coverage();
  const asOf = iso(range.asOf);
  const cur = completedAgg(iso(range.start), iso(range.end), asOf);
  const reason = prevReason(range, cov.historyStart, "Appointment");
  const prev = reason ? null : completedAgg(iso(range.prevStart), iso(range.prevEnd), asOf).showed;
  return {
    key: "appointmentsCompleted",
    title: "Appointments Completed",
    subtitle: "Scheduled in period and marked Showed",
    format: "count",
    value: cur.showed,
    goal: goalFor("appointmentsCompleted", range.key),
    prev,
    prevUnavailableReason: reason,
    breakdown: [
      { label: "No-show", value: n(cur.noshow) },
      { label: "Cancelled", value: n(cur.cancelled) },
      { label: "Past start, attendance not yet marked", value: n(cur.pendingPast) },
      { label: "Other / upcoming", value: n(cur.other - cur.pendingPast) },
    ],
    notes: ["Only an explicit Showed status counts. A past start time or a completed call never counts as attendance."],
  };
}

export function computePrimaryKpis(range: DateRange): KpiResult[] {
  return [
    kpiLeadsAssigned(range),
    kpiNewLeads(range),
    kpiCallsMade(range),
    kpiTalkTime(range),
    kpiAppointmentsBooked(range),
    kpiAppointmentsCompleted(range),
  ];
}

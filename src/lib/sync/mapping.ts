// The "mapping" sync: a set of read-only probes that discover what the
// connected GHL account actually contains (pipelines, stages, users, tags,
// fields, calendars, appointment statuses, call fields, money fields, history
// coverage) and which endpoints the token may read.
//
// Only aggregates are stored for appointments, opportunities, calls, and
// contacts. No individual contact data is kept in the mapping snapshot.

import { finishSyncRun, startSyncRun, upsertSnapshot } from "@/lib/db";
import type { ErrorKind, GhlResult } from "@/lib/ghl/http";
import * as ghl from "@/lib/ghl/read";
import { mappingConfig } from "@/lib/mapping-config";

export const MAPPING_SYNC_KIND = "mapping";
export const KEY_PREFIX = "mapping:";

export interface ProbeOutcome {
  key: string;
  label: string;
  ok: boolean;
  status: number | null;
  kind?: ErrorKind | "skipped";
  error?: string;
}

// ---- snapshot payload shapes (what the page reads back) ----------------------

export interface LocationSnapshot {
  id: string;
  name?: string;
  timezone?: string;
  country?: string;
}

export interface PipelinesSnapshot {
  pipelines: {
    id: string;
    name: string;
    dateAdded?: string;
    dateUpdated?: string;
    stages: { id: string; name: string; position?: number }[];
  }[];
}

export interface UsersSnapshot {
  users: { id: string; name: string; email?: string; role?: string; type?: string; deleted: boolean }[];
}

export interface TagsSnapshot {
  tags: { id: string; name: string }[];
}

export interface CustomFieldsSnapshot {
  fields: { id: string; name: string; fieldKey?: string; dataType?: string; model?: string; options?: string[] }[];
}

export interface CalendarsSnapshot {
  calendars: {
    id: string;
    name: string;
    isActive?: boolean;
    calendarType?: string;
    eventType?: string;
    teamMemberIds: string[];
  }[];
}

export interface AppointmentsSnapshot {
  windowStart: string;
  windowEnd: string;
  calendarsQueried: number;
  calendarsFailed: { id: string; name: string; error: string }[];
  totalEvents: number;
  byStatus: Record<string, number>;
  byCalendar: { id: string; name: string; count: number }[];
  earliestStart?: string;
  latestStart?: string;
  fieldPresence: {
    assignedUserId: number;
    createdBy: number;
    masterEventId: number;
    dateAdded: number;
    contactId: number;
  };
}

export interface OpportunitiesSnapshot {
  pipelines: {
    pipelineId: string;
    pipelineName: string;
    totalAll: number | null;
    byStatus: Record<string, number | null>;
    byStatusError?: string;
    sampleSize: number;
    sample: {
      withValue: number;
      zeroValue: number;
      missingValue: number;
      withAssignedTo: number;
      withLastStageChangeAt: number;
      withLastStatusChangeAt: number;
      withCustomFields: number;
      createdMin?: string;
      createdMax?: string;
      statuses: Record<string, number>;
    };
    earliestCreatedAt?: string;
    earliestError?: string;
  }[];
}

export interface StageCountsSnapshot {
  stages: {
    stageId: string;
    stageName: string;
    pipelineId: string;
    label: string;
    kind: "milestone" | "funnel_only";
    totalAll: number | null;
    totalWon: number | null;
    error?: string;
  }[];
}

export interface CallsSnapshot {
  windowStart?: string;
  windowEnd?: string;
  dateFilterApplied: boolean;
  dateFilterNote?: string;
  total?: number;
  sampled: number;
  byDirection: Record<string, number>;
  byCallStatus: Record<string, number>;
  byMessageType: Record<string, number>;
  bySource: Record<string, number>;
  withDuration: number;
  withUserId: number;
  earliest?: string;
  latest?: string;
}

export interface ContactsSnapshot {
  total?: number;
}

// ---- helpers -------------------------------------------------------------------

function record<T>(key: string, label: string, res: GhlResult<T>, payload?: unknown): ProbeOutcome {
  const fetchedAt = new Date().toISOString();
  if (res.ok) {
    upsertSnapshot({ key: KEY_PREFIX + key, label, fetched_at: fetchedAt, ok: 1, status: res.status, error_kind: null, error: null, payload });
    return { key, label, ok: true, status: res.status };
  }
  upsertSnapshot({ key: KEY_PREFIX + key, label, fetched_at: fetchedAt, ok: 0, status: res.status, error_kind: res.kind, error: res.error, payload: undefined });
  return { key, label, ok: false, status: res.status, kind: res.kind, error: res.error };
}

function recordComputed(key: string, label: string, payload: unknown): ProbeOutcome {
  upsertSnapshot({ key: KEY_PREFIX + key, label, fetched_at: new Date().toISOString(), ok: 1, status: null, error_kind: null, error: null, payload });
  return { key, label, ok: true, status: null };
}

function recordSkipped(key: string, label: string, reason: string): ProbeOutcome {
  upsertSnapshot({ key: KEY_PREFIX + key, label, fetched_at: new Date().toISOString(), ok: 0, status: null, error_kind: "skipped", error: reason, payload: undefined });
  return { key, label, ok: false, status: null, kind: "skipped", error: reason };
}

function bump(map: Record<string, number>, key: string | undefined | null): void {
  const k = key === undefined || key === null || key === "" ? "(missing)" : String(key);
  map[k] = (map[k] ?? 0) + 1;
}

function asIso(value: unknown): string | undefined {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  return undefined;
}

function minIso(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function maxIso(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

// ---- the sync ---------------------------------------------------------------------

export async function runMappingSync(): Promise<{ runId: number; ok: boolean; probes: ProbeOutcome[] }> {
  const runId = startSyncRun(MAPPING_SYNC_KIND);
  const probes: ProbeOutcome[] = [];
  const now = Date.now();

  // 1. Account details
  const loc = await ghl.getLocation();
  probes.push(
    record<{ location: ghl.GhlLocation }>("location", "Account (location) details", loc,
      loc.ok ? ({ id: loc.data.location.id, name: loc.data.location.name, timezone: loc.data.location.timezone, country: loc.data.location.country } satisfies LocationSnapshot) : undefined),
  );

  // 2. Pipelines and stages
  const pipes = await ghl.getPipelines();
  probes.push(
    record("pipelines", "Pipelines and stages", pipes,
      pipes.ok
        ? ({ pipelines: pipes.data.pipelines.map((p) => ({ id: p.id, name: p.name, dateAdded: p.dateAdded, dateUpdated: p.dateUpdated, stages: (p.stages ?? []).map((s) => ({ id: s.id, name: s.name, position: s.position })) })) } satisfies PipelinesSnapshot)
        : undefined),
  );

  // 3. Users (team members)
  const users = await ghl.getUsers();
  probes.push(
    record("users", "Users (team members)", users,
      users.ok
        ? ({ users: users.data.users.map((u) => ({ id: u.id, name: u.name ?? [u.firstName, u.lastName].filter(Boolean).join(" ") ?? "", email: u.email, role: u.roles?.role, type: u.roles?.type, deleted: Boolean(u.deleted) })) } satisfies UsersSnapshot)
        : undefined),
  );

  // 4. Tags
  const tags = await ghl.getTags();
  probes.push(
    record("tags", "Contact tags", tags,
      tags.ok ? ({ tags: tags.data.tags.map((t) => ({ id: t.id, name: t.name })) } satisfies TagsSnapshot) : undefined),
  );

  // 5. Custom fields (contact + opportunity)
  const fields = await ghl.getCustomFields("all");
  probes.push(
    record("customFields", "Custom fields (contact and opportunity)", fields,
      fields.ok
        ? ({ fields: fields.data.customFields.map((f) => ({ id: f.id, name: f.name, fieldKey: f.fieldKey, dataType: f.dataType, model: f.model, options: Array.isArray(f.picklistOptions) ? (f.picklistOptions as unknown[]).map((o) => (typeof o === "string" ? o : JSON.stringify(o))).slice(0, 50) : undefined })) } satisfies CustomFieldsSnapshot)
        : undefined),
  );

  // 6. Calendars
  const cals = await ghl.getCalendars();
  probes.push(
    record("calendars", "Calendars", cals,
      cals.ok
        ? ({ calendars: cals.data.calendars.map((c) => ({ id: c.id, name: c.name, isActive: c.isActive, calendarType: c.calendarType, eventType: c.eventType, teamMemberIds: (c.teamMembers ?? []).map((m) => m.userId) })) } satisfies CalendarsSnapshot)
        : undefined),
  );

  // 7. Appointment statuses actually in use (last 90 days + next 30 days)
  if (!cals.ok) {
    probes.push(recordSkipped("appointments", "Appointment statuses in use", "Skipped because the calendars list could not be read."));
  } else {
    const windowStart = now - 90 * 86400000;
    const windowEnd = now + 30 * 86400000;
    const snap: AppointmentsSnapshot = {
      windowStart: new Date(windowStart).toISOString(),
      windowEnd: new Date(windowEnd).toISOString(),
      calendarsQueried: 0,
      calendarsFailed: [],
      totalEvents: 0,
      byStatus: {},
      byCalendar: [],
      fieldPresence: { assignedUserId: 0, createdBy: 0, masterEventId: 0, dateAdded: 0, contactId: 0 },
    };
    let firstError: GhlResult<unknown> | undefined;
    for (const c of cals.data.calendars) {
      const ev = await ghl.getCalendarEvents(c.id, windowStart, windowEnd);
      snap.calendarsQueried += 1;
      if (!ev.ok) {
        snap.calendarsFailed.push({ id: c.id, name: c.name, error: ev.error });
        firstError ??= ev;
        continue;
      }
      const events = ev.data.events ?? [];
      snap.byCalendar.push({ id: c.id, name: c.name, count: events.length });
      for (const e of events) {
        snap.totalEvents += 1;
        bump(snap.byStatus, e.appointmentStatus);
        if (e.assignedUserId) snap.fieldPresence.assignedUserId += 1;
        if (e.createdBy) snap.fieldPresence.createdBy += 1;
        if (e.masterEventId) snap.fieldPresence.masterEventId += 1;
        if (e.dateAdded) snap.fieldPresence.dateAdded += 1;
        if (e.contactId) snap.fieldPresence.contactId += 1;
        const st = asIso(e.startTime);
        snap.earliestStart = minIso(snap.earliestStart, st);
        snap.latestStart = maxIso(snap.latestStart, st);
      }
    }
    if (snap.calendarsFailed.length === snap.calendarsQueried && firstError && !firstError.ok) {
      probes.push(record("appointments", "Appointment statuses in use", firstError, undefined));
    } else {
      probes.push(recordComputed("appointments", "Appointment statuses in use", snap));
    }
  }

  // 8. Contacts (access check + total only; no contact data stored)
  const contacts = await ghl.getContactsPage(1);
  probes.push(
    record("contacts", "Contacts (access check and total)", contacts,
      contacts.ok ? ({ total: contacts.data.meta?.total } satisfies ContactsSnapshot) : undefined),
  );

  // 9. Opportunities per pipeline: totals by status, sample field coverage, earliest record
  const pipelineList = pipes.ok
    ? pipes.data.pipelines.map((p) => ({ id: p.id, name: p.name }))
    : [
        ...Object.values(mappingConfig.programs).map((p) => ({ id: p.pipelineId, name: p.pipelineName })),
        ...mappingConfig.nonProgramPipelines.map((p) => ({ id: p.pipelineId, name: p.pipelineName })),
      ];
  const oppSnap: OpportunitiesSnapshot = { pipelines: [] };
  let oppFirstError: GhlResult<unknown> | undefined;
  let oppAnyOk = false;
  for (const p of pipelineList) {
    const entry: OpportunitiesSnapshot["pipelines"][number] = {
      pipelineId: p.id,
      pipelineName: p.name,
      totalAll: null,
      byStatus: {},
      sampleSize: 0,
      sample: { withValue: 0, zeroValue: 0, missingValue: 0, withAssignedTo: 0, withLastStageChangeAt: 0, withLastStatusChangeAt: 0, withCustomFields: 0, statuses: {} },
    };
    const sample = await ghl.searchOpportunities({ pipelineId: p.id, status: "all", limit: 100 });
    if (!sample.ok) {
      oppFirstError ??= sample;
      entry.byStatusError = sample.error;
      oppSnap.pipelines.push(entry);
      continue;
    }
    oppAnyOk = true;
    entry.totalAll = sample.data.meta?.total ?? null;
    const opps = sample.data.opportunities ?? [];
    entry.sampleSize = opps.length;
    for (const o of opps) {
      const v = o.monetaryValue;
      if (v === null || v === undefined) entry.sample.missingValue += 1;
      else if (Number(v) === 0) entry.sample.zeroValue += 1;
      else entry.sample.withValue += 1;
      if (o.assignedTo) entry.sample.withAssignedTo += 1;
      if (o.lastStageChangeAt) entry.sample.withLastStageChangeAt += 1;
      if (o.lastStatusChangeAt) entry.sample.withLastStatusChangeAt += 1;
      if (Array.isArray(o.customFields) && o.customFields.length > 0) entry.sample.withCustomFields += 1;
      bump(entry.sample.statuses, o.status);
      const c = asIso(o.createdAt);
      entry.sample.createdMin = minIso(entry.sample.createdMin, c);
      entry.sample.createdMax = maxIso(entry.sample.createdMax, c);
    }
    for (const status of ["open", "won", "lost", "abandoned"] as const) {
      const r = await ghl.searchOpportunities({ pipelineId: p.id, status, limit: 1 });
      entry.byStatus[status] = r.ok ? (r.data.meta?.total ?? null) : null;
      if (!r.ok) entry.byStatusError = r.error;
    }
    const earliest = await ghl.searchOpportunities({ pipelineId: p.id, status: "all", order: "added_asc", limit: 1 });
    if (earliest.ok) entry.earliestCreatedAt = asIso(earliest.data.opportunities?.[0]?.createdAt);
    else entry.earliestError = earliest.error;
    oppSnap.pipelines.push(entry);
  }
  if (!oppAnyOk && oppFirstError && !oppFirstError.ok) {
    probes.push(record("opportunities", "Opportunities (totals, value coverage, history)", oppFirstError, undefined));
  } else {
    probes.push(recordComputed("opportunities", "Opportunities (totals, value coverage, history)", oppSnap));
  }

  // 10. Current counts in each mapped milestone stage (snapshot, not achievements)
  const stageTargets = [
    ...mappingConfig.milestones.map((m) => ({ stageId: m.stageId, stageName: m.stageName, pipelineId: m.pipelineId, label: m.label, kind: "milestone" as const })),
    ...mappingConfig.funnelOnlyStages.map((s) => ({ stageId: s.stageId, stageName: s.stageName, pipelineId: s.pipelineId, label: s.stageName, kind: "funnel_only" as const })),
  ];
  const stageSnap: StageCountsSnapshot = { stages: [] };
  let stageAnyOk = false;
  let stageFirstError: GhlResult<unknown> | undefined;
  for (const t of stageTargets) {
    const all = await ghl.searchOpportunities({ pipelineId: t.pipelineId, stageId: t.stageId, status: "all", limit: 1 });
    const won = await ghl.searchOpportunities({ pipelineId: t.pipelineId, stageId: t.stageId, status: "won", limit: 1 });
    if (all.ok || won.ok) stageAnyOk = true;
    if (!all.ok) stageFirstError ??= all;
    stageSnap.stages.push({
      ...t,
      totalAll: all.ok ? (all.data.meta?.total ?? null) : null,
      totalWon: won.ok ? (won.data.meta?.total ?? null) : null,
      error: !all.ok ? all.error : !won.ok ? won.error : undefined,
    });
  }
  if (!stageAnyOk && stageFirstError && !stageFirstError.ok) {
    probes.push(record("stageCounts", "Current counts in mapped stages", stageFirstError, undefined));
  } else {
    probes.push(recordComputed("stageCounts", "Current counts in mapped stages", stageSnap));
  }

  // 11. Calls: what fields the account's call records actually carry (last 30 days)
  const callStart = new Date(now - 30 * 86400000).toISOString();
  const callEnd = new Date(now).toISOString();
  let calls = await ghl.exportMessages({ channel: "Call", limit: 100, startDate: callStart, endDate: callEnd, sortBy: "createdAt", sortOrder: "desc" });
  let dateFilterApplied = true;
  let dateFilterNote: string | undefined;
  if (!calls.ok && calls.kind === "bad_request") {
    dateFilterApplied = false;
    dateFilterNote = `GHL rejected the date filter (${calls.error}); showing the most recent 100 calls instead.`;
    calls = await ghl.exportMessages({ channel: "Call", limit: 100, sortBy: "createdAt", sortOrder: "desc" });
  }
  if (!calls.ok) {
    probes.push(record("calls", "Call records (fields in use)", calls, undefined));
  } else {
    const snap: CallsSnapshot = {
      windowStart: dateFilterApplied ? callStart : undefined,
      windowEnd: dateFilterApplied ? callEnd : undefined,
      dateFilterApplied,
      dateFilterNote,
      total: calls.data.total,
      sampled: 0,
      byDirection: {},
      byCallStatus: {},
      byMessageType: {},
      bySource: {},
      withDuration: 0,
      withUserId: 0,
    };
    for (const m of calls.data.messages ?? []) {
      snap.sampled += 1;
      bump(snap.byDirection, m.direction);
      // Live data nests status under meta.call; the spec says meta.callStatus;
      // the top-level status field mirrors it. Read the first one present.
      bump(snap.byCallStatus, m.meta?.call?.status ?? m.meta?.callStatus ?? m.status);
      bump(snap.byMessageType, m.messageType);
      bump(snap.bySource, m.source);
      const d = m.meta?.call?.duration ?? m.meta?.callDuration;
      if (d !== undefined && d !== null && d !== "" && Number(d) > 0) snap.withDuration += 1;
      if (m.userId) snap.withUserId += 1;
      const at = asIso(m.dateAdded);
      snap.earliest = minIso(snap.earliest, at);
      snap.latest = maxIso(snap.latest, at);
    }
    probes.push(recordComputed("calls", "Call records (fields in use)", snap));
  }

  const okCount = probes.filter((p) => p.ok).length;
  const ok = okCount === probes.length;
  const summary = ok
    ? `All ${probes.length} probes succeeded.`
    : `${okCount} of ${probes.length} probes succeeded. Failed: ${probes.filter((p) => !p.ok).map((p) => p.label).join("; ")}`;
  finishSyncRun(runId, ok, probes.length, okCount, summary);
  return { runId, ok, probes };
}

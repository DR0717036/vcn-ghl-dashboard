// One-way merge of event history recorded on another copy of this dashboard
// (the owner's PC, which synced since 2026-10-11) into this cache. Only the
// three event tables and the first-sync marker are touched; nothing here
// reads or writes Go High Level. Events the host already captured are kept,
// not duplicated:
//   - milestone_events: exact key (kind, milestone_key, opportunity_id,
//     event_time) wins; a host "baseline" row for an event the other copy
//     saw happen is upgraded to a real event; a same-event row whose time
//     differs by less than 36 hours is treated as the same event.
//   - opportunity_history / assignment_events: rows observed before this
//     host's first sync are new to it; later rows are skipped when the host
//     has a matching row within 36 hours.

import { getDb, getState, setState } from "@/lib/db";

const NEAR_MS = 36 * 60 * 60 * 1000;
const MAX_ROWS = 250_000;

export interface MilestoneEventRow {
  kind: string;
  milestone_key: string | null;
  contact_id: string | null;
  opportunity_id: string;
  pipeline_id: string;
  stage_id: string;
  reporting_group: string | null;
  event_time: string;
  time_basis: string;
  observed_at: string;
  assigned_to_at_event: string | null;
  value_at_event: number | null;
  is_baseline: number;
}
export interface AssignmentEventRow {
  contact_id: string;
  from_user: string | null;
  to_user: string | null;
  observed_at: string;
}
export interface OpportunityHistoryRow {
  opportunity_id: string;
  observed_at: string;
  pipeline_id: string;
  stage_id: string;
  status: string;
  assigned_to: string | null;
  monetary_value: number | null;
  change_kind: string;
}
export interface HistoryExport {
  exportedAt: string;
  firstCoreSyncAt: string | null;
  milestone_events: MilestoneEventRow[];
  assignment_events: AssignmentEventRow[];
  opportunity_history: OpportunityHistoryRow[];
}

export interface TableResult {
  received: number;
  inserted: number;
  upgraded: number;
  skippedExact: number;
  skippedNear: number;
}
export interface ImportResult {
  dryRun: boolean;
  hostFirstCoreSyncAt: { before: string | null; after: string | null };
  milestone_events: TableResult;
  assignment_events: TableResult;
  opportunity_history: TableResult;
}

const isIso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v);
const optStr = (v: unknown): v is string | null => v === null || (typeof v === "string" && v.length <= 200);
const str = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200;
const optNum = (v: unknown): v is number | null => v === null || (typeof v === "number" && Number.isFinite(v));

/** Throws a plain-English message when the payload is not a history export. */
export function validateExport(body: unknown): HistoryExport {
  const b = body as Partial<HistoryExport> | null;
  if (!b || typeof b !== "object") throw new Error("Body must be a JSON object.");
  if (b.firstCoreSyncAt !== null && !isIso(b.firstCoreSyncAt)) throw new Error("firstCoreSyncAt must be an ISO time or null.");
  const arr = (name: keyof HistoryExport) => {
    const v = b[name];
    if (!Array.isArray(v)) throw new Error(`${name} must be an array.`);
    if (v.length > MAX_ROWS) throw new Error(`${name} has more than ${MAX_ROWS} rows.`);
    return v as unknown[];
  };
  const me = arr("milestone_events").map((r, i) => {
    const x = r as MilestoneEventRow;
    if (!str(x.kind) || !optStr(x.milestone_key) || !optStr(x.contact_id) || !str(x.opportunity_id) || !str(x.pipeline_id) || !str(x.stage_id) || !optStr(x.reporting_group) || !isIso(x.event_time) || !str(x.time_basis) || !isIso(x.observed_at) || !optStr(x.assigned_to_at_event) || !optNum(x.value_at_event) || (x.is_baseline !== 0 && x.is_baseline !== 1)) {
      throw new Error(`milestone_events row ${i} is malformed.`);
    }
    return x;
  });
  const ae = arr("assignment_events").map((r, i) => {
    const x = r as AssignmentEventRow;
    if (!str(x.contact_id) || !optStr(x.from_user) || !optStr(x.to_user) || !isIso(x.observed_at)) throw new Error(`assignment_events row ${i} is malformed.`);
    return x;
  });
  const oh = arr("opportunity_history").map((r, i) => {
    const x = r as OpportunityHistoryRow;
    if (!str(x.opportunity_id) || !isIso(x.observed_at) || !str(x.pipeline_id) || !str(x.stage_id) || !str(x.status) || !optStr(x.assigned_to) || !optNum(x.monetary_value) || !str(x.change_kind)) {
      throw new Error(`opportunity_history row ${i} is malformed.`);
    }
    return x;
  });
  return { exportedAt: isIso(b.exportedAt) ? b.exportedAt : new Date().toISOString(), firstCoreSyncAt: b.firstCoreSyncAt ?? null, milestone_events: me, assignment_events: ae, opportunity_history: oh };
}

const empty = (received: number): TableResult => ({ received, inserted: 0, upgraded: 0, skippedExact: 0, skippedNear: 0 });
const near = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) < NEAR_MS;

export function importHistory(data: HistoryExport, dryRun: boolean): ImportResult {
  const db = getDb();
  const hostFirst = getState("first_core_sync_at") ?? null;
  const result: ImportResult = {
    dryRun,
    hostFirstCoreSyncAt: { before: hostFirst, after: hostFirst },
    milestone_events: empty(data.milestone_events.length),
    assignment_events: empty(data.assignment_events.length),
    opportunity_history: empty(data.opportunity_history.length),
  };

  const selExact = db.prepare(`SELECT id, is_baseline FROM milestone_events WHERE kind = ? AND milestone_key IS ? AND opportunity_id = ? AND event_time = ?`);
  const selNear = db.prepare(`SELECT event_time FROM milestone_events WHERE kind = ? AND milestone_key IS ? AND opportunity_id = ?`);
  const insEvent = db.prepare(`INSERT INTO milestone_events (kind, milestone_key, contact_id, opportunity_id, pipeline_id, stage_id, reporting_group, event_time, time_basis, observed_at, assigned_to_at_event, value_at_event, is_baseline) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const upgrade = db.prepare(`UPDATE milestone_events SET is_baseline = 0, observed_at = ?, time_basis = ?, assigned_to_at_event = ?, value_at_event = ?, reporting_group = ? WHERE id = ?`);
  const selHist = db.prepare(`SELECT observed_at FROM opportunity_history WHERE opportunity_id = ? AND stage_id = ? AND status = ? AND COALESCE(assigned_to, '') = COALESCE(?, '') AND change_kind = ?`);
  const insHist = db.prepare(`INSERT INTO opportunity_history (opportunity_id, observed_at, pipeline_id, stage_id, status, assigned_to, monetary_value, change_kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const selAssign = db.prepare(`SELECT observed_at FROM assignment_events WHERE contact_id = ? AND COALESCE(from_user, '') = COALESCE(?, '') AND COALESCE(to_user, '') = COALESCE(?, '')`);
  const insAssign = db.prepare(`INSERT INTO assignment_events (contact_id, from_user, to_user, observed_at) VALUES (?, ?, ?, ?)`);

  db.exec("BEGIN IMMEDIATE");
  try {
    for (const r of data.milestone_events) {
      const t = result.milestone_events;
      const exact = selExact.get(r.kind, r.milestone_key, r.opportunity_id, r.event_time) as { id: number; is_baseline: number } | undefined;
      if (exact) {
        if (exact.is_baseline === 1 && r.is_baseline === 0) {
          if (!dryRun) upgrade.run(r.observed_at, r.time_basis, r.assigned_to_at_event, r.value_at_event, r.reporting_group, exact.id);
          t.upgraded += 1;
        } else t.skippedExact += 1;
        continue;
      }
      const others = selNear.all(r.kind, r.milestone_key, r.opportunity_id) as { event_time: string }[];
      if (others.some((o) => near(o.event_time, r.event_time))) {
        t.skippedNear += 1;
        continue;
      }
      if (!dryRun) insEvent.run(r.kind, r.milestone_key, r.contact_id, r.opportunity_id, r.pipeline_id, r.stage_id, r.reporting_group, r.event_time, r.time_basis, r.observed_at, r.assigned_to_at_event, r.value_at_event, r.is_baseline);
      t.inserted += 1;
    }

    // Host rows can predate its first-sync marker (an interrupted first run
    // still commits per page), so every row is checked against the host.
    for (const r of data.opportunity_history) {
      const t = result.opportunity_history;
      const others = selHist.all(r.opportunity_id, r.stage_id, r.status, r.assigned_to, r.change_kind) as { observed_at: string }[];
      if (others.some((o) => o.observed_at === r.observed_at)) {
        t.skippedExact += 1;
        continue;
      }
      if (others.some((o) => near(o.observed_at, r.observed_at))) {
        t.skippedNear += 1;
        continue;
      }
      if (!dryRun) insHist.run(r.opportunity_id, r.observed_at, r.pipeline_id, r.stage_id, r.status, r.assigned_to, r.monetary_value, r.change_kind);
      t.inserted += 1;
    }

    for (const r of data.assignment_events) {
      const t = result.assignment_events;
      const others = selAssign.all(r.contact_id, r.from_user, r.to_user) as { observed_at: string }[];
      if (others.some((o) => o.observed_at === r.observed_at)) {
        t.skippedExact += 1;
        continue;
      }
      if (others.some((o) => near(o.observed_at, r.observed_at))) {
        t.skippedNear += 1;
        continue;
      }
      if (!dryRun) insAssign.run(r.contact_id, r.from_user, r.to_user, r.observed_at);
      t.inserted += 1;
    }

    if (data.firstCoreSyncAt && (!hostFirst || data.firstCoreSyncAt < hostFirst)) {
      if (!dryRun) setState("first_core_sync_at", data.firstCoreSyncAt);
      result.hostFirstCoreSyncAt.after = data.firstCoreSyncAt;
    }

    if (dryRun) db.exec("ROLLBACK");
    else db.exec("COMMIT");
  } catch (e) {
    try {
      if (db.isTransaction) db.exec("ROLLBACK");
    } catch {
      // already rolled back
    }
    throw e;
  }
  return result;
}

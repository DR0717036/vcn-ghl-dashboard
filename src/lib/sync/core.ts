// The core sync: pulls contacts, opportunities, calls, and appointments from
// GHL (read-only) into the local cache every 15 minutes, and turns observed
// changes into EVENTS (assignment changes, milestone entries, won
// transitions). Snapshots and events are kept separate on purpose.
//
// Timestamp rules (brief section 6):
// - A milestone/won event dated from GHL's own lastStageChangeAt /
//   lastStatusChangeAt carries time_basis "ghl_last_*_change".
// - A change we only noticed between two syncs, with no newer GHL timestamp,
//   is dated at the sync time with time_basis "observed".
// - Rows present at the very first successful sync are baseline
//   (is_baseline = 1). Their event_time still comes from GHL, never from the
//   connection date.

import { finishSyncRun, getDb, getState, setState, startSyncRun } from "@/lib/db";
import * as ghl from "@/lib/ghl/read";
import { mappingConfig, type MilestoneMapping , trackedMilestones } from "@/lib/mapping-config";

export const CORE_SYNC_KIND = "core";
/** Calls and appointments are loaded from this instant forward. */
export const HISTORY_START = "2026-01-01T00:00:00.000Z";

export interface PhaseResult {
  phase: string;
  ok: boolean;
  count: number;
  error?: string;
  warnings: string[];
}

// Next.js bundles the scheduler (instrumentation) and API routes separately,
// so a module-level flag is not shared between them. The lock therefore lives
// in the database: an unfinished core run younger than STALE_MS means running.
const STALE_MS = 90 * 60 * 1000;
let running = false;

export function isCoreSyncRunning(): boolean {
  if (running) return true;
  const row = getDb()
    .prepare(`SELECT started_at FROM sync_runs WHERE kind = ? AND finished_at IS NULL ORDER BY id DESC LIMIT 1`)
    .get(CORE_SYNC_KIND) as { started_at: string } | undefined;
  if (!row) return false;
  if (Date.now() - Date.parse(row.started_at) < STALE_MS) return true;
  // A run that never finished (server stopped mid-sync) is closed as failed.
  getDb()
    .prepare(`UPDATE sync_runs SET finished_at = ?, ok = 0, summary = ? WHERE kind = ? AND finished_at IS NULL`)
    .run(new Date().toISOString(), "Abandoned: the server stopped before the sync finished.", CORE_SYNC_KIND);
  return false;
}

function isoOrNull(v: unknown): string | null {
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v).toISOString();
  return null;
}

function normTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.filter((t): t is string => typeof t === "string").map((t) => t.trim().toLowerCase()).filter(Boolean);
}

function classify(tags: string[] | undefined): "army" | "veteran" | "both" | "untagged" | "unknown" {
  if (!tags) return "unknown";
  const isArmy = mappingConfig.classificationTags.army.some((t) => tags.includes(t));
  const isVet = mappingConfig.classificationTags.veteran.some((t) => tags.includes(t));
  if (isArmy && isVet) return "both";
  if (isArmy) return "army";
  if (isVet) return "veteran";
  return "untagged";
}

function reportingGroupFor(m: MilestoneMapping, contactTags: string[] | undefined): string {
  if (m.reportingGroupBasis === "stage_name") return m.reportingGroup;
  if (m.reportingGroupBasis === "contact_tag") {
    const matches = Object.entries(mappingConfig.reportingGroups)
      .filter(([, g]) => g.program === m.program && g.tag && contactTags?.includes(g.tag))
      .map(([key]) => key);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return "ambiguous";
    return "unclassified";
  }
  return "unclassified";
}

export async function runCoreSync(): Promise<{ runId: number; ok: boolean; phases: PhaseResult[] }> {
  if (isCoreSyncRunning()) throw new Error("A core sync is already running.");
  running = true;
  const db = getDb();
  const runId = startSyncRun(CORE_SYNC_KIND);
  const runStart = new Date().toISOString();
  const firstSyncDone = Boolean(getState("first_core_sync_at"));
  const phases: PhaseResult[] = [];

  const PHASES = 5;
  try {
    phases.push(await syncUsers(runStart));
    phases.push(await syncContacts(runStart, firstSyncDone));
    phases.push(await syncOpportunities(runStart, firstSyncDone));
    phases.push(await syncCalls(runStart));
    phases.push(await syncAppointments(runStart));
  } finally {
    const okCount = phases.filter((p) => p.ok).length;
    const ok = phases.length === PHASES && okCount === PHASES;
    const summary = ok
      ? `All ${PHASES} phases succeeded (${phases.map((p) => `${p.phase} ${p.count}`).join(", ")}).`
      : `${okCount} of ${phases.length} phases succeeded. ` + phases.filter((p) => !p.ok).map((p) => `${p.phase}: ${p.error}`).join("; ");
    finishSyncRun(runId, ok, PHASES, okCount, summary);
    if (ok) {
      if (!firstSyncDone) setState("first_core_sync_at", runStart);
      setState("last_core_sync_ok_at", runStart);
    }
    running = false;
  }
  return { runId, ok: phases.every((p) => p.ok), phases };
}

// ---- users (team members, for rep names) ----------------------------------------

async function syncUsers(now: string): Promise<PhaseResult> {
  const db = getDb();
  const res: PhaseResult = { phase: "users", ok: false, count: 0, warnings: [] };
  const up = db.prepare(`
    INSERT INTO users (id, name, email, role, deleted, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email, role = excluded.role,
      deleted = excluded.deleted, last_seen_at = excluded.last_seen_at`);
  try {
    const r = await ghl.getUsers();
    if (!r.ok) throw new Error(`${r.kind}: ${r.error}`);
    db.exec("BEGIN");
    try {
      for (const u of r.data.users ?? []) {
        const name = (u.name ?? [u.firstName, u.lastName].filter(Boolean).join(" ")).trim() || null;
        up.run(u.id, name, u.email ?? null, [u.roles?.type, u.roles?.role].filter(Boolean).join("/") || null, u.deleted ? 1 : 0, now);
        res.count += 1;
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    res.ok = true;
  } catch (e) {
    res.error = (e as Error).message;
  }
  return res;
}

// ---- contacts --------------------------------------------------------------------

async function syncContacts(now: string, firstSyncDone: boolean): Promise<PhaseResult> {
  const db = getDb();
  const res: PhaseResult = { phase: "contacts", ok: false, count: 0, warnings: [] };
  const sel = db.prepare(`SELECT assigned_to FROM contacts WHERE id = ?`);
  const up = db.prepare(`
    INSERT INTO contacts (id, name, date_added, date_updated, assigned_to, source, tags, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, date_added = excluded.date_added, date_updated = excluded.date_updated,
      assigned_to = excluded.assigned_to, source = excluded.source, tags = excluded.tags,
      last_seen_at = excluded.last_seen_at`);
  const insAssign = db.prepare(`INSERT INTO assignment_events (contact_id, from_user, to_user, observed_at) VALUES (?, ?, ?, ?)`);

  try {
    let cursor: { startAfterId: string; startAfter: number } | undefined;
    for (let page = 0; page < 5000; page++) {
      const r = await ghl.listContacts(cursor);
      if (!r.ok) throw new Error(`${r.kind}: ${r.error}`);
      const contacts = r.data.contacts ?? [];
      db.exec("BEGIN");
      try {
        for (const c of contacts) {
          const assigned = c.assignedTo ? String(c.assignedTo) : null;
          const prev = sel.get(c.id) as { assigned_to: string | null } | undefined;
          if (prev) {
            if (firstSyncDone && (prev.assigned_to ?? null) !== assigned) insAssign.run(c.id, prev.assigned_to, assigned, now);
          } else if (firstSyncDone && assigned) {
            insAssign.run(c.id, null, assigned, now);
          }
          const name = (c.contactName ?? [c.firstName, c.lastName].filter(Boolean).join(" ")).trim() || null;
          up.run(c.id, name, isoOrNull(c.dateAdded), isoOrNull(c.dateUpdated), assigned, c.source ?? null, JSON.stringify(normTags(c.tags)), now, now);
          res.count += 1;
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      const m = r.data.meta;
      if (contacts.length === 0 || !m?.startAfterId || !m.startAfter) break;
      cursor = { startAfterId: m.startAfterId, startAfter: m.startAfter };
    }
    res.ok = true;
  } catch (e) {
    res.error = (e as Error).message;
  }
  return res;
}

// ---- opportunities + milestone/won events --------------------------------------------

async function syncOpportunities(now: string, firstSyncDone: boolean): Promise<PhaseResult> {
  const db = getDb();
  const res: PhaseResult = { phase: "opportunities", ok: false, count: 0, warnings: [] };
  const sel = db.prepare(
    `SELECT stage_id, status, assigned_to, monetary_value, last_stage_change_at, last_status_change_at FROM opportunities WHERE id = ?`,
  );
  const selTags = db.prepare(`SELECT tags FROM contacts WHERE id = ?`);
  const up = db.prepare(`
    INSERT INTO opportunities (id, contact_id, name, pipeline_id, stage_id, status, monetary_value, assigned_to, source,
      created_at, updated_at, last_stage_change_at, last_status_change_at, first_seen_at, last_seen_at, missing_since)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(id) DO UPDATE SET
      contact_id = excluded.contact_id, name = excluded.name, pipeline_id = excluded.pipeline_id,
      stage_id = excluded.stage_id, status = excluded.status, monetary_value = excluded.monetary_value,
      assigned_to = excluded.assigned_to, source = excluded.source, created_at = excluded.created_at,
      updated_at = excluded.updated_at, last_stage_change_at = excluded.last_stage_change_at,
      last_status_change_at = excluded.last_status_change_at, last_seen_at = excluded.last_seen_at,
      missing_since = NULL`);
  const insHist = db.prepare(`
    INSERT INTO opportunity_history (opportunity_id, observed_at, pipeline_id, stage_id, status, assigned_to, monetary_value, change_kind)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const insEvent = db.prepare(`
    INSERT OR IGNORE INTO milestone_events (kind, milestone_key, contact_id, opportunity_id, pipeline_id, stage_id, reporting_group,
      event_time, time_basis, observed_at, assigned_to_at_event, value_at_event, is_baseline)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const milestoneByStage = new Map(trackedMilestones().map((m) => [m.stageId, m]));
  const pipelineIds = mappingConfig.pipelines.map((p) => p.id);
  const isBaseline = firstSyncDone ? 0 : 1;

  try {
    for (const pipelineId of pipelineIds) {
      let cursor: { startAfterId: string; startAfter: string } | undefined;
      for (let page = 0; page < 5000; page++) {
        const r = await ghl.searchOpportunities({ pipelineId, status: "all", limit: 100, startAfterId: cursor?.startAfterId, startAfter: cursor?.startAfter });
        if (!r.ok) throw new Error(`${r.kind}: ${r.error}`);
        const opps = r.data.opportunities ?? [];
        db.exec("BEGIN");
        try {
          for (const o of opps) {
            const value = o.monetaryValue === null || o.monetaryValue === undefined ? null : Number(o.monetaryValue);
            const assigned = o.assignedTo ? String(o.assignedTo) : null;
            const stageAt = isoOrNull(o.lastStageChangeAt);
            const statusAt = isoOrNull(o.lastStatusChangeAt);
            const prev = sel.get(o.id) as
              | { stage_id: string; status: string; assigned_to: string | null; monetary_value: number | null; last_stage_change_at: string | null; last_status_change_at: string | null }
              | undefined;
            up.run(o.id, o.contactId ?? null, o.name ?? null, o.pipelineId, o.pipelineStageId, o.status, value, assigned, o.source ?? null,
              isoOrNull(o.createdAt), isoOrNull(o.updatedAt), stageAt, statusAt, now, now);
            res.count += 1;

            const tagsRow = o.contactId ? (selTags.get(o.contactId) as { tags: string | null } | undefined) : undefined;
            const contactTags = tagsRow?.tags ? (JSON.parse(tagsRow.tags) as string[]) : undefined;
            const milestone = milestoneByStage.get(o.pipelineStageId);

            if (!prev) {
              insHist.run(o.id, now, o.pipelineId, o.pipelineStageId, o.status, assigned, value, "baseline");
              if (milestone) {
                const t = stageAt ?? isoOrNull(o.createdAt);
                insEvent.run("milestone", milestone.key, o.contactId ?? null, o.id, o.pipelineId, o.pipelineStageId, reportingGroupFor(milestone, contactTags),
                  t ?? now, t ? "ghl_last_stage_change" : "observed", now, assigned, value, isBaseline);
              }
              if (o.status === "won") {
                insEvent.run("won", null, o.contactId ?? null, o.id, o.pipelineId, o.pipelineStageId, milestone ? reportingGroupFor(milestone, contactTags) : null,
                  statusAt ?? now, statusAt ? "ghl_last_status_change" : "observed", now, assigned, value, isBaseline);
              }
              continue;
            }

            const changes: string[] = [];
            if (prev.stage_id !== o.pipelineStageId) {
              changes.push("stage");
              if (milestone) {
                const fresh = stageAt && stageAt > (prev.last_stage_change_at ?? "");
                insEvent.run("milestone", milestone.key, o.contactId ?? null, o.id, o.pipelineId, o.pipelineStageId, reportingGroupFor(milestone, contactTags),
                  fresh ? stageAt : now, fresh ? "ghl_last_stage_change" : "observed", now, assigned, value, 0);
              }
            }
            if (prev.status !== o.status) {
              changes.push("status");
              const fresh = statusAt && statusAt > (prev.last_status_change_at ?? "");
              if (o.status === "won") {
                insEvent.run("won", null, o.contactId ?? null, o.id, o.pipelineId, o.pipelineStageId, milestone ? reportingGroupFor(milestone, contactTags) : null,
                  fresh ? statusAt : now, fresh ? "ghl_last_status_change" : "observed", now, assigned, value, 0);
              } else if (prev.status === "won") {
                insEvent.run("won_reversal", null, o.contactId ?? null, o.id, o.pipelineId, o.pipelineStageId, null,
                  fresh ? statusAt : now, fresh ? "ghl_last_status_change" : "observed", now, assigned, value, 0);
              }
            }
            if ((prev.assigned_to ?? null) !== assigned) changes.push("owner");
            if ((prev.monetary_value ?? null) !== value) changes.push("value");
            if (changes.length > 0) {
              insHist.run(o.id, now, o.pipelineId, o.pipelineStageId, o.status, assigned, value, changes.length === 1 ? changes[0] : "multiple");
            }
          }
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
        const m = r.data.meta;
        if (opps.length === 0 || !m?.startAfterId || m.startAfter === undefined || m.startAfter === null) break;
        cursor = { startAfterId: m.startAfterId, startAfter: String(m.startAfter) };
      }
    }
    // Anything GHL no longer returns is flagged, never deleted.
    db.prepare(`UPDATE opportunities SET missing_since = ? WHERE missing_since IS NULL AND last_seen_at < ?`).run(now, now);

    // Backfill: when a stage is newly added to the tracked list, opportunities
    // already sitting in it have no event yet. Record one baseline event each,
    // dated by GHL's own stage-entry time (never invented). Idempotent.
    const selMissing = db.prepare(`
      SELECT o.id, o.contact_id, o.pipeline_id, o.stage_id, o.assigned_to, o.monetary_value, o.last_stage_change_at, o.created_at
        FROM opportunities o WHERE o.stage_id = ? AND o.missing_since IS NULL
         AND NOT EXISTS (SELECT 1 FROM milestone_events e WHERE e.kind = 'milestone' AND e.milestone_key = ? AND e.opportunity_id = o.id)`);
    let backfilled = 0;
    for (const m of trackedMilestones()) {
      const rows = selMissing.all(m.stageId, m.key) as {
        id: string; contact_id: string | null; pipeline_id: string; stage_id: string; assigned_to: string | null;
        monetary_value: number | null; last_stage_change_at: string | null; created_at: string | null;
      }[];
      for (const o of rows) {
        const tagsRow = o.contact_id ? (selTags.get(o.contact_id) as { tags: string | null } | undefined) : undefined;
        const contactTags = tagsRow?.tags ? (JSON.parse(tagsRow.tags) as string[]) : undefined;
        const t = o.last_stage_change_at ?? o.created_at;
        insEvent.run("milestone", m.key, o.contact_id, o.id, o.pipeline_id, o.stage_id, reportingGroupFor(m, contactTags),
          t ?? now, t ? "ghl_last_stage_change" : "observed", now, o.assigned_to, o.monetary_value, 1);
        backfilled += 1;
      }
    }
    if (backfilled > 0) res.warnings.push(`Backfilled ${backfilled} baseline milestone event(s) for newly tracked stages.`);
    res.ok = true;
  } catch (e) {
    res.error = (e as Error).message;
  }
  return res;
}

// ---- calls ---------------------------------------------------------------------------

function isAutomatedCall(messageType: string | undefined, source: string | undefined): boolean {
  if (messageType && /CAMPAIGN|IVR/i.test(messageType)) return true;
  if (source && ["workflow", "campaign", "bulk_actions"].includes(source)) return true;
  return false;
}

async function syncCalls(now: string): Promise<PhaseResult> {
  const db = getDb();
  const res: PhaseResult = { phase: "calls", ok: false, count: 0, warnings: [] };
  const up = db.prepare(`
    INSERT INTO calls (id, alt_id, date_added, direction, status, call_status, duration, user_id, contact_id, source, message_type, automated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      alt_id = excluded.alt_id, status = excluded.status, call_status = excluded.call_status,
      duration = excluded.duration, user_id = excluded.user_id, source = excluded.source,
      message_type = excluded.message_type, automated = excluded.automated`);

  try {
    const through = getState("calls_synced_through");
    // Re-read a one-day overlap so late status/duration updates are captured.
    const overlapStart = through ? new Date(Date.parse(through) - 86400000).toISOString() : HISTORY_START;
    const start = overlapStart < HISTORY_START ? HISTORY_START : overlapStart;
    let cursor: string | undefined;
    for (let page = 0; page < 5000; page++) {
      const r = await ghl.exportMessages({ channel: "Call", limit: 500, startDate: start, endDate: now, sortBy: "createdAt", sortOrder: "asc", cursor });
      if (!r.ok) throw new Error(`${r.kind}: ${r.error}`);
      const msgs = r.data.messages ?? [];
      let newest: string | null = null;
      db.exec("BEGIN");
      try {
        for (const m of msgs) {
          const added = isoOrNull(m.dateAdded);
          if (!added) continue;
          if (!newest || added > newest) newest = added;
          const callStatus = m.meta?.call?.status ?? m.meta?.callStatus ?? m.status ?? null;
          const rawDur = m.meta?.call?.duration ?? m.meta?.callDuration;
          const duration = rawDur === undefined || rawDur === null || rawDur === "" ? null : Math.round(Number(rawDur));
          const altId = (m as { altId?: string }).altId ?? null;
          up.run(m.id, altId, added, m.direction ?? null, m.status ?? null, callStatus, Number.isFinite(duration as number) ? duration : null,
            m.userId ?? null, m.contactId ?? null, m.source ?? null, m.messageType ?? null, isAutomatedCall(m.messageType, m.source) ? 1 : 0);
          res.count += 1;
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      // Checkpoint after every page so an interrupted backfill resumes where it stopped.
      if (newest) setState("calls_synced_through", newest);
      if (msgs.length === 0 || !r.data.nextCursor) break;
      cursor = r.data.nextCursor;
    }
    setState("calls_synced_through", now);
    res.ok = true;
  } catch (e) {
    res.error = (e as Error).message;
  }
  return res;
}

// ---- appointments --------------------------------------------------------------------

async function syncAppointments(now: string): Promise<PhaseResult> {
  const db = getDb();
  const res: PhaseResult = { phase: "appointments", ok: false, count: 0, warnings: [] };
  const selTags = db.prepare(`SELECT tags FROM contacts WHERE id = ?`);
  const up = db.prepare(`
    INSERT INTO appointments (id, calendar_id, contact_id, status, assigned_user_id, created_by_user_id, created_by_source,
      start_time, end_time, date_added, date_updated, rescheduled_at, deleted, classification_first, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      calendar_id = excluded.calendar_id, contact_id = excluded.contact_id, status = excluded.status,
      assigned_user_id = excluded.assigned_user_id, created_by_user_id = excluded.created_by_user_id,
      created_by_source = excluded.created_by_source, start_time = excluded.start_time, end_time = excluded.end_time,
      date_added = excluded.date_added, date_updated = excluded.date_updated, rescheduled_at = excluded.rescheduled_at,
      deleted = excluded.deleted, last_seen_at = excluded.last_seen_at`);

  try {
    const cals = await ghl.getCalendars();
    if (!cals.ok) throw new Error(`${cals.kind}: ${cals.error}`);
    const excluded = new Set(mappingConfig.calendars.excludedCalendarIds);
    const windowStart = Date.parse(HISTORY_START);
    const windowEnd = Date.now() + 365 * 86400000;
    const chunkMs = 92 * 86400000;
    for (const cal of cals.data.calendars) {
      if (excluded.has(cal.id)) continue;
      for (let s = windowStart; s < windowEnd; s += chunkMs) {
        const e = Math.min(s + chunkMs, windowEnd);
        const r = await ghl.getCalendarEvents(cal.id, s, e);
        if (!r.ok) {
          res.warnings.push(`${cal.name}: ${r.error}`);
          if (r.kind === "permission") throw new Error(`${r.kind}: ${r.error}`);
          continue;
        }
        const events = r.data.events ?? [];
        db.exec("BEGIN");
        try {
          for (const ev of events) {
            const tagsRow = ev.contactId ? (selTags.get(ev.contactId) as { tags: string | null } | undefined) : undefined;
            const cls = classify(tagsRow?.tags ? (JSON.parse(tagsRow.tags) as string[]) : undefined);
            up.run(ev.id, ev.calendarId ?? cal.id, ev.contactId ?? null, ev.appointmentStatus ?? null, ev.assignedUserId ?? null,
              ev.createdBy?.userId ?? null, ev.createdBy?.source ?? null, isoOrNull(ev.startTime), isoOrNull(ev.endTime),
              isoOrNull(ev.dateAdded), isoOrNull(ev.dateUpdated), isoOrNull(ev.rescheduledAt), ev.deleted ? 1 : 0, cls, now, now);
            res.count += 1;
          }
          db.exec("COMMIT");
        } catch (err) {
          db.exec("ROLLBACK");
          throw err;
        }
      }
    }
    res.ok = true;
  } catch (e) {
    res.error = (e as Error).message;
  }
  return res;
}

// Local cache, using the SQLite engine built into Node.js 22.13+ / 24.
// The database file lives in ./data (git-ignored). Nothing here touches GHL.
//
// All timestamps are ISO-8601 UTC strings ("2026-10-11T20:51:19.495Z") so
// that string comparison orders them correctly in SQL.

import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

let db: DatabaseSync | undefined;

export function getDb(): DatabaseSync {
  if (db) return db;
  const dir = path.join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  db = new DatabaseSync(path.join(dir, "cache.sqlite"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 10000;

    -- One row per mapping probe/endpoint result. payload is JSON.
    CREATE TABLE IF NOT EXISTS snapshots (
      key         TEXT PRIMARY KEY,
      label       TEXT NOT NULL,
      fetched_at  TEXT NOT NULL,
      ok          INTEGER NOT NULL,
      status      INTEGER,
      error_kind  TEXT,
      error       TEXT,
      payload     TEXT
    );

    -- One row per sync run so partial failures are visible.
    CREATE TABLE IF NOT EXISTS sync_runs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      kind         TEXT NOT NULL,
      started_at   TEXT NOT NULL,
      finished_at  TEXT,
      ok           INTEGER,
      probes_total INTEGER,
      probes_ok    INTEGER,
      summary      TEXT
    );

    -- Small key/value store for sync bookkeeping (cursors, first-sync time).
    CREATE TABLE IF NOT EXISTS sync_state (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    -- Email/phone for contacts shown in a drilldown, fetched on demand from
    -- GHL (GET /contacts/{id}) and kept for 15 minutes. Never bulk-loaded.
    CREATE TABLE IF NOT EXISTS contact_details (
      id          TEXT PRIMARY KEY,
      fetched_at  TEXT NOT NULL,
      ok          INTEGER NOT NULL,
      name        TEXT,
      email       TEXT,
      phone       TEXT,
      error       TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id       TEXT PRIMARY KEY,
      name     TEXT,
      email    TEXT,
      role     TEXT,
      deleted  INTEGER NOT NULL DEFAULT 0,
      last_seen_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id            TEXT PRIMARY KEY,
      name          TEXT,
      date_added    TEXT,
      date_updated  TEXT,
      assigned_to   TEXT,
      source        TEXT,
      tags          TEXT,          -- JSON array of lowercase tag names
      first_seen_at TEXT NOT NULL,
      last_seen_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS contacts_date_added ON contacts(date_added);
    CREATE INDEX IF NOT EXISTS contacts_assigned ON contacts(assigned_to);

    -- Assignment changes observed between syncs (GHL has no assignment history).
    CREATE TABLE IF NOT EXISTS assignment_events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id   TEXT NOT NULL,
      from_user    TEXT,
      to_user      TEXT,
      observed_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS assignment_events_time ON assignment_events(observed_at);

    CREATE TABLE IF NOT EXISTS opportunities (
      id                    TEXT PRIMARY KEY,
      contact_id            TEXT,
      name                  TEXT,
      pipeline_id           TEXT NOT NULL,
      stage_id              TEXT NOT NULL,
      status                TEXT NOT NULL,
      monetary_value        REAL,
      assigned_to           TEXT,
      source                TEXT,
      created_at            TEXT,
      updated_at            TEXT,
      last_stage_change_at  TEXT,
      last_status_change_at TEXT,
      first_seen_at         TEXT NOT NULL,
      last_seen_at          TEXT NOT NULL,
      missing_since         TEXT          -- set when GHL stops returning it
    );
    CREATE INDEX IF NOT EXISTS opps_pipeline_stage ON opportunities(pipeline_id, stage_id);
    CREATE INDEX IF NOT EXISTS opps_status ON opportunities(status);
    CREATE INDEX IF NOT EXISTS opps_contact ON opportunities(contact_id);

    -- Every observed change of stage / status / owner / value, plus baseline.
    CREATE TABLE IF NOT EXISTS opportunity_history (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      opportunity_id  TEXT NOT NULL,
      observed_at     TEXT NOT NULL,
      pipeline_id     TEXT NOT NULL,
      stage_id        TEXT NOT NULL,
      status          TEXT NOT NULL,
      assigned_to     TEXT,
      monetary_value  REAL,
      change_kind     TEXT NOT NULL   -- baseline | stage | status | owner | value | multiple
    );
    CREATE INDEX IF NOT EXISTS opp_history_opp ON opportunity_history(opportunity_id);

    -- Milestone achievements and won transitions as EVENTS (not snapshots).
    CREATE TABLE IF NOT EXISTS milestone_events (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      kind                 TEXT NOT NULL,      -- milestone | won | won_reversal
      milestone_key        TEXT,               -- from config for kind=milestone
      contact_id           TEXT,
      opportunity_id       TEXT NOT NULL,
      pipeline_id          TEXT NOT NULL,
      stage_id             TEXT NOT NULL,
      reporting_group      TEXT,               -- FY27 / FS2 / unclassified
      event_time           TEXT NOT NULL,
      time_basis           TEXT NOT NULL,      -- ghl_last_stage_change | ghl_last_status_change | observed
      observed_at          TEXT NOT NULL,
      assigned_to_at_event TEXT,
      value_at_event       REAL,
      is_baseline          INTEGER NOT NULL DEFAULT 0,
      UNIQUE(kind, milestone_key, opportunity_id, event_time)
    );
    CREATE INDEX IF NOT EXISTS milestone_events_time ON milestone_events(kind, event_time);

    CREATE TABLE IF NOT EXISTS calls (
      id            TEXT PRIMARY KEY,
      alt_id        TEXT,
      date_added    TEXT NOT NULL,
      direction     TEXT,
      status        TEXT,
      call_status   TEXT,
      duration      INTEGER,
      user_id       TEXT,
      contact_id    TEXT,
      source        TEXT,
      message_type  TEXT,
      automated     INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS calls_date ON calls(date_added);
    CREATE INDEX IF NOT EXISTS calls_alt ON calls(alt_id);

    CREATE TABLE IF NOT EXISTS appointments (
      id                    TEXT PRIMARY KEY,
      calendar_id           TEXT,
      contact_id            TEXT,
      status                TEXT,
      assigned_user_id      TEXT,
      created_by_user_id    TEXT,
      created_by_source     TEXT,
      start_time            TEXT,
      end_time              TEXT,
      date_added            TEXT,
      date_updated          TEXT,
      rescheduled_at        TEXT,
      deleted               INTEGER NOT NULL DEFAULT 0,
      classification_first  TEXT,          -- army | veteran | both | untagged | unknown at first sight
      first_seen_at         TEXT NOT NULL,
      last_seen_at          TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS appts_added ON appointments(date_added);
    CREATE INDEX IF NOT EXISTS appts_start ON appointments(start_time);
  `);
  return db;
}

export interface SnapshotRow {
  key: string;
  label: string;
  fetched_at: string;
  ok: number;
  status: number | null;
  error_kind: string | null;
  error: string | null;
  payload: string | null;
}

export interface SyncRunRow {
  id: number;
  kind: string;
  started_at: string;
  finished_at: string | null;
  ok: number | null;
  probes_total: number | null;
  probes_ok: number | null;
  summary: string | null;
}

export function upsertSnapshot(row: Omit<SnapshotRow, "payload"> & { payload: unknown }): void {
  getDb()
    .prepare(
      `INSERT INTO snapshots (key, label, fetched_at, ok, status, error_kind, error, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         label = excluded.label, fetched_at = excluded.fetched_at, ok = excluded.ok,
         status = excluded.status, error_kind = excluded.error_kind, error = excluded.error,
         payload = excluded.payload`,
    )
    .run(
      row.key,
      row.label,
      row.fetched_at,
      row.ok,
      row.status,
      row.error_kind,
      row.error,
      row.payload === undefined ? null : JSON.stringify(row.payload),
    );
}

export function readSnapshots(prefix: string): SnapshotRow[] {
  return getDb()
    .prepare(`SELECT * FROM snapshots WHERE key LIKE ? ORDER BY key`)
    .all(`${prefix}%`) as unknown as SnapshotRow[];
}

export function startSyncRun(kind: string): number {
  const res = getDb()
    .prepare(`INSERT INTO sync_runs (kind, started_at) VALUES (?, ?)`)
    .run(kind, new Date().toISOString());
  return Number(res.lastInsertRowid);
}

export function finishSyncRun(
  id: number,
  ok: boolean,
  probesTotal: number,
  probesOk: number,
  summary: string,
): void {
  getDb()
    .prepare(
      `UPDATE sync_runs SET finished_at = ?, ok = ?, probes_total = ?, probes_ok = ?, summary = ? WHERE id = ?`,
    )
    .run(new Date().toISOString(), ok ? 1 : 0, probesTotal, probesOk, summary, id);
}

export function latestSyncRuns(kind: string, limit = 5): SyncRunRow[] {
  return getDb()
    .prepare(`SELECT * FROM sync_runs WHERE kind = ? ORDER BY id DESC LIMIT ?`)
    .all(kind, limit) as unknown as SyncRunRow[];
}

export function lastSuccessfulSync(kind: string): SyncRunRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM sync_runs WHERE kind = ? AND ok = 1 ORDER BY id DESC LIMIT 1`)
    .get(kind) as unknown as SyncRunRow | undefined;
}

export function getState(key: string): string | undefined {
  const row = getDb().prepare(`SELECT value FROM sync_state WHERE key = ?`).get(key) as { value: string | null } | undefined;
  return row?.value ?? undefined;
}

export function setState(key: string, value: string): void {
  getDb()
    .prepare(`INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(key, value);
}

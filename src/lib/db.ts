// Local cache, using the SQLite engine built into Node.js 22.13+ / 24.
// The database file lives in ./data (git-ignored). Nothing here touches GHL.

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

    -- One row per probe/endpoint result. payload is JSON.
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

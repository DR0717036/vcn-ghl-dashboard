// Bounties (owner request 2026-11-18): the weekly bounty (first rep in a
// Monday-to-Sunday week to reach N combined submissions) and the semester
// bounty (most IAU App Submissions for one semester), as config/bounties.json
// describes them. Shown on the rep dashboard's Bounties card, as a compact
// card in the admin Rep Performance section, and as a line in the Sunday
// report. Counts come from the same milestone events as the scorecard
// (first entry per contact, credited to the opportunity owner at the event);
// weekly winners are remembered in the cache table bounty_claims. Reads the
// cache only; nothing here touches GHL.

import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db";
import { addDays, fmtDay, nyDayKey, parseNyDay, startOfWeek } from "@/lib/dates";
import { semesters, trackedMilestones } from "@/lib/mapping-config";
import { activeReps, type Rep } from "@/lib/reps";
import { submissionEvents, submissionLedger } from "@/lib/submissions";
import { HISTORY_START } from "@/lib/sync/core";

const FILE = path.join(process.cwd(), "config", "bounties.json");

export interface WeeklyBountyConfig {
  enabled: boolean;
  amount: number;
  target: number;
  title: string;
  counts: string;
  /** Winners are recorded from the week containing this day (YYYY-MM-DD) onward. */
  since: string | null;
}

export interface SemesterBountyConfig {
  enabled: boolean;
  amount: number;
  semester: string;
  title: string;
  from: string | null;
  to: string | null;
}

export interface BountiesConfig {
  weekly: WeeklyBountyConfig | null;
  semester: SemesterBountyConfig | null;
}

let cache: { mtimeMs: number; cfg: BountiesConfig } | null = null;

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
const str = (v: unknown, d: string) => (typeof v === "string" && v.trim() ? v.trim() : d);
const day = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && parseNyDay(v) ? v : null);

/** config/bounties.json, re-read when the file changes on disk. Missing file = no bounties. */
export function bountiesConfig(): BountiesConfig {
  if (!fs.existsSync(FILE)) return { weekly: null, semester: null };
  const mtimeMs = fs.statSync(FILE).mtimeMs;
  if (cache && cache.mtimeMs === mtimeMs) return cache.cfg;
  const raw = JSON.parse(fs.readFileSync(FILE, "utf8")) as Record<string, unknown>;
  const w = (raw.weekly ?? null) as Record<string, unknown> | null;
  const s = (raw.semester ?? null) as Record<string, unknown> | null;
  const target = w ? Math.max(1, Math.round(num(w.target, 6))) : 6;
  const cfg: BountiesConfig = {
    weekly: w && w.enabled !== false ? { enabled: true, amount: num(w.amount, 0), target, title: str(w.title, `first rep this week to reach ${target} submissions`), counts: str(w.counts, "IAU App Submitted + Army CA 101 submitted, mixed"), since: day(w.since) } : null,
    semester: s && s.enabled !== false ? { enabled: true, amount: num(s.amount, 0), semester: str(s.semester, ""), title: str(s.title, "most IAU App Submissions"), from: day(s.from), to: day(s.to) } : null,
  };
  cache = { mtimeMs, cfg };
  return cfg;
}

export interface Standing {
  userId: string;
  name: string;
  initials: string;
  photoUrl: string | null;
  count: number;
  /** 1-based place; ties share a place. */
  place: number;
  /** When the rep's count reached its current value (ISO), or null at 0. */
  lastAt: string | null;
  /** For the weekly bounty: when the rep reached the target (ISO), or null. */
  reachedAt: string | null;
}

export interface WeeklyWinner {
  weekStart: string;
  weekLabel: string;
  userId: string;
  name: string;
  amount: number;
  count: number;
  reachedAt: string;
  dayText: string;
}

export interface WeeklyBounty {
  amount: number;
  target: number;
  title: string;
  counts: string;
  weekStart: string;
  /** "Nov 16 – Nov 22" */
  weekLabel: string;
  /** "Sunday, Nov 22, 11:59 PM" */
  endsText: string;
  /** True for the week in progress. */
  open: boolean;
  standings: Standing[];
  leader: Standing | null;
  claimed: WeeklyWinner | null;
  /** Earlier weeks' winners from the cache, newest first. */
  recentWinners: WeeklyWinner[];
}

export interface SemesterBounty {
  amount: number;
  title: string;
  semester: { key: string; label: string; short: string };
  /** "since tracking began" or "Oct 20, 2026 – today" */
  windowText: string;
  standings: Standing[];
  leader: Standing | null;
}

export interface BountyBoard {
  asOf: string;
  weekly: WeeklyBounty | null;
  semester: SemesterBounty | null;
  notes: string[];
}

const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const n = (v: number) => v.toLocaleString("en-US");

function initialsOf(name: string): string {
  const parts = name.replace(/[.]/g, "").split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function photoFor(rel: string | undefined): string | null {
  if (!rel) return null;
  const clean = rel.replace(/^\/+/, "");
  return fs.existsSync(path.join(process.cwd(), "public", clean)) ? `/${clean}` : null;
}

/** "Tue, Nov 17" */
function dayText(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" })}, ${fmtDay(d)}`;
}

/** Standings for a set of timed events credited to GHL user ids, over the given reps. */
function standingsFor(reps: Rep[], events: { userId: string | null; time: string }[], target: number | null): Standing[] {
  const byUser = new Map<string, string[]>();
  for (const e of events) {
    if (!e.userId) continue;
    const list = byUser.get(e.userId) ?? [];
    list.push(e.time);
    byUser.set(e.userId, list);
  }
  const rows = reps.map((r) => {
    const times = (byUser.get(r.userId) ?? []).sort();
    return { userId: r.userId, name: r.name, initials: initialsOf(r.name), photoUrl: photoFor(r.photo), count: times.length, place: 0, lastAt: times.length ? times[times.length - 1] : null, reachedAt: target !== null && times.length >= target ? times[target - 1] : null };
  });
  // Most first; among equals, whoever got there first.
  rows.sort((a, b) => b.count - a.count || (a.lastAt ?? "").localeCompare(b.lastAt ?? "") || a.name.localeCompare(b.name));
  for (const r of rows) r.place = 1 + rows.filter((x) => x.count > r.count).length;
  return rows;
}

function ensureTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS bounty_claims (
      kind        TEXT NOT NULL,      -- weekly
      period_key  TEXT NOT NULL,      -- Monday of the week, YYYY-MM-DD (America/New_York)
      user_id     TEXT NOT NULL,
      name        TEXT NOT NULL,
      amount      REAL NOT NULL,
      count       INTEGER NOT NULL,
      reached_at  TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      PRIMARY KEY (kind, period_key)
    );
  `);
}

interface ClaimRow {
  period_key: string;
  user_id: string;
  name: string;
  amount: number;
  count: number;
  reached_at: string;
}

function winnerOf(row: ClaimRow): WeeklyWinner {
  const ws = parseNyDay(row.period_key) as Date;
  return { weekStart: row.period_key, weekLabel: `${fmtDay(ws)} – ${fmtDay(addDays(ws, 6))}`, userId: row.user_id, name: row.name, amount: row.amount, count: row.count, reachedAt: row.reached_at, dayText: dayText(row.reached_at) };
}

/**
 * The weekly bounty for the week starting `weekStart` (a Monday), as of
 * `now`: standings, the leader, and the claimant (the first rep whose
 * target-th submission of the week came earliest). A claim, once seen, is
 * written to bounty_claims so the winner stays on record even if an event
 * is later re-filed; the stored row wins over a recomputation.
 */
export function computeWeeklyBounty(cfg: WeeklyBountyConfig, weekStart: Date, now: Date): WeeklyBounty {
  ensureTable();
  const db = getDb();
  const ws = startOfWeek(weekStart);
  const weekEnd = addDays(ws, 7);
  const open = now.getTime() < weekEnd.getTime();
  const end = open ? now : weekEnd;
  const key = nyDayKey(ws);
  const reps = activeReps(end);
  const events = submissionEvents(ws, end);
  const standings = standingsFor(reps, events, cfg.target);
  const leader = standings.find((s) => s.count > 0) ?? null;

  const stored = db.prepare(`SELECT period_key, user_id, name, amount, count, reached_at FROM bounty_claims WHERE kind = 'weekly' AND period_key = ?`).get(key) as ClaimRow | undefined;
  let claimed: WeeklyWinner | null = stored ? winnerOf(stored) : null;
  if (!claimed) {
    const reached = standings.filter((s) => s.reachedAt).sort((a, b) => (a.reachedAt as string).localeCompare(b.reachedAt as string));
    const first = reached[0];
    const sinceOk = !cfg.since || key >= nyDayKey(startOfWeek(parseNyDay(cfg.since) as Date));
    if (first && first.reachedAt) {
      const row: ClaimRow = { period_key: key, user_id: first.userId, name: first.name, amount: cfg.amount, count: cfg.target, reached_at: first.reachedAt };
      if (sinceOk) db.prepare(`INSERT OR IGNORE INTO bounty_claims (kind, period_key, user_id, name, amount, count, reached_at, recorded_at) VALUES ('weekly', ?, ?, ?, ?, ?, ?, ?)`).run(row.period_key, row.user_id, row.name, row.amount, row.count, row.reached_at, new Date().toISOString());
      claimed = winnerOf(row);
    }
  }
  const recent = (db.prepare(`SELECT period_key, user_id, name, amount, count, reached_at FROM bounty_claims WHERE kind = 'weekly' AND period_key < ? ORDER BY period_key DESC LIMIT 6`).all(key) as unknown as ClaimRow[]).map(winnerOf);
  const sunday = addDays(ws, 6);
  return {
    amount: cfg.amount,
    target: cfg.target,
    title: cfg.title,
    counts: cfg.counts,
    weekStart: key,
    weekLabel: `${fmtDay(ws)} – ${fmtDay(sunday)}`,
    endsText: `Sunday, ${fmtDay(sunday)}, 11:59 PM`,
    open,
    standings,
    leader,
    claimed,
    recentWinners: recent,
  };
}

/** Earlier weeks' claims that were never seen live (for example after a redeploy): recompute from events and record them. */
export function backfillWeeklyWinners(cfg: WeeklyBountyConfig, now: Date, weeks = 8): void {
  if (!cfg.since) return;
  const first = startOfWeek(parseNyDay(cfg.since) as Date);
  const thisWeek = startOfWeek(now);
  for (let back = 1; back <= weeks; back++) {
    const ws = addDays(thisWeek, -7 * back);
    if (ws.getTime() < first.getTime()) break;
    computeWeeklyBounty(cfg, ws, now);
  }
}

/** The semester bounty: IAU App Submitted entries for the configured semester, per rep on the team today. */
export function computeSemesterBounty(cfg: SemesterBountyConfig, now: Date): SemesterBounty | null {
  const sem = semesters().find((s) => s.key.toLowerCase() === cfg.semester.toLowerCase());
  if (!sem) return null;
  const m = trackedMilestones().find((x) => x.key === sem.submittedKey);
  if (!m) return null;
  const fromDate = cfg.from ? (parseNyDay(cfg.from) as Date) : null;
  const toDate = cfg.to ? addDays(parseNyDay(cfg.to) as Date, 1) : null;
  const start = fromDate ? fromDate.toISOString() : HISTORY_START;
  const end = toDate && toDate.getTime() < now.getTime() ? toDate.toISOString() : now.toISOString();
  // The semester's IAU App submissions from the shared ledger (the same list Program Submissions counts).
  const events = submissionLedger(new Date(start), new Date(end))
    .filter((x) => x.key === m.key)
    .map((x) => ({ userId: x.userId, time: x.time }));
  const standings = standingsFor(activeReps(now), events, null);
  return {
    amount: cfg.amount,
    title: cfg.title,
    semester: { key: sem.key, label: sem.label, short: sem.short },
    windowText: fromDate ? `${fmtDay(fromDate)} – ${toDate ? fmtDay(addDays(toDate, -1)) : "today"}` : toDate ? `since tracking began – ${fmtDay(addDays(toDate, -1))}` : "since tracking began",
    standings,
    leader: standings.find((s) => s.count > 0) ?? null,
  };
}

/** Both bounties as of `now`; `weekStart` picks another week for the weekly one (the Sunday report). */
export function computeBountyBoard(now: Date, weekStart: Date = startOfWeek(now)): BountyBoard {
  const cfg = bountiesConfig();
  let weekly: WeeklyBounty | null = null;
  if (cfg.weekly) {
    backfillWeeklyWinners(cfg.weekly, now);
    weekly = computeWeeklyBounty(cfg.weekly, weekStart, now);
  }
  const semester = cfg.semester ? computeSemesterBounty(cfg.semester, now) : null;
  const notes = [
    "Bounties are set in config/bounties.json; the amounts are the owner's, not commission, and the official payout decision is made outside this dashboard.",
    ...(weekly ? [`Weekly bounty — ${usd(weekly.amount)} to the ${weekly.title} (${weekly.counts}): combined submissions inside the Monday-to-Sunday week (New York), the same first-entry-per-contact events as Program Submissions, credited to the opportunity owner at the event. The first rep whose ${n(weekly.target)}th submission of the week lands claims it; it resets every Monday, and winners are kept in the cache from the week of ${cfg.weekly?.since ?? "the bounty's start"}.`] : []),
    ...(semester ? [`Semester bounty — ${usd(semester.amount)} to the rep with the ${semester.title}: IAU App Submitted (${semester.semester.label}) first entries per contact, ${semester.windowText}, among the reps on the team today; ties share a place.`] : []),
  ];
  return { asOf: now.toISOString(), weekly, semester, notes };
}

/** One rep's view of a bounty's standings. */
export function standingOf(standings: Standing[], userId: string): Standing | null {
  return standings.find((s) => s.userId === userId) ?? null;
}

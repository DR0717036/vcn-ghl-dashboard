// Weekly sales report settings (config/weekly-report.json) and the week
// arithmetic the scheduler and the admin route share. The file is re-read
// when it changes on disk, so the owner can flip "enabled" or edit the
// recipients without restarting the server. Server-only.

import fs from "node:fs";
import path from "node:path";
import { addDays, nyDate, nyParts, parseNyDay, startOfWeek, nyDayKey, resolveRange, fmtDay, type DateRange } from "@/lib/dates";

const FILE = path.join(process.cwd(), "config", "weekly-report.json");

/** Email colors: the dashboard's light bands or its dark bands. */
export type ReportTheme = "light" | "dark";

export interface SendTime {
  weekday: number;
  hour: number;
  minute: number;
}

/** One scheduled send: a weekday and time (New York) plus how long after it a missed send may still go out. */
export interface Schedule {
  enabled: boolean;
  sendTime: SendTime;
  catchUpHours: number;
}

export interface WeeklyReportConfig {
  enabled: boolean;
  theme: ReportTheme;
  sendTime: SendTime;
  catchUpHours: number;
  /** The Wednesday check-in: the week so far, sent to the same recipients. */
  midweek: Schedule & { subject: string };
  recipients: string[];
  from: { name: string; address: string };
  subject: string;
  workingDays: number[];
  flags: { underGoalShare: number; showRateDropPoints: number };
  dashboardUrl: string;
}

let cache: { mtimeMs: number; cfg: WeeklyReportConfig } | null = null;

const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const str = (v: unknown, d: string) => (typeof v === "string" && v.trim() ? v.trim() : d);
const emails = (v: unknown): string[] => (Array.isArray(v) ? v : []).filter((e): e is string => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())).map((e) => e.trim().toLowerCase());

export function weeklyReportConfig(): WeeklyReportConfig {
  const mtimeMs = fs.statSync(FILE).mtimeMs;
  if (cache && cache.mtimeMs === mtimeMs) return cache.cfg;
  const raw = JSON.parse(fs.readFileSync(FILE, "utf8")) as Record<string, unknown>;
  const st = (raw.sendTime ?? {}) as Record<string, unknown>;
  const from = (raw.from ?? {}) as Record<string, unknown>;
  const flags = (raw.flags ?? {}) as Record<string, unknown>;
  const mw = (raw.midweek ?? {}) as Record<string, unknown>;
  const mst = (mw.sendTime ?? {}) as Record<string, unknown>;
  const cfg: WeeklyReportConfig = {
    enabled: raw.enabled === true,
    theme: raw.theme === "dark" ? "dark" : "light",
    sendTime: { weekday: int(st.weekday, 0, 6, 0), hour: int(st.hour, 0, 23, 17), minute: int(st.minute, 0, 59, 0) },
    catchUpHours: num(raw.catchUpHours, 0, 24 * 6, 48),
    midweek: {
      enabled: mw.enabled === true,
      sendTime: { weekday: int(mst.weekday, 0, 6, 3), hour: int(mst.hour, 0, 23, 15), minute: int(mst.minute, 0, 59, 0) },
      catchUpHours: num(mw.catchUpHours, 0, 24 * 6, 20),
      subject: str(mw.subject, "VCN Midweek Check-in · {range}"),
    },
    recipients: emails(raw.recipients),
    from: { name: str(from.name, "VCN Sales Dashboard"), address: str(from.address, "info@intelagentmedia.com").toLowerCase() },
    subject: str(raw.subject, "VCN Weekly Sales Report · {range}"),
    workingDays: (Array.isArray(raw.workingDays) ? raw.workingDays : [1, 2, 3, 4, 5]).filter((d): d is number => typeof d === "number" && d >= 0 && d <= 6),
    flags: { underGoalShare: num(flags.underGoalShare, 0, 1, 0.5), showRateDropPoints: num(flags.showRateDropPoints, 0, 100, 10) },
    dashboardUrl: str(raw.dashboardUrl, "").replace(/\/+$/, ""),
  };
  cache = { mtimeMs, cfg };
  return cfg;
}

/** The live dashboard's public address for links in the email (config, else AUTH_URL). */
export function dashboardBaseUrl(): string | null {
  const c = weeklyReportConfig().dashboardUrl || process.env.AUTH_URL?.trim().replace(/\/+$/, "") || "";
  return /^https?:\/\//.test(c) ? c : null;
}

/** "YYYY-MM-DD" (New York) of the Monday that starts the week containing the instant. */
export function weekKeyOf(d: Date): string {
  return nyDayKey(startOfWeek(d));
}

/** The Monday starting the week named by a "YYYY-MM-DD" (any day of that week), or undefined when malformed. */
export function weekStartFromKey(key: string | undefined | null): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? "");
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12 || Number(m[3]) < 1 || Number(m[3]) > 31) return undefined;
  const d = parseNyDay(key ?? undefined);
  return d && nyDayKey(d) === key ? startOfWeek(d) : undefined;
}

/** The most recently completed Monday-to-Sunday week as of `now` (the default report week for previews). */
export function lastCompletedWeekStart(now: Date): Date {
  return addDays(startOfWeek(now), -7);
}

/**
 * The Monday-to-Sunday report range for a week start. For the week in
 * progress (the Sunday 5 PM send) the range ends at `now`, exactly like the
 * dashboard's This Week; a finished week ends at the following Monday 00:00.
 * The comparison period is the previous Monday-to-Sunday week, or the same
 * elapsed portion of it while the week is still open (dashboard rule).
 */
export function weekRange(weekStart: Date, now: Date): DateRange {
  const r = resolveRange("custom", now, { from: nyDayKey(weekStart), to: nyDayKey(addDays(weekStart, 6)) });
  return { ...r, label: `Week of ${fmtDay(weekStart)}` };
}

/** The instant a schedule's send for a report week is due (its send-day at sendTime, New York). */
export function scheduledInstant(weekStart: Date, cfg: { sendTime: SendTime } = weeklyReportConfig()): Date {
  // weekday 0 = Sunday is day 6 of a Monday-first week; weekday 1..6 map to days 0..5.
  const offset = (cfg.sendTime.weekday + 6) % 7;
  const day = addDays(weekStart, offset);
  const p = nyParts(day);
  return nyDate(p.y, p.m, p.d, cfg.sendTime.hour, cfg.sendTime.minute, 0);
}

/**
 * The report week whose scheduled send is due at `now`, or null. A week is
 * due from its send instant until catchUpHours later, so a server that was
 * down at 5 PM still sends when it comes back the same evening or the next
 * morning, and never sends a week that is already days old.
 */
export function dueWeekStart(now: Date, cfg: { sendTime: SendTime; catchUpHours: number } = weeklyReportConfig()): Date | null {
  const candidates = [startOfWeek(now), addDays(startOfWeek(now), -7)];
  for (const ws of candidates) {
    const at = scheduledInstant(ws, cfg).getTime();
    if (now.getTime() >= at && now.getTime() - at <= cfg.catchUpHours * 3_600_000) return ws;
  }
  return null;
}

/** The next send instant of a schedule after `now` (this week's, or a later week's). */
export function nextScheduledInstant(now: Date, cfg: { sendTime: SendTime } = weeklyReportConfig()): Date {
  for (let i = 0; i < 4; i++) {
    const at = scheduledInstant(addDays(startOfWeek(now), 7 * i), cfg);
    if (at.getTime() > now.getTime()) return at;
  }
  return scheduledInstant(addDays(startOfWeek(now), 28), cfg);
}

/** Plain-language schedule, e.g. "Sundays at 5:00 PM (America/New_York)". */
export function scheduleLabel(cfg: { sendTime: SendTime } = weeklyReportConfig()): string {
  const days = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
  const h12 = cfg.sendTime.hour % 12 === 0 ? 12 : cfg.sendTime.hour % 12;
  return `${days[cfg.sendTime.weekday]} at ${h12}:${String(cfg.sendTime.minute).padStart(2, "0")} ${cfg.sendTime.hour < 12 ? "AM" : "PM"} (America/New_York)`;
}

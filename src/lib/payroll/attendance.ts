// Attendance for one rep and one pay period (owner request 2026-11-24):
// every working day of the period marked worked (at least the configured
// outbound dials that day), Non-paid day off, Holiday (unpaid, no
// deduction; an optional holiday worked at the threshold is paid extra at
// the daily rate), or an admin override (approved PTO, sick, excused: the
// day is paid and the note is shown to the rep), with the dial count and
// the running deduction for base-pay reps at each day's own daily rate.
// Dials are the rep's outbound human calls, one per call ID, automated
// calls excluded: the same rule as the Dials figure everywhere else. Reads
// the local cache only; GHL is never touched. Overrides live in
// attendance_overrides with every change logged in attendance_override_log.

import { getDb } from "@/lib/db";
import { nyDayKey, nyParts, parseNyDay } from "@/lib/dates";
import type { Rep } from "@/lib/reps";
import { basePayFor, holidayOn, payrollConfig, type Holiday } from "./config";
import { dailyRate, firstPeriod, periodContaining, workingDayKeysIn, type PayPeriod } from "./periods";

export type OverrideKind = "pto" | "sick" | "holiday" | "other";
export const OVERRIDE_LABEL: Record<OverrideKind, string> = { pto: "Approved PTO", sick: "Sick day", holiday: "Company holiday (paid)", other: "Excused" };
export const OVERRIDE_KINDS: OverrideKind[] = ["pto", "sick", "holiday", "other"];

export interface AttendanceOverride {
  userId: string;
  day: string;
  kind: OverrideKind;
  note: string | null;
  createdBy: string;
  createdAt: string;
}

export type DayStatus = "worked" | "unpaid" | "excused" | "holiday" | "today" | "upcoming";
export const DAY_STATUS_LABEL: Record<DayStatus, string> = { worked: "Worked", unpaid: "Non-paid day off", excused: "Excused (paid)", holiday: "Holiday · unpaid", today: "Today, in progress", upcoming: "Upcoming" };

export interface AttendanceDay {
  day: string;
  /** "Mon" */
  weekday: string;
  /** "Nov 30" */
  short: string;
  dials: number;
  status: DayStatus;
  override: AttendanceOverride | null;
  holiday: Holiday | null;
  /** This day's base rate (null for commission-only reps). */
  rate: number | null;
  /** The deduction this day carries (non-paid days only). */
  deduction: number;
  /** Extra pay this day earns (an optional holiday worked at the threshold). */
  extra: number;
}

export interface Attendance {
  period: PayPeriod;
  /** True when shown before the first period: the same rule applied to the days before it, never invoiced. */
  preview: boolean;
  monthly: number | null;
  /** Half the monthly base: the period's base before deductions (null for commission-only reps). */
  halfBase: number | null;
  days: AttendanceDay[];
  weeks: AttendanceDay[][];
  /** Working days expected to be worked: every weekday in the period except holidays. */
  payableDays: number;
  worked: number;
  unpaid: number;
  excused: number;
  holidays: number;
  /** Optional holidays worked and paid extra. */
  optionalWorked: number;
  remaining: number;
  deduction: number;
  extras: number;
  /** halfBase − deduction + extras (null for commission-only reps). */
  expected: number | null;
  minDials: number;
  rateText: string;
  notes: string[];
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const short = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
const monthLong = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", year: "numeric" });
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const n = (v: number) => v.toLocaleString("en-US");

/** Outbound human dials per New York day for the rep in [start, end), one per call ID. */
export function dialsByDay(userId: string, start: Date, end: Date): Map<string, number> {
  const rows = getDb()
    .prepare(
      `SELECT MIN(date_added) AS t FROM calls
        WHERE automated = 0 AND direction = 'outbound' AND NULLIF(user_id, '') = ? AND date_added >= ? AND date_added < ?
        GROUP BY COALESCE(alt_id, id)`,
    )
    .all(userId, start.toISOString(), end.toISOString()) as unknown as { t: string }[];
  const out = new Map<string, number>();
  for (const r of rows) {
    const k = nyDayKey(new Date(r.t));
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

const asKind = (k: string): OverrideKind => (OVERRIDE_KINDS.includes(k as OverrideKind) ? (k as OverrideKind) : "other");

export function overridesFor(userId: string, start: Date, end: Date): Map<string, AttendanceOverride> {
  const rows = getDb()
    .prepare(`SELECT user_id, day, kind, note, created_by, created_at FROM attendance_overrides WHERE user_id = ? AND day >= ? AND day < ? ORDER BY day`)
    .all(userId, nyDayKey(start), nyDayKey(end)) as unknown as { user_id: string; day: string; kind: string; note: string | null; created_by: string; created_at: string }[];
  const out = new Map<string, AttendanceOverride>();
  for (const r of rows) out.set(r.day, { userId: r.user_id, day: r.day, kind: asKind(r.kind), note: r.note, createdBy: r.created_by, createdAt: r.created_at });
  return out;
}

export function computeAttendance(rep: Rep, period: PayPeriod, now: Date, preview = false): Attendance {
  const cfg = payrollConfig();
  const monthly = basePayFor(rep.userId);
  const today = nyDayKey(now);
  const dials = dialsByDay(rep.userId, period.start, period.end);
  const overrides = overridesFor(rep.userId, period.start, period.end);
  const days: AttendanceDay[] = workingDayKeysIn(period.start, period.end).map((day) => {
    const d = parseNyDay(day) as Date;
    const count = dials.get(day) ?? 0;
    const ov = overrides.get(day) ?? null;
    const hol = holidayOn(day);
    const worked = count >= cfg.workedDayMinDials;
    const rate = monthly === null ? null : dailyRate(monthly, day);
    let status: DayStatus;
    if (hol) status = hol.optional && worked ? "worked" : "holiday";
    else if (day > today) status = "upcoming";
    else if (ov) status = "excused";
    else if (worked) status = "worked";
    else status = day === today ? "today" : "unpaid";
    const extra = hol?.optional && status === "worked" && rate !== null ? rate : 0;
    return { day, weekday: DOW[nyParts(d).wd], short: short.format(d), dials: count, status, override: hol ? null : ov, holiday: hol, rate, deduction: status === "unpaid" && rate !== null ? rate : 0, extra };
  });
  const weeks: AttendanceDay[][] = [];
  for (const d of days) {
    const wk = Math.floor((Date.parse(d.day + "T12:00:00Z") - Date.parse(period.key + "T12:00:00Z")) / (7 * 86_400_000));
    (weeks[wk] ??= []).push(d);
  }
  const count = (s: DayStatus) => days.filter((d) => d.status === s).length;
  const deduction = days.reduce((s, d) => s + d.deduction, 0);
  const extras = days.reduce((s, d) => s + d.extra, 0);
  const holidays = count("holiday");
  const optionalWorked = days.filter((d) => d.holiday?.optional && d.status === "worked").length;
  const months = [...new Set(days.map((d) => d.day.slice(0, 7)))];
  const rateText =
    monthly === null
      ? "no base pay (commission only)"
      : months
          .map((m) => {
            const sample = days.find((d) => d.day.startsWith(m)) as AttendanceDay;
            const wd = Math.round(monthly / (sample.rate as number));
            return `${usd(sample.rate as number)} per day (${n(wd)} working days in ${monthLong.format(parseNyDay(sample.day) as Date)}, holidays excluded)`;
          })
          .join(" · ");
  const halfBase = monthly === null ? null : monthly / 2;
  const periodHolidays = days.filter((d) => d.holiday).map((d) => `${d.short} ${d.holiday?.name}${d.holiday?.optional ? " (optional work day)" : ""}`);
  return {
    period,
    preview,
    monthly,
    halfBase,
    days,
    weeks,
    payableDays: days.length - holidays - optionalWorked,
    worked: count("worked") - optionalWorked,
    unpaid: count("unpaid"),
    excused: count("excused"),
    holidays,
    optionalWorked,
    remaining: count("upcoming") + count("today"),
    deduction,
    extras,
    expected: halfBase === null ? null : halfBase - deduction + extras,
    minDials: cfg.workedDayMinDials,
    rateText,
    notes: [
      `Pay periods — two weeks, Monday to Sunday, the first from ${firstPeriod(now).label}; working days are ${cfg.periods.workingDays.map((w) => DOW[w]).join(", ")}.`,
      `Worked day — a working day with at least ${n(cfg.workedDayMinDials)} outbound dials from you (one per call ID, automated and campaign calls excluded; the same dials as My activity). Fewer is a Non-paid day off. Today is still in progress until midnight New York.`,
      monthly === null ? "Base pay — none: your plan is commission only, so the calendar is informational and nothing is deducted." : `Base pay — ${usd(monthly)} a month, ${usd(monthly / 2)} per period before deductions. Daily rate = monthly base ÷ working days in that calendar month with holidays excluded (${rateText}); a period that spans two months prices each day by its own month. Deduction = the daily rate of every Non-paid day off.`,
      `Holidays — unpaid and left out of the working-day count, so they neither lower the daily rate nor cost a deduction${periodHolidays.length ? ` (this period: ${periodHolidays.join(", ")})` : ""}. An optional work day counts as a worked, paid day at the daily rate when you reach ${n(cfg.workedDayMinDials)} dials; otherwise it is a holiday with no deduction.`,
      "Overrides — an admin can mark a day as approved PTO, sick, company holiday, or excused on the admin Invoices page; the day is then paid and the note is shown here. Every override is logged.",
      "Nothing here changes GHL; dials are read from the local cache.",
    ],
  };
}

/** The current period's attendance, or, before the first period begins, a preview of the two weeks leading up to it under the same rule. */
export function attendanceForNow(rep: Rep, now: Date): Attendance {
  const cur = periodContaining(now, now);
  if (cur) return computeAttendance(rep, cur, now);
  const first = firstPeriod(now);
  const len = payrollConfig().periods.lengthDays;
  const previewStart = new Date(first.start.getTime() - len * 86_400_000);
  const lastDay = nyDayKey(new Date(first.start.getTime() - 86_400_000));
  const p2 = nyParts(parseNyDay(lastDay) as Date);
  const label = `${short.format(previewStart)} – ${short.format(parseNyDay(lastDay) as Date)}, ${p2.y}`;
  const preview: PayPeriod = { index: 0, key: nyDayKey(previewStart), start: previewStart, end: first.start, lastDay, label, ended: false, current: true, upcoming: false };
  return computeAttendance(rep, preview, now, true);
}

// ---- overrides (admin) --------------------------------------------------------------------------------

export function setOverride(userId: string, day: string, kind: OverrideKind, note: string | null, actor: string): void {
  const at = new Date().toISOString();
  const db = getDb();
  db.prepare(`INSERT INTO attendance_overrides (user_id, day, kind, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET kind = excluded.kind, note = excluded.note, created_by = excluded.created_by, created_at = excluded.created_at`).run(userId, day, kind, note, actor, at);
  db.prepare(`INSERT INTO attendance_override_log (user_id, day, action, kind, note, actor, at) VALUES (?, ?, 'set', ?, ?, ?, ?)`).run(userId, day, kind, note, actor, at);
}

export function clearOverride(userId: string, day: string, actor: string): boolean {
  const db = getDb();
  const r = db.prepare(`DELETE FROM attendance_overrides WHERE user_id = ? AND day = ?`).run(userId, day);
  if (r.changes === 0) return false;
  db.prepare(`INSERT INTO attendance_override_log (user_id, day, action, kind, note, actor, at) VALUES (?, ?, 'clear', NULL, NULL, ?, ?)`).run(userId, day, actor, new Date().toISOString());
  return true;
}

export interface OverrideLogRow {
  id: number;
  userId: string;
  day: string;
  action: "set" | "clear";
  kind: OverrideKind | null;
  note: string | null;
  actor: string;
  at: string;
}

export function overrideLog(limit = 50): OverrideLogRow[] {
  return (getDb().prepare(`SELECT id, user_id, day, action, kind, note, actor, at FROM attendance_override_log ORDER BY id DESC LIMIT ?`).all(limit) as unknown as { id: number; user_id: string; day: string; action: string; kind: string | null; note: string | null; actor: string; at: string }[]).map((r) => ({ id: r.id, userId: r.user_id, day: r.day, action: r.action === "clear" ? "clear" : "set", kind: r.kind ? asKind(r.kind) : null, note: r.note, actor: r.actor, at: r.at }));
}

/** Every current override, newest day first. */
export function allOverrides(): AttendanceOverride[] {
  return (getDb().prepare(`SELECT user_id, day, kind, note, created_by, created_at FROM attendance_overrides ORDER BY day DESC`).all() as unknown as { user_id: string; day: string; kind: string; note: string | null; created_by: string; created_at: string }[]).map((r) => ({ userId: r.user_id, day: r.day, kind: asKind(r.kind), note: r.note, createdBy: r.created_by, createdAt: r.created_at }));
}

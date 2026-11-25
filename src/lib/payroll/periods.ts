// Bi-weekly pay periods and the daily base rate (owner request 2026-11-24).
// Periods are lengthDays long (14), Monday to Sunday twice, starting on
// config/payroll.json periods.firstStart and repeating from there, in
// America/New_York. Working days are the configured weekdays (Mon–Fri).
// Daily rate = monthly base ÷ working days in that calendar month, so a
// period that spans two months prices each day by its own month.

import { addDays, dayKeysBetween, fmtDay, nyDayKey, nyParts, parseNyDay, startOfMonth, addMonths } from "@/lib/dates";
import { holidayOn, payrollConfig } from "./config";

export interface PayPeriod {
  /** 1 for the first configured period, then 2, 3, … */
  index: number;
  /** The first day, "YYYY-MM-DD". */
  key: string;
  start: Date;
  /** Exclusive end (the Monday after). */
  end: Date;
  /** The last day, "YYYY-MM-DD". */
  lastDay: string;
  /** "Nov 30 – Dec 13, 2026" */
  label: string;
  /** True once the period's last day is over. */
  ended: boolean;
  /** True while today falls inside the period. */
  current: boolean;
  /** True before the period has started. */
  upcoming: boolean;
}

const MS_DAY = 86_400_000;

function firstStart(): Date {
  const d = parseNyDay(payrollConfig().periods.firstStart);
  if (!d) throw new Error("config/payroll.json periods.firstStart is not a date");
  return d;
}

function build(index: number, start: Date, now: Date): PayPeriod {
  const len = payrollConfig().periods.lengthDays;
  const end = addDays(start, len);
  const last = addDays(start, len - 1);
  const p1 = nyParts(start);
  const p2 = nyParts(last);
  const mon = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short" }).format(d);
  const label = p1.y === p2.y ? `${mon(start)} ${p1.d} – ${mon(last)} ${p2.d}, ${p2.y}` : `${fmtDay(start)} – ${fmtDay(last)}`;
  return { index, key: nyDayKey(start), start, end, lastDay: nyDayKey(last), label, ended: now.getTime() >= end.getTime(), current: now.getTime() >= start.getTime() && now.getTime() < end.getTime(), upcoming: now.getTime() < start.getTime() };
}

/** The period with the given index (1 = the first configured one). */
export function periodAt(index: number, now: Date): PayPeriod {
  const len = payrollConfig().periods.lengthDays;
  return build(index, addDays(firstStart(), (index - 1) * len), now);
}

/** The period containing the instant, or null before the first period. */
export function periodContaining(d: Date, now: Date): PayPeriod | null {
  const start = firstStart();
  if (d.getTime() < start.getTime()) return null;
  const len = payrollConfig().periods.lengthDays;
  // Count whole New York days since the first start, so DST shifts never move a period boundary.
  const days = Math.floor((startOfDayMs(d) - start.getTime() + MS_DAY / 2) / MS_DAY);
  return periodAt(Math.floor(days / len) + 1, now);
}

function startOfDayMs(d: Date): number {
  const k = nyDayKey(d);
  return (parseNyDay(k) as Date).getTime();
}

/** The period for a "YYYY-MM-DD" key, or null when it is not a period start. */
export function periodByKey(key: string, now: Date): PayPeriod | null {
  const d = parseNyDay(key);
  if (!d) return null;
  const p = periodContaining(d, now);
  return p && p.key === key ? p : null;
}

/** Every period from the first through the one containing now (the current one last). Empty before the first period. */
export function periodsThrough(now: Date): PayPeriod[] {
  const cur = periodContaining(now, now);
  if (!cur) return [];
  const out: PayPeriod[] = [];
  for (let i = 1; i <= cur.index; i++) out.push(periodAt(i, now));
  return out;
}

/** The first configured period (for the preview before periods begin). */
export function firstPeriod(now: Date): PayPeriod {
  return periodAt(1, now);
}

/** Working-day keys (configured weekdays) inside [start, end). */
export function workingDayKeysIn(start: Date, end: Date): string[] {
  const wd = payrollConfig().periods.workingDays;
  return dayKeysBetween(start, end).filter((k) => {
    const d = parseNyDay(k);
    return d ? wd.includes(nyParts(d).wd) : false;
  });
}

/** Working days in the calendar month that holds the day key ("YYYY-MM-DD"), holidays excluded (an optional work day is a holiday here too). */
export function workingDaysInMonth(dayKey: string): number {
  const d = parseNyDay(dayKey);
  if (!d) return 0;
  const m0 = startOfMonth(d);
  return workingDayKeysIn(m0, addMonths(m0, 1)).filter((k) => !holidayOn(k)).length;
}

/** The daily base rate for one day: monthly ÷ working days in that day's month (holidays excluded). */
export function dailyRate(monthly: number, dayKey: string): number {
  const wd = workingDaysInMonth(dayKey);
  return wd > 0 ? monthly / wd : 0;
}

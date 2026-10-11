// Date-range logic for reporting. Everything is computed in America/New_York
// (the brief's reporting timezone) without any date library. Instants are
// stored and compared as ISO-8601 UTC strings; only the boundaries of a range
// are derived from New York wall-clock time.

export const REPORTING_TZ = "America/New_York";

export type RangeKey =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "last_year"
  | "custom";

export const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This Week",
  last_week: "Last Week",
  this_month: "This Month",
  last_month: "Last Month",
  this_year: "This Year",
  last_year: "Last Year",
  custom: "Custom",
};

export interface DateRange {
  key: RangeKey;
  /** Human label, e.g. "This Month" */
  label: string;
  /** Inclusive start instant. */
  start: Date;
  /** Exclusive end instant. For period-to-date ranges this is "now". */
  end: Date;
  /** The comparable previous period: same elapsed portion for partial periods. */
  prevStart: Date;
  prevEnd: Date;
  /** True when the period is still in progress (period-to-date). */
  partial: boolean;
  /** The instant the report is "as of" (now). */
  asOf: Date;
}

interface Parts {
  y: number;
  m: number; // 1-12
  d: number;
  h: number;
  mi: number;
  s: number;
  wd: number; // 0 = Sunday
}

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: REPORTING_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
});

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function nyParts(date: Date): Parts {
  const p: Record<string, string> = {};
  for (const part of partsFmt.formatToParts(date)) p[part.type] = part.value;
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    h: Number(p.hour) % 24,
    mi: Number(p.minute),
    s: Number(p.second),
    wd: WEEKDAYS[p.weekday] ?? 0,
  };
}

/** The UTC instant for a New York wall-clock time. Month is 1-12; day may overflow. */
export function nyDate(y: number, m: number, d: number, h = 0, mi = 0, s = 0): Date {
  let guess = Date.UTC(y, m - 1, d, h, mi, s);
  for (let i = 0; i < 3; i++) {
    const p = nyParts(new Date(guess));
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
    const diff = asUtc - guess;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}

export function startOfDay(date: Date): Date {
  const p = nyParts(date);
  return nyDate(p.y, p.m, p.d);
}

export function addDays(date: Date, n: number): Date {
  const p = nyParts(date);
  return nyDate(p.y, p.m, p.d + n, p.h, p.mi, p.s);
}

/** Weeks start on Monday. */
export function startOfWeek(date: Date): Date {
  const p = nyParts(date);
  const back = (p.wd + 6) % 7;
  return nyDate(p.y, p.m, p.d - back);
}

export function startOfMonth(date: Date): Date {
  const p = nyParts(date);
  return nyDate(p.y, p.m, 1);
}

export function addMonths(date: Date, n: number): Date {
  const p = nyParts(date);
  return nyDate(p.y, p.m + n, 1);
}

export function startOfYear(date: Date): Date {
  const p = nyParts(date);
  return nyDate(p.y, 1, 1);
}

/** Parse "YYYY-MM-DD" as a New York calendar day. */
export function parseNyDay(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return undefined;
  const d = nyDate(Number(m[1]), Number(m[2]), Number(m[3]));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function resolveRange(
  key: RangeKey,
  now: Date,
  custom?: { from?: string; to?: string },
): DateRange {
  const sod = startOfDay(now);
  const mk = (start: Date, end: Date, prevStart: Date, prevEnd: Date, partial: boolean): DateRange => ({
    key,
    label: RANGE_LABELS[key],
    start,
    end,
    prevStart,
    prevEnd,
    partial,
    asOf: now,
  });

  switch (key) {
    case "today":
      return mk(sod, now, addDays(sod, -1), addDays(now, -1), true);
    case "yesterday": {
      const s = addDays(sod, -1);
      return mk(s, sod, addDays(sod, -2), s, false);
    }
    case "this_week": {
      const s = startOfWeek(now);
      return mk(s, now, addDays(s, -7), addDays(now, -7), true);
    }
    case "last_week": {
      const s = addDays(startOfWeek(now), -7);
      const e = startOfWeek(now);
      return mk(s, e, addDays(s, -7), s, false);
    }
    case "this_month": {
      const s = startOfMonth(now);
      const ps = addMonths(now, -1);
      const elapsed = now.getTime() - s.getTime();
      const pe = new Date(Math.min(ps.getTime() + elapsed, s.getTime()));
      return mk(s, now, ps, pe, true);
    }
    case "last_month": {
      const s = addMonths(now, -1);
      const e = startOfMonth(now);
      return mk(s, e, addMonths(now, -2), s, false);
    }
    case "this_year": {
      const s = startOfYear(now);
      const p = nyParts(now);
      const ps = nyDate(p.y - 1, 1, 1);
      const elapsed = now.getTime() - s.getTime();
      const pe = new Date(Math.min(ps.getTime() + elapsed, s.getTime()));
      return mk(s, now, ps, pe, true);
    }
    case "last_year": {
      const p = nyParts(now);
      const s = nyDate(p.y - 1, 1, 1);
      const e = nyDate(p.y, 1, 1);
      return mk(s, e, nyDate(p.y - 2, 1, 1), s, false);
    }
    case "custom": {
      const from = parseNyDay(custom?.from) ?? addDays(sod, -6);
      const toDay = parseNyDay(custom?.to) ?? sod;
      const end = addDays(toDay, 1);
      const len = end.getTime() - from.getTime();
      const partial = end.getTime() > now.getTime();
      const effectiveEnd = partial ? now : end;
      return mk(from, effectiveEnd, new Date(from.getTime() - len), new Date(effectiveEnd.getTime() - len), partial);
    }
  }
}

export function isRangeKey(s: string | undefined): s is RangeKey {
  return s !== undefined && Object.prototype.hasOwnProperty.call(RANGE_LABELS, s);
}

const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: REPORTING_TZ, month: "short", day: "numeric", year: "numeric" });
const dayTimeFmt = new Intl.DateTimeFormat("en-US", { timeZone: REPORTING_TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const fullFmt = new Intl.DateTimeFormat("en-US", { timeZone: REPORTING_TZ, dateStyle: "medium", timeStyle: "short" });

export function fmtDay(d: Date): string {
  return dayFmt.format(d);
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "unavailable";
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? "unavailable" : fullFmt.format(date);
}

/** "Oct 1 – Oct 11, 2:35 PM" style description of a range (end exclusive). */
export function fmtRange(start: Date, end: Date, partial: boolean): string {
  if (partial) return `${dayFmt.format(start)} – ${dayTimeFmt.format(end)}`;
  const lastDay = new Date(end.getTime() - 1);
  const a = dayFmt.format(start);
  const b = dayFmt.format(lastDay);
  return a === b ? a : `${a} – ${b}`;
}

/** "YYYY-MM-DD" in New York for a given instant. */
export function nyDayKey(d: Date): string {
  const p = nyParts(d);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** Every New York calendar day key from start to end (exclusive). */
export function dayKeysBetween(start: Date, end: Date): string[] {
  const keys: string[] = [];
  let cur = startOfDay(start);
  while (cur.getTime() < end.getTime()) {
    keys.push(nyDayKey(cur));
    cur = addDays(cur, 1);
  }
  return keys;
}

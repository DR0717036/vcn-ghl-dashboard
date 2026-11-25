// config/payroll.json (owner request 2026-11-24): base pay per rep, the
// bi-weekly period schedule, the worked-day rule, the unpaid holidays, the
// invoice recipients, the monthly summary, and the PDF wording. Read from
// disk with a change check so the owner can edit it without a restart.
// Server-only.

import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "config", "payroll.json");

export interface Holiday {
  day: string;
  name: string;
  /** An optional work day: paid at the daily rate when worked, otherwise a holiday with no deduction. */
  optional: boolean;
}

export interface PayrollConfig {
  /** Monthly base pay by GHL user id; reps not listed are commission-only. */
  basePay: Record<string, { name: string; monthly: number }>;
  periods: { firstStart: string; lengthDays: number; workingDays: number[] };
  workedDayMinDials: number;
  /** Unpaid holidays, excluded from the month's working-day count. */
  holidays: Holiday[];
  recipients: { to: string[]; cc: string[] };
  from: { name: string; address: string };
  monthlySummary: { to: string[]; dayOfMonth: number; hour: number };
  numberPrefix: string;
  payer: string;
  paymentTerms: string;
}

let cache: { mtimeMs: number; cfg: PayrollConfig } | null = null;
const norm = (e: unknown) => (typeof e === "string" ? e.trim().toLowerCase() : "");
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function payrollConfig(): PayrollConfig {
  const mtimeMs = fs.statSync(FILE).mtimeMs;
  if (cache && cache.mtimeMs === mtimeMs) return cache.cfg;
  const raw = JSON.parse(fs.readFileSync(FILE, "utf8")) as Record<string, unknown>;
  const basePay: PayrollConfig["basePay"] = {};
  for (const [id, v] of Object.entries((raw.basePay ?? {}) as Record<string, { name?: unknown; monthly?: unknown }>)) {
    const monthly = typeof v?.monthly === "number" && Number.isFinite(v.monthly) && v.monthly > 0 ? v.monthly : 0;
    if (monthly > 0) basePay[id] = { name: typeof v.name === "string" ? v.name : id, monthly };
  }
  const p = (raw.periods ?? {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.map(norm).filter(Boolean) : []);
  const rec = (raw.recipients ?? {}) as Record<string, unknown>;
  const from = (raw.from ?? {}) as Record<string, unknown>;
  const ms = (raw.monthlySummary ?? {}) as Record<string, unknown>;
  const holidays: Holiday[] = [];
  for (const h of Array.isArray(raw.holidays) ? raw.holidays : []) {
    if (typeof h === "string" && DAY.test(h)) holidays.push({ day: h, name: "Holiday", optional: false });
    else if (h && typeof h === "object" && typeof (h as { day?: unknown }).day === "string" && DAY.test((h as { day: string }).day)) {
      const o = h as { day: string; name?: unknown; optional?: unknown };
      holidays.push({ day: o.day, name: typeof o.name === "string" && o.name.trim() ? o.name.trim() : "Holiday", optional: o.optional === true });
    }
  }
  const cfg: PayrollConfig = {
    basePay,
    periods: {
      firstStart: typeof p.firstStart === "string" && DAY.test(p.firstStart) ? p.firstStart : "2026-11-30",
      lengthDays: typeof p.lengthDays === "number" && p.lengthDays >= 7 ? Math.round(p.lengthDays) : 14,
      workingDays: Array.isArray(p.workingDays) ? p.workingDays.filter((x): x is number => typeof x === "number" && x >= 0 && x <= 6) : [1, 2, 3, 4, 5],
    },
    workedDayMinDials: typeof raw.workedDayMinDials === "number" && raw.workedDayMinDials >= 0 ? Math.round(raw.workedDayMinDials) : 20,
    holidays: holidays.sort((a, b) => a.day.localeCompare(b.day)),
    recipients: { to: list(rec.to), cc: list(rec.cc) },
    from: { name: typeof from.name === "string" && from.name.trim() ? from.name.trim() : "VCN Sales Dashboard", address: norm(from.address) || "info@intelagentmedia.com" },
    monthlySummary: { to: list(ms.to), dayOfMonth: typeof ms.dayOfMonth === "number" && ms.dayOfMonth >= 1 && ms.dayOfMonth <= 28 ? Math.round(ms.dayOfMonth) : 1, hour: typeof ms.hour === "number" && ms.hour >= 0 && ms.hour <= 23 ? Math.round(ms.hour) : 9 },
    numberPrefix: typeof raw.numberPrefix === "string" && raw.numberPrefix.trim() ? raw.numberPrefix.trim() : "VCN",
    payer: typeof raw.payer === "string" && raw.payer.trim() ? raw.payer.trim() : "Intelagent Media",
    paymentTerms: typeof raw.paymentTerms === "string" ? raw.paymentTerms.trim() : "",
  };
  cache = { mtimeMs, cfg };
  return cfg;
}

/** The rep's monthly base pay, or null for a commission-only rep. */
export function basePayFor(userId: string): number | null {
  return payrollConfig().basePay[userId]?.monthly ?? null;
}

/** The holiday on a "YYYY-MM-DD" day, or null. */
export function holidayOn(day: string): Holiday | null {
  return payrollConfig().holidays.find((h) => h.day === day) ?? null;
}

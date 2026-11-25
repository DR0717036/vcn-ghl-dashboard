// Reads and writes for the payroll invoices (payroll_invoices and
// payroll_invoice_events, src/lib/db.ts). A draft has no row: it is computed
// live until the rep sends it; sending inserts the row with the frozen lines
// and totals, and nothing on it changes afterwards except the status. The
// old monthly commission invoices (table invoices, 2026-10-26) are copied in
// once as commission invoices, numbers and PDFs preserved, so history stays
// in one list. Server-only; never GHL.

import { getDb, getState, setState } from "@/lib/db";

export type InvoiceType = "base" | "commission";
export type PayrollStatus = "draft" | "submitted" | "approved" | "paid";
export const STATUS_LABEL: Record<PayrollStatus, string> = { draft: "Draft", submitted: "Submitted", approved: "Approved", paid: "Paid" };
export const TYPE_LABEL: Record<InvoiceType, string> = { base: "Bi-weekly base", commission: "Monthly commission" };

export interface PayrollLine {
  kind: "base" | "day" | "deduction" | "extra" | "bounty" | "submission" | "won";
  /** "Nov 30, 2026" */
  day: string;
  /** ISO instant or day key, for sorting. */
  at: string;
  label: string;
  detail: string;
  rate: number | null;
  amount: number;
}

export interface PayrollTotals {
  base: number;
  deductions: number;
  /** Optional holidays worked, paid at the daily rate. */
  extras: number;
  bounties: number;
  commission: number;
  total: number;
}

export interface Approval {
  email: string;
  at: string;
}

export interface PayrollInvoiceRow {
  id: number;
  userId: string;
  repName: string;
  type: InvoiceType;
  periodKey: string;
  periodLabel: string;
  number: string;
  status: Exclude<PayrollStatus, "draft">;
  amount: number;
  totals: PayrollTotals;
  lines: PayrollLine[];
  /** Base invoices: the non-paid days; commission: the calculation text. */
  summary: string;
  pdfName: string | null;
  submittedAt: string;
  submittedBy: string;
  approvals: Approval[];
  approvedAt: string | null;
  paidAt: string | null;
  paidBy: string | null;
  /** True for a row copied from the old monthly invoice flow. */
  legacy: boolean;
}

export interface PayrollEvent {
  id: number;
  invoiceId: number;
  at: string;
  kind: string;
  actor: string | null;
  detail: string | null;
}

interface Raw {
  id: number;
  user_id: string;
  rep_name: string;
  type: string;
  period_key: string;
  period_label: string;
  number: string;
  status: string;
  amount: number;
  totals: string;
  lines: string;
  summary: string;
  pdf_name: string | null;
  submitted_at: string;
  submitted_by: string;
  approvals: string;
  approved_at: string | null;
  paid_at: string | null;
  paid_by: string | null;
  legacy: number;
}

const COLS = "id, user_id, rep_name, type, period_key, period_label, number, status, amount, totals, lines, summary, pdf_name, submitted_at, submitted_by, approvals, approved_at, paid_at, paid_by, legacy";

function parse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function fromRaw(r: Raw): PayrollInvoiceRow {
  return {
    id: r.id,
    userId: r.user_id,
    repName: r.rep_name,
    type: r.type === "base" ? "base" : "commission",
    periodKey: r.period_key,
    periodLabel: r.period_label,
    number: r.number,
    status: (r.status === "approved" || r.status === "paid" ? r.status : "submitted") as PayrollInvoiceRow["status"],
    amount: r.amount,
    totals: { ...{ base: 0, deductions: 0, extras: 0, bounties: 0, commission: r.amount, total: r.amount }, ...parse<Partial<PayrollTotals>>(r.totals, {}) },
    lines: parse<PayrollLine[]>(r.lines, []),
    summary: r.summary,
    pdfName: r.pdf_name,
    submittedAt: r.submitted_at,
    submittedBy: r.submitted_by,
    approvals: parse<Approval[]>(r.approvals, []),
    approvedAt: r.approved_at,
    paidAt: r.paid_at,
    paidBy: r.paid_by,
    legacy: r.legacy === 1,
  };
}

let migrated = false;

/** Copies the old monthly commission invoices into the payroll table once (idempotent: a copy is skipped when its rep and month already exist). */
export function migrateLegacyInvoices(): void {
  if (migrated) return;
  migrated = true;
  const db = getDb();
  if (getState("payroll_legacy_migrated") === "done") return;
  const old = db.prepare(`SELECT id, user_id, rep_name, month, status, number, amount, calc, lines, pdf, pdf_name, submitted_at, submitted_by, approvals, approved_at, paid_at, paid_by FROM invoices ORDER BY id`).all() as unknown as {
    id: number;
    user_id: string;
    rep_name: string;
    month: string;
    status: string;
    number: string | null;
    amount: number;
    calc: string;
    lines: string;
    pdf: Uint8Array | null;
    pdf_name: string | null;
    submitted_at: string;
    submitted_by: string;
    approvals: string;
    approved_at: string | null;
    paid_at: string | null;
    paid_by: string | null;
  }[];
  const monthFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long", year: "numeric" });
  const ins = db.prepare(
    `INSERT OR IGNORE INTO payroll_invoices (user_id, rep_name, type, period_key, period_label, number, status, amount, totals, lines, summary, pdf, pdf_name, submitted_at, submitted_by, approvals, approved_at, paid_at, paid_by, legacy)
     VALUES (?, ?, 'commission', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  );
  const evIns = db.prepare(`INSERT INTO payroll_invoice_events (invoice_id, at, kind, actor, detail) VALUES (?, ?, ?, ?, ?)`);
  for (const o of old) {
    const [y, m] = o.month.split("-").map(Number);
    const label = monthFmt.format(new Date(Date.UTC(y, m - 1, 15)));
    const oldLines = parse<{ eventDay: string; eventAt: string; contactName: string; program: string; event: string; rate: number; amount: number; tier: string; kind: string }[]>(o.lines, []);
    const lines: PayrollLine[] = oldLines.map((l) => ({ kind: l.kind === "won" ? "won" : "submission", day: l.eventDay, at: l.eventAt, label: l.contactName, detail: `${l.program} · ${l.event}${l.tier ? ` (${l.tier})` : ""}`, rate: l.rate, amount: l.amount }));
    const totals: PayrollTotals = { base: 0, deductions: 0, extras: 0, bounties: 0, commission: o.amount, total: o.amount };
    const res = ins.run(o.user_id, o.rep_name, o.month, label, o.number ?? `VCN-${o.month.replace("-", "")}-${String(o.id).padStart(3, "0")}`, o.status, o.amount, JSON.stringify(totals), JSON.stringify(lines), o.calc, o.pdf ?? null, o.pdf_name, o.submitted_at, o.submitted_by, o.approvals, o.approved_at, o.paid_at, o.paid_by);
    if (res.changes > 0) {
      const newId = Number(res.lastInsertRowid);
      for (const e of db.prepare(`SELECT at, kind, actor, detail FROM invoice_events WHERE invoice_id = ? ORDER BY id`).all(o.id) as unknown as { at: string; kind: string; actor: string | null; detail: string | null }[]) evIns.run(newId, e.at, e.kind, e.actor, e.detail);
      evIns.run(newId, new Date().toISOString(), "migrated", null, `copied from the monthly invoice flow (invoices #${o.id})`);
    }
  }
  setState("payroll_legacy_migrated", "done");
}

export function payrollInvoiceFor(userId: string, type: InvoiceType, periodKey: string): PayrollInvoiceRow | null {
  migrateLegacyInvoices();
  const r = getDb().prepare(`SELECT ${COLS} FROM payroll_invoices WHERE user_id = ? AND type = ? AND period_key = ?`).get(userId, type, periodKey) as Raw | undefined;
  return r ? fromRaw(r) : null;
}

export function payrollInvoiceById(id: number): PayrollInvoiceRow | null {
  migrateLegacyInvoices();
  const r = getDb().prepare(`SELECT ${COLS} FROM payroll_invoices WHERE id = ?`).get(id) as Raw | undefined;
  return r ? fromRaw(r) : null;
}

export function payrollInvoicePdf(id: number): { data: Buffer; name: string } | null {
  const r = getDb().prepare(`SELECT pdf, pdf_name FROM payroll_invoices WHERE id = ?`).get(id) as { pdf: Uint8Array | null; pdf_name: string | null } | undefined;
  return r?.pdf ? { data: Buffer.from(r.pdf), name: r.pdf_name ?? "invoice.pdf" } : null;
}

/** Every stored payroll invoice, newest period first, optionally for one rep. */
export function listPayrollInvoices(userId?: string): PayrollInvoiceRow[] {
  migrateLegacyInvoices();
  const rows = (userId ? getDb().prepare(`SELECT ${COLS} FROM payroll_invoices WHERE user_id = ? ORDER BY period_key DESC, type, rep_name`).all(userId) : getDb().prepare(`SELECT ${COLS} FROM payroll_invoices ORDER BY period_key DESC, type, rep_name`).all()) as unknown as Raw[];
  return rows.map(fromRaw);
}

/** Inserts the sent invoice; null when that rep, type, and period already have one (a period can be invoiced once). */
export function insertPayrollInvoice(x: { userId: string; repName: string; type: InvoiceType; periodKey: string; periodLabel: string; number: string; amount: number; totals: PayrollTotals; lines: PayrollLine[]; summary: string; submittedBy: string }): PayrollInvoiceRow | null {
  migrateLegacyInvoices();
  try {
    const res = getDb()
      .prepare(`INSERT INTO payroll_invoices (user_id, rep_name, type, period_key, period_label, number, status, amount, totals, lines, summary, submitted_at, submitted_by) VALUES (?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?, ?, ?, ?)`)
      .run(x.userId, x.repName, x.type, x.periodKey, x.periodLabel, x.number, x.amount, JSON.stringify(x.totals), JSON.stringify(x.lines), x.summary, new Date().toISOString(), x.submittedBy);
    return payrollInvoiceById(Number(res.lastInsertRowid));
  } catch (e) {
    if (/UNIQUE constraint failed/i.test((e as Error).message)) return null;
    throw e;
  }
}

export function storePayrollPdf(id: number, data: Buffer, name: string): void {
  getDb().prepare(`UPDATE payroll_invoices SET pdf = ?, pdf_name = ? WHERE id = ?`).run(data, name, id);
}

export function setPayrollApprovals(id: number, approvals: Approval[], approvedAt: string | null): void {
  getDb().prepare(`UPDATE payroll_invoices SET approvals = ?, approved_at = ?, status = CASE WHEN ? IS NULL THEN status ELSE 'approved' END WHERE id = ?`).run(JSON.stringify(approvals), approvedAt, approvedAt, id);
}

export function setPayrollPaid(id: number, by: string): void {
  getDb().prepare(`UPDATE payroll_invoices SET status = 'paid', paid_at = ?, paid_by = ? WHERE id = ?`).run(new Date().toISOString(), by, id);
}

export function addPayrollEvent(invoiceId: number, kind: string, actor: string | null, detail: string | null): void {
  getDb().prepare(`INSERT INTO payroll_invoice_events (invoice_id, at, kind, actor, detail) VALUES (?, ?, ?, ?, ?)`).run(invoiceId, new Date().toISOString(), kind, actor, detail);
}

export function payrollEvents(invoiceId: number): PayrollEvent[] {
  return getDb().prepare(`SELECT id, invoice_id AS invoiceId, at, kind, actor, detail FROM payroll_invoice_events WHERE invoice_id = ? ORDER BY id`).all(invoiceId) as unknown as PayrollEvent[];
}

// Reads and writes for the invoices and invoice_events tables (src/lib/db.ts).
// A "draft" invoice has no row: it is computed live from the cache until the
// rep sends it for review. Server-only; never GHL.

import { getDb } from "@/lib/db";
import type { InvoiceLine } from "./lines";

export type InvoiceStatus = "draft" | "submitted" | "approved" | "paid";

export interface Approval {
  email: string;
  at: string;
}

export interface InvoiceRow {
  id: number;
  userId: string;
  repName: string;
  month: string;
  status: Exclude<InvoiceStatus, "draft">;
  number: string;
  amount: number;
  calc: string;
  planKey: string;
  lines: InvoiceLine[];
  pdfName: string | null;
  submittedAt: string;
  submittedBy: string;
  approvals: Approval[];
  approvedAt: string | null;
  paidAt: string | null;
  paidBy: string | null;
}

export interface InvoiceEvent {
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
  month: string;
  status: string;
  number: string | null;
  amount: number;
  calc: string;
  plan_key: string;
  lines: string;
  pdf_name: string | null;
  submitted_at: string;
  submitted_by: string;
  approvals: string;
  approved_at: string | null;
  paid_at: string | null;
  paid_by: string | null;
}

const COLS = "id, user_id, rep_name, month, status, number, amount, calc, plan_key, lines, pdf_name, submitted_at, submitted_by, approvals, approved_at, paid_at, paid_by";

function parse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function fromRaw(r: Raw): InvoiceRow {
  return {
    id: r.id,
    userId: r.user_id,
    repName: r.rep_name,
    month: r.month,
    status: (r.status === "approved" || r.status === "paid" ? r.status : "submitted") as InvoiceRow["status"],
    number: r.number ?? `VCN-${r.month.replace("-", "")}-${String(r.id).padStart(3, "0")}`,
    amount: r.amount,
    calc: r.calc,
    planKey: r.plan_key,
    lines: parse<InvoiceLine[]>(r.lines, []),
    pdfName: r.pdf_name,
    submittedAt: r.submitted_at,
    submittedBy: r.submitted_by,
    approvals: parse<Approval[]>(r.approvals, []),
    approvedAt: r.approved_at,
    paidAt: r.paid_at,
    paidBy: r.paid_by,
  };
}

export function invoiceFor(userId: string, month: string): InvoiceRow | null {
  const r = getDb().prepare(`SELECT ${COLS} FROM invoices WHERE user_id = ? AND month = ?`).get(userId, month) as Raw | undefined;
  return r ? fromRaw(r) : null;
}

export function invoiceById(id: number): InvoiceRow | null {
  const r = getDb().prepare(`SELECT ${COLS} FROM invoices WHERE id = ?`).get(id) as Raw | undefined;
  return r ? fromRaw(r) : null;
}

export function invoicePdf(id: number): { data: Buffer; name: string } | null {
  const r = getDb().prepare(`SELECT pdf, pdf_name FROM invoices WHERE id = ?`).get(id) as { pdf: Uint8Array | null; pdf_name: string | null } | undefined;
  return r?.pdf ? { data: Buffer.from(r.pdf), name: r.pdf_name ?? "invoice.pdf" } : null;
}

/** Every stored invoice, newest month first, optionally for one rep. */
export function listInvoices(userId?: string): InvoiceRow[] {
  const rows = (userId ? getDb().prepare(`SELECT ${COLS} FROM invoices WHERE user_id = ? ORDER BY month DESC, rep_name`).all(userId) : getDb().prepare(`SELECT ${COLS} FROM invoices ORDER BY month DESC, rep_name`).all()) as unknown as Raw[];
  return rows.map(fromRaw);
}

/** Inserts the submitted invoice; returns null when a row for that rep and month already exists. */
export function insertInvoice(x: { userId: string; repName: string; month: string; amount: number; calc: string; planKey: string; lines: InvoiceLine[]; submittedBy: string }): InvoiceRow | null {
  const db = getDb();
  try {
    const res = db
      .prepare(`INSERT INTO invoices (user_id, rep_name, month, status, amount, calc, plan_key, lines, submitted_at, submitted_by) VALUES (?, ?, ?, 'submitted', ?, ?, ?, ?, ?, ?)`)
      .run(x.userId, x.repName, x.month, x.amount, x.calc, x.planKey, JSON.stringify(x.lines), new Date().toISOString(), x.submittedBy);
    const id = Number(res.lastInsertRowid);
    const number = `VCN-${x.month.replace("-", "")}-${String(id).padStart(3, "0")}`;
    db.prepare(`UPDATE invoices SET number = ? WHERE id = ?`).run(number, id);
    return invoiceById(id);
  } catch (e) {
    if (/UNIQUE constraint failed/i.test((e as Error).message)) return null;
    throw e;
  }
}

export function storeInvoicePdf(id: number, data: Buffer, name: string): void {
  getDb().prepare(`UPDATE invoices SET pdf = ?, pdf_name = ? WHERE id = ?`).run(data, name, id);
}

export function setApprovals(id: number, approvals: Approval[], approvedAt: string | null): void {
  getDb().prepare(`UPDATE invoices SET approvals = ?, approved_at = ?, status = CASE WHEN ? IS NULL THEN status ELSE 'approved' END WHERE id = ?`).run(JSON.stringify(approvals), approvedAt, approvedAt, id);
}

export function setPaid(id: number, by: string): void {
  getDb().prepare(`UPDATE invoices SET status = 'paid', paid_at = ?, paid_by = ? WHERE id = ?`).run(new Date().toISOString(), by, id);
}

export function addInvoiceEvent(invoiceId: number, kind: string, actor: string | null, detail: string | null): void {
  getDb().prepare(`INSERT INTO invoice_events (invoice_id, at, kind, actor, detail) VALUES (?, ?, ?, ?, ?)`).run(invoiceId, new Date().toISOString(), kind, actor, detail);
}

export function invoiceEvents(invoiceId: number): InvoiceEvent[] {
  return (getDb().prepare(`SELECT id, invoice_id AS invoiceId, at, kind, actor, detail FROM invoice_events WHERE invoice_id = ? ORDER BY id`).all(invoiceId) as unknown as InvoiceEvent[]);
}

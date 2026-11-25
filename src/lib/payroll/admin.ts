// Admin side of payroll invoicing (owner request 2026-11-24): approvals (every
// address in config/invoices.json approvers must approve), marking paid,
// the rep's status emails, the filtered invoice list, CSV exports, and the
// monthly summary of invoices due sent on the 1st. Everything lives in this
// dashboard's cache; GHL is never touched.

import { fmtDateTime, fmtDay, nyDate, nyParts } from "@/lib/dates";
import { getState, setState } from "@/lib/db";
import { invoicesConfig, isApprover } from "@/lib/invoices/config";
import { gmailConfigured, sendGmail, type MailMessage } from "@/lib/mailer";
import { salesReps, type Rep } from "@/lib/reps";
import { dashboardBaseUrl } from "@/lib/weeklyReport/config";
import { payrollConfig } from "./config";
import { repInvoices, type InvoiceDraft } from "./invoices";
import { addPayrollEvent, listPayrollInvoices, payrollInvoiceById, setPayrollApprovals, setPayrollPaid, STATUS_LABEL, TYPE_LABEL, type InvoiceType, type PayrollInvoiceRow, type PayrollStatus } from "./store";

const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const n = (v: number) => v.toLocaleString("en-US");

export type ActionResult = { ok: true; invoice: PayrollInvoiceRow; message: string } | { ok: false; error: string };

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

function shell(title: string, intro: string, body: string, button: { label: string; url: string } | null, foot: string): string {
  const btn = button ? `<p style="margin:20px 0"><a href="${esc(button.url)}" style="background:#1677ff;color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:8px;display:inline-block">${esc(button.label)}</a></p>` : "";
  return `<!doctype html><html><body style="margin:0;background:#e4eaf1;font-family:Manrope,'Helvetica Neue',Arial,sans-serif;color:#182536"><div style="max-width:640px;margin:0 auto;padding:24px"><div style="background:#f4f7fb;border:1px solid #c3cfdd;border-radius:14px;padding:24px"><div style="font-size:11px;letter-spacing:.08em;color:#1677ff;font-weight:700;margin-bottom:6px">INTELAGENT MEDIA · VCN SALES DASHBOARD</div><h1 style="font-size:20px;margin:0 0 8px">${esc(title)}</h1><p style="margin:0 0 16px;color:#46566a">${intro}</p>${body}${btn}<p style="margin:16px 0 0;font-size:12px;color:#5b6b7f">${esc(foot)}</p></div></div></body></html>`;
}

function linkTo(path: string): string | null {
  const base = dashboardBaseUrl();
  return base ? `${base}${path}` : null;
}

async function mail(inv: PayrollInvoiceRow | null, msg: Omit<MailMessage, "from">): Promise<{ ok: boolean; detail: string }> {
  const cfg = payrollConfig();
  const ok = gmailConfigured();
  const who = [...msg.to, ...(msg.cc ?? [])].join(", ");
  if (!ok.ok) {
    if (inv) addPayrollEvent(inv.id, "email_failed", null, `${who}: ${ok.reason}`);
    return { ok: false, detail: ok.reason ?? "mail not configured" };
  }
  try {
    const r = await sendGmail({ from: cfg.from, ...msg });
    if (inv) addPayrollEvent(inv.id, "email", null, `${msg.subject} → ${who} (${r.messageId})`);
    return { ok: true, detail: r.messageId };
  } catch (e) {
    if (inv) addPayrollEvent(inv.id, "email_failed", null, `${who}: ${(e as Error).message}`);
    console.error(`[payroll] email to ${who} failed: ${(e as Error).message}`);
    return { ok: false, detail: (e as Error).message };
  }
}

/** The rep is emailed at each status change (their sign-in address). */
async function notifyRep(inv: PayrollInvoiceRow, subject: string, body: string): Promise<void> {
  const rep = salesReps.find((r) => r.userId === inv.userId);
  const to = rep?.signInEmail?.trim().toLowerCase() || null;
  if (!to) {
    addPayrollEvent(inv.id, "email_failed", null, "rep has no signInEmail; not notified");
    return;
  }
  const url = linkTo(`/invoices/${inv.type}/${inv.periodKey}`);
  await mail(inv, { to: [to], subject, text: `${body}${url ? `\n\n${url}` : ""}`, html: shell(`Invoice ${inv.number}`, esc(body), "", url ? { label: "See its status", url } : null, payrollConfig().paymentTerms) });
}

/** One approver approves. The status turns Approved once every configured approver has. */
export async function approvePayrollInvoice(id: number, adminEmail: string): Promise<ActionResult> {
  const inv = payrollInvoiceById(id);
  if (!inv) return { ok: false, error: "Unknown invoice." };
  const email = adminEmail.trim().toLowerCase();
  const cfg = invoicesConfig();
  if (!isApprover(email)) return { ok: false, error: `Only ${cfg.approvers.join(" and ")} can approve invoices.` };
  if (inv.status !== "submitted") return { ok: false, error: `This invoice is ${STATUS_LABEL[inv.status]}; only a Submitted invoice can be approved.` };
  if (inv.approvals.some((a) => a.email === email)) return { ok: false, error: "You already approved this invoice." };
  const approvals = [...inv.approvals, { email, at: new Date().toISOString() }];
  const complete = cfg.approvers.every((a) => approvals.some((x) => x.email === a));
  setPayrollApprovals(id, approvals, complete ? new Date().toISOString() : null);
  addPayrollEvent(id, "approval", email, complete ? "final approval" : `${approvals.length} of ${cfg.approvers.length} approvals`);
  if (complete) addPayrollEvent(id, "approved", email, null);
  const updated = payrollInvoiceById(id) ?? inv;
  const what = `${inv.periodLabel} ${inv.type === "base" ? "base pay" : "commission"} invoice (${inv.number}, ${usd(inv.amount)})`;
  if (complete) await notifyRep(updated, `Your ${inv.type === "base" ? "base pay" : "commission"} invoice is approved · ${inv.number} · ${usd(inv.amount)}`, `Your ${what} has been approved by ${cfg.approvers.join(" and ")}. It will show as Paid once it has been paid.`);
  else await notifyRep(updated, `Your invoice ${inv.number}: ${approvals.length} of ${cfg.approvers.length} approvals`, `${email} approved your ${what}. ${cfg.approvers.length - approvals.length} more approval${cfg.approvers.length - approvals.length === 1 ? "" : "s"} needed before it is Approved.`);
  return { ok: true, invoice: updated, message: complete ? "Approved by everyone; the rep has been told." : `Recorded (${approvals.length} of ${cfg.approvers.length} approvals).` };
}

/** An admin marks an approved invoice paid. */
export async function markPayrollPaid(id: number, adminEmail: string): Promise<ActionResult> {
  const inv = payrollInvoiceById(id);
  if (!inv) return { ok: false, error: "Unknown invoice." };
  if (inv.status !== "approved") return { ok: false, error: `This invoice is ${STATUS_LABEL[inv.status]}; only an Approved invoice can be marked paid.` };
  const email = adminEmail.trim().toLowerCase();
  setPayrollPaid(id, email);
  addPayrollEvent(id, "paid", email, null);
  const updated = payrollInvoiceById(id) ?? inv;
  await notifyRep(updated, `Your invoice ${inv.number} is marked paid · ${usd(inv.amount)}`, `Your ${inv.periodLabel} ${inv.type === "base" ? "base pay" : "commission"} invoice (${inv.number}, ${usd(inv.amount)}) was marked paid by ${email}.`);
  return { ok: true, invoice: updated, message: "Marked paid; the rep has been told." };
}

// ---- the admin list -----------------------------------------------------------------------------------

export interface AdminFilters {
  rep?: string;
  type?: InvoiceType | "";
  status?: PayrollStatus | "";
  /** "YYYY-MM" or a period start "YYYY-MM-DD"; a month matches every period that starts in it. */
  period?: string;
}

export interface AdminInvoiceRow {
  rep: Rep | null;
  repName: string;
  userId: string;
  type: InvoiceType;
  key: string;
  label: string;
  periodLabel: string;
  status: PayrollStatus;
  amount: number;
  flaggedDays: number;
  available: boolean;
  unavailableReason: string | null;
  stored: PayrollInvoiceRow | null;
  number: string;
}

/** Every rep's invoices, stored or live drafts, newest period first, through the filters. */
export function adminInvoiceRows(now: Date, f: AdminFilters = {}): AdminInvoiceRow[] {
  const out: AdminInvoiceRow[] = [];
  const push = (rep: Rep, d: InvoiceDraft) => out.push({ rep, repName: rep.name, userId: rep.userId, type: d.type, key: d.key, label: d.label, periodLabel: d.periodLabel, status: d.status, amount: d.amount, flaggedDays: d.flaggedDays, available: d.available, unavailableReason: d.unavailableReason, stored: d.stored, number: d.stored?.number ?? d.number });
  for (const rep of salesReps) {
    if (f.rep && rep.userId !== f.rep) continue;
    const inv = repInvoices(rep, now);
    for (const d of [...inv.base, ...inv.commission]) push(rep, d);
  }
  // Stored invoices for reps no longer in the roster still list (history never disappears).
  for (const s of listPayrollInvoices()) {
    if (f.rep && s.userId !== f.rep) continue;
    if (out.some((r) => r.userId === s.userId && r.type === s.type && r.key === s.periodKey)) continue;
    out.push({ rep: null, repName: s.repName, userId: s.userId, type: s.type, key: s.periodKey, label: s.periodLabel, periodLabel: s.periodLabel, status: s.status, amount: s.amount, flaggedDays: 0, available: false, unavailableReason: null, stored: s, number: s.number });
  }
  return out
    .filter((r) => (!f.type || r.type === f.type) && (!f.status || r.status === f.status) && (!f.period || r.key.startsWith(f.period)))
    .sort((a, b) => b.key.localeCompare(a.key) || a.type.localeCompare(b.type) || a.repName.localeCompare(b.repName));
}

const csvCell = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** One row per invoice. */
export function invoicesCsv(rows: AdminInvoiceRow[]): string {
  const head = ["Rep", "Type", "Period", "Period label", "Invoice number", "Status", "Amount", "Base", "Non-paid days", "Extras", "Bounties", "Commission", "Flagged days", "Sent at", "Approved at", "Paid at"];
  const lines = rows.map((r) => {
    const t = r.stored?.totals;
    return [r.repName, TYPE_LABEL[r.type], r.key, r.periodLabel, r.number, STATUS_LABEL[r.status], r.amount.toFixed(2), t ? t.base.toFixed(2) : "", t ? t.deductions.toFixed(2) : "", t ? (t.extras ?? 0).toFixed(2) : "", t ? t.bounties.toFixed(2) : "", t ? t.commission.toFixed(2) : "", String(r.flaggedDays), r.stored?.submittedAt ?? "", r.stored?.approvedAt ?? "", r.stored?.paidAt ?? ""].map(csvCell).join(",");
  });
  return "﻿" + [head.join(","), ...lines].join("\r\n") + "\r\n";
}

/** The line items of one stored invoice. */
export function invoiceLinesCsv(inv: PayrollInvoiceRow): string {
  const head = ["Invoice number", "Rep", "Type", "Period", "Date", "Kind", "Item", "Detail", "Rate", "Amount"];
  const lines = inv.lines.map((l) => [inv.number, inv.repName, TYPE_LABEL[inv.type], inv.periodLabel, l.day, l.kind, l.label, l.detail, l.rate === null ? "" : l.rate.toFixed(2), l.amount.toFixed(2)].map(csvCell).join(","));
  lines.push(["", "", "", "", "", "total", "Total due", inv.summary, "", inv.amount.toFixed(2)].map(csvCell).join(","));
  return "﻿" + [head.join(","), ...lines].join("\r\n") + "\r\n";
}

// ---- the monthly summary (the 1st) ---------------------------------------------------------------------

export interface MonthlySummary {
  monthLabel: string;
  generatedAt: string;
  /** Sent and not yet paid. */
  due: AdminInvoiceRow[];
  dueTotal: number;
  /** Periods that have ended and could be sent but have not been. */
  unsent: AdminInvoiceRow[];
  unsentTotal: number;
  paidLastMonth: AdminInvoiceRow[];
  paidLastMonthTotal: number;
}

const monthFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long", year: "numeric" });

export function monthlySummary(now: Date): MonthlySummary {
  const rows = adminInvoiceRows(now);
  const due = rows.filter((r) => r.status === "submitted" || r.status === "approved");
  const unsent = rows.filter((r) => r.status === "draft" && r.available && r.amount > 0);
  const p = nyParts(now);
  const lastMonth = `${p.m === 1 ? p.y - 1 : p.y}-${String(p.m === 1 ? 12 : p.m - 1).padStart(2, "0")}`;
  const paidLastMonth = rows.filter((r) => r.status === "paid" && (r.stored?.paidAt ?? "").startsWith(lastMonth));
  const sum = (l: AdminInvoiceRow[]) => Math.round(l.reduce((s, r) => s + r.amount, 0) * 100) / 100;
  return { monthLabel: monthFmt.format(now), generatedAt: fmtDateTime(now), due, dueTotal: sum(due), unsent, unsentTotal: sum(unsent), paidLastMonth, paidLastMonthTotal: sum(paidLastMonth) };
}

function summaryTable(rows: AdminInvoiceRow[], empty: string): string {
  if (rows.length === 0) return `<p style="margin:4px 0 12px;color:#5b6b7f">${esc(empty)}</p>`;
  const tr = rows.map((r) => `<tr><td style="padding:4px 8px 4px 0">${esc(r.repName)}</td><td style="padding:4px 8px 4px 0;color:#46566a">${esc(TYPE_LABEL[r.type])} · ${esc(r.periodLabel)}</td><td style="padding:4px 8px 4px 0;color:#46566a;white-space:nowrap">${esc(r.number)}</td><td style="padding:4px 8px 4px 0">${esc(STATUS_LABEL[r.status])}${r.stored && r.stored.approvals.length ? ` (${r.stored.approvals.length} approval${r.stored.approvals.length === 1 ? "" : "s"})` : ""}</td><td style="padding:4px 0;text-align:right;white-space:nowrap">${usd(r.amount)}</td></tr>`).join("");
  return `<table style="border-collapse:collapse;width:100%;font-size:13px;margin:4px 0 12px">${tr}</table>`;
}

export function monthlySummaryHtml(s: MonthlySummary): { subject: string; html: string; text: string } {
  const url = linkTo("/invoices");
  const subject = `Invoices due · ${s.monthLabel} · ${usd(s.dueTotal)} outstanding, ${n(s.unsent.length)} not yet sent`;
  const body =
    `<h2 style="font-size:15px;margin:16px 0 4px">Outstanding (sent, not yet paid) · ${usd(s.dueTotal)}</h2>${summaryTable(s.due, "Nothing outstanding.")}` +
    `<h2 style="font-size:15px;margin:16px 0 4px">Ended periods not yet sent by the rep · ${usd(s.unsentTotal)}</h2>${summaryTable(s.unsent, "Every ended period has been sent.")}` +
    `<h2 style="font-size:15px;margin:16px 0 4px">Paid last month · ${usd(s.paidLastMonthTotal)}</h2>${summaryTable(s.paidLastMonth, "Nothing marked paid last month.")}`;
  const html = shell(`Invoices due · ${s.monthLabel}`, `Every rep invoice that still needs attention as of ${esc(s.generatedAt)}: approvals, payments, and periods the reps have not sent yet.`, body, url ? { label: "Open the Invoices page", url } : null, "Sent on the 1st of each month by the VCN Sales Dashboard (config/payroll.json monthlySummary). Amounts are estimated from dashboard counts; the approved invoice is the record.");
  const line = (r: AdminInvoiceRow) => `  ${r.repName} · ${TYPE_LABEL[r.type]} · ${r.periodLabel} · ${r.number} · ${STATUS_LABEL[r.status]} · ${usd(r.amount)}`;
  const text = `Invoices due · ${s.monthLabel} (as of ${s.generatedAt})\n\nOutstanding (sent, not yet paid) · ${usd(s.dueTotal)}\n${s.due.map(line).join("\n") || "  none"}\n\nEnded periods not yet sent · ${usd(s.unsentTotal)}\n${s.unsent.map(line).join("\n") || "  none"}\n\nPaid last month · ${usd(s.paidLastMonthTotal)}\n${s.paidLastMonth.map(line).join("\n") || "  none"}\n${url ? `\n${url}` : ""}`;
  return { subject, html, text };
}

/** Sends the summary to the given addresses (a test) or to the configured list. */
export async function sendMonthlySummary(now: Date, to?: string[]): Promise<{ ok: boolean; detail: string; subject: string }> {
  const cfg = payrollConfig();
  const recipients = to && to.length ? to : cfg.monthlySummary.to;
  if (recipients.length === 0) return { ok: false, detail: "monthlySummary.to is empty in config/payroll.json", subject: "" };
  const s = monthlySummary(now);
  const m = monthlySummaryHtml(s);
  const r = await mail(null, { to: recipients, subject: (to ? "[TEST] " : "") + m.subject, text: m.text, html: m.html });
  return { ...r, subject: m.subject };
}

/** Called every minute by the scheduler: sends once per month, on the configured day at or after the configured hour (New York), catching up within the same day. */
export async function maybeSendMonthlySummary(now: Date): Promise<void> {
  const cfg = payrollConfig();
  const p = nyParts(now);
  if (p.d !== cfg.monthlySummary.dayOfMonth || p.h < cfg.monthlySummary.hour) return;
  const key = `payroll_summary_sent_${p.y}-${String(p.m).padStart(2, "0")}`;
  if (getState(key)) return;
  setState(key, now.toISOString());
  const r = await sendMonthlySummary(now);
  console.log(`[payroll] monthly summary ${r.ok ? "sent" : "NOT sent"}: ${r.subject || r.detail}${r.ok ? "" : ` (${r.detail})`}`);
  if (!r.ok) setState(key, `failed ${now.toISOString()}: ${r.detail}`);
}

/** The next run time, for the admin check. */
export function nextSummaryAt(now: Date): string {
  const cfg = payrollConfig();
  const p = nyParts(now);
  const thisMonth = nyDate(p.y, p.m, cfg.monthlySummary.dayOfMonth, cfg.monthlySummary.hour);
  const next = thisMonth.getTime() > now.getTime() ? thisMonth : nyDate(p.m === 12 ? p.y + 1 : p.y, p.m === 12 ? 1 : p.m + 1, cfg.monthlySummary.dayOfMonth, cfg.monthlySummary.hour);
  return `${fmtDay(next)} ${cfg.monthlySummary.hour}:00 New York`;
}

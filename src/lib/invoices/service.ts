// Rep commission invoices (owner request 2026-10-26). A rep's invoice for a
// month is the commission estimate from their plan for that month, itemized
// by the contacts that earned it (src/lib/invoices/lines.ts). Months become
// available on the 1st of the following month; the current month is a live
// preview. "Send for review" freezes the amount and the lines, renders the
// PDF, stores it (status Submitted), and emails it from the configured
// sender to the review recipients with an approve link. Every configured
// approver must approve before the status becomes Approved; "Mark paid"
// follows. The rep is emailed at each change. All data lives in this
// dashboard's cache; nothing here touches GHL.

import { addMonths, fmtDateTime, fmtDay, nyDate, nyParts, startOfMonth } from "@/lib/dates";
import { gmailConfigured, sendGmail, type MailMessage } from "@/lib/mailer";
import { planText } from "@/lib/me/commission";
import { salesReps, type Rep } from "@/lib/reps";
import { HISTORY_START } from "@/lib/sync/core";
import { dashboardBaseUrl } from "@/lib/weeklyReport/config";
import { invoicesConfig, isApprover } from "./config";
import { computeInvoiceLines, type InvoiceLine, type InvoiceLines } from "./lines";
import { renderInvoicePdf } from "./pdf";
import { addInvoiceEvent, insertInvoice, invoiceById, invoiceEvents, invoiceFor, listInvoices, setApprovals, setPaid, storeInvoicePdf, type InvoiceEvent, type InvoiceRow, type InvoiceStatus } from "./store";

export const STATUS_LABEL: Record<InvoiceStatus, string> = { draft: "Draft", submitted: "Submitted", approved: "Approved", paid: "Paid" };

const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const monthFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long", year: "numeric" });

/** "2026-10" for an instant's New York calendar month. */
export function monthKeyOf(d: Date): string {
  const p = nyParts(d);
  return `${p.y}-${String(p.m).padStart(2, "0")}`;
}

export function monthStartOf(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = nyDate(Number(m[1]), Number(m[2]), 1);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface InvoiceMonth {
  key: string;
  label: string;
  /** "Oct 1 – Oct 26, 2026" (through today for the current month). */
  periodLabel: string;
  current: boolean;
  /** False until the 1st of the following month. */
  available: boolean;
  status: InvoiceStatus;
  amount: number;
  calc: string;
  lineCount: number;
  stored: InvoiceRow | null;
  /** The month starts before milestone tracking began. */
  partial: boolean;
}

export interface InvoiceView extends InvoiceMonth {
  rep: Rep;
  lines: InvoiceLine[];
  planText: string;
  reconciled: boolean;
  events: InvoiceEvent[];
  approvers: string[];
  canSubmit: boolean;
  notes: string[];
}

function liveLines(rep: Rep, mStart: Date, now: Date): { lines: InvoiceLines; end: Date; current: boolean } {
  const mEnd = addMonths(mStart, 1);
  const current = mEnd.getTime() > now.getTime();
  const end = current ? now : mEnd;
  return { lines: computeInvoiceLines(rep, mStart, end), end, current };
}

function monthOf(rep: Rep, mStart: Date, now: Date, stored: InvoiceRow | null): InvoiceMonth {
  const key = monthKeyOf(mStart);
  const { lines, end, current } = stored ? { lines: null, end: current_(mStart, now) ? now : addMonths(mStart, 1), current: current_(mStart, now) } : liveLines(rep, mStart, now);
  return {
    key,
    label: monthFmt.format(mStart),
    periodLabel: `${fmtDay(mStart)} – ${fmtDay(new Date(end.getTime() - (current ? 0 : 1)))}`,
    current,
    available: !current,
    status: stored ? stored.status : "draft",
    amount: stored ? stored.amount : (lines?.total ?? 0),
    calc: stored ? stored.calc : (lines?.calc ?? ""),
    lineCount: stored ? stored.lines.length : (lines?.lines.length ?? 0),
    stored,
    partial: mStart.toISOString() < HISTORY_START,
  };
}

function current_(mStart: Date, now: Date): boolean {
  return addMonths(mStart, 1).getTime() > now.getTime();
}

/** The months a rep's invoice page lists: the current month (live) and the past months back to the history start. */
export function invoiceMonths(rep: Rep, now: Date): InvoiceMonth[] {
  const cfg = invoicesConfig();
  const stored = new Map(listInvoices(rep.userId).map((r) => [r.month, r]));
  const out: InvoiceMonth[] = [];
  const thisStart = startOfMonth(now);
  for (let back = 0; back <= cfg.historyMonths; back++) {
    const mStart = addMonths(thisStart, -back);
    if (addMonths(mStart, 1).toISOString() <= HISTORY_START) break;
    out.push(monthOf(rep, mStart, now, stored.get(monthKeyOf(mStart)) ?? null));
  }
  return out;
}

/** One month in full: lines, status history, and whether the viewer may send it. */
export function invoiceView(rep: Rep, monthKey: string, now: Date, viewer: { email: string; isRep: boolean }): InvoiceView | null {
  const mStart = monthStartOf(monthKey);
  if (!mStart || mStart.getTime() > now.getTime()) return null;
  const stored = invoiceFor(rep.userId, monthKey);
  const month = monthOf(rep, mStart, now, stored);
  const live = stored ? null : liveLines(rep, mStart, now).lines;
  const cfg = invoicesConfig();
  return {
    ...month,
    rep,
    lines: stored ? stored.lines : (live?.lines ?? []),
    planText: planText(live?.plan ?? computeInvoiceLines(rep, mStart, mStart).plan),
    reconciled: stored ? true : (live?.reconciled ?? false),
    events: stored ? invoiceEvents(stored.id) : [],
    approvers: cfg.approvers,
    canSubmit: viewer.isRep && month.available && month.status === "draft" && month.amount > 0,
    notes: [
      "Estimated — the amount is the commission estimate from dashboard counts under your plan; the official calculation is done outside this dashboard and may differ.",
      "Line items — the submissions (first entry per contact into CA 101 submitted or IAU App Submitted, credited to the opportunity owner at the event) or won opportunities (status = won, once per opportunity id, credited to the owner at the won event) that earned commission in the month, priced by the month's totals: the retro rate once the month reaches the threshold, the first-tier rate for the first wons of the month.",
      "Availability — a month can be sent for review from the 1st of the following month; the current month is a live preview and keeps changing until then.",
      "Sending for review freezes the amount and the lines, attaches the PDF, and emails the reviewers. Approval needs every listed approver; Mark paid follows. You get an email at each change.",
      "Nothing here changes GHL.",
    ],
  };
}

// ---- emails ------------------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function linesTable(lines: InvoiceLine[]): string {
  const rows = lines.map((l) => `<tr><td style="padding:4px 10px 4px 0;color:#46566a">${esc(l.eventDay)}</td><td style="padding:4px 10px 4px 0"><b>${esc(l.contactName)}</b></td><td style="padding:4px 10px 4px 0;color:#46566a">${esc(l.program)} · ${esc(l.tier ? `${l.event} (${l.tier})` : l.event)}</td><td style="padding:4px 0;text-align:right"><b>${usd(l.amount)}</b></td></tr>`).join("");
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;width:100%">${rows || `<tr><td style="color:#46566a">No commission-earning events this month.</td></tr>`}</table>`;
}

function shell(title: string, intro: string, body: string, button: { label: string; url: string } | null, foot: string): string {
  const btn = button ? `<p style="margin:20px 0"><a href="${esc(button.url)}" style="background:#1677ff;color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:8px;display:inline-block">${esc(button.label)}</a></p>` : "";
  return `<!doctype html><html><body style="margin:0;background:#e4eaf1;font-family:Manrope,'Helvetica Neue',Arial,sans-serif;color:#182536"><div style="max-width:640px;margin:0 auto;padding:24px"><div style="background:#f4f7fb;border:1px solid #c3cfdd;border-radius:14px;padding:24px"><h1 style="font-size:20px;margin:0 0 8px">${esc(title)}</h1><p style="margin:0 0 16px;color:#46566a">${intro}</p>${body}${btn}<p style="margin:16px 0 0;font-size:12px;color:#5b6b7f">${esc(foot)}</p></div></div></body></html>`;
}

async function send(inv: InvoiceRow, to: string[], subject: string, text: string, html: string, pdf?: { data: Buffer; name: string }): Promise<void> {
  const cfg = invoicesConfig();
  const ok = gmailConfigured();
  if (!ok.ok) {
    addInvoiceEvent(inv.id, "email_failed", null, `${to.join(", ")}: ${ok.reason}`);
    return;
  }
  const msg: MailMessage = { from: cfg.from, to, subject, text, html, attachments: pdf ? [{ filename: pdf.name, contentType: "application/pdf", data: pdf.data }] : [] };
  try {
    const r = await sendGmail(msg);
    addInvoiceEvent(inv.id, "email", null, `${subject} → ${to.join(", ")} (${r.messageId})`);
  } catch (e) {
    addInvoiceEvent(inv.id, "email_failed", null, `${to.join(", ")}: ${(e as Error).message}`);
    console.error(`[invoices] email to ${to.join(", ")} failed: ${(e as Error).message}`);
  }
}

function repEmail(rep: Rep): string | null {
  const e = rep.signInEmail?.trim().toLowerCase();
  return e || null;
}

function linkTo(path: string): string | null {
  const base = dashboardBaseUrl();
  return base ? `${base}${path}` : null;
}

// ---- actions -----------------------------------------------------------------------------------

export type ActionResult = { ok: true; invoice: InvoiceRow; message: string } | { ok: false; error: string };

/** The rep sends a completed month for review. Idempotent: a second send is refused. */
export async function submitInvoice(rep: Rep, monthKey: string, actorEmail: string, now: Date): Promise<ActionResult> {
  const mStart = monthStartOf(monthKey);
  if (!mStart) return { ok: false, error: "Unknown month." };
  const mEnd = addMonths(mStart, 1);
  if (mEnd.getTime() > now.getTime()) return { ok: false, error: `${monthFmt.format(mStart)} is still in progress; it can be sent from ${fmtDay(mEnd)}.` };
  if (invoiceFor(rep.userId, monthKey)) return { ok: false, error: "This month was already sent for review." };
  const lines = computeInvoiceLines(rep, mStart, mEnd);
  if (lines.total <= 0) return { ok: false, error: `Nothing to invoice for ${monthFmt.format(mStart)}: no commission-earning events.` };
  if (!lines.reconciled) return { ok: false, error: `The itemized total (${usd(lines.total)}) does not match the commission estimate (${lines.reconciledAgainst === null ? "unavailable" : usd(lines.reconciledAgainst)}); not sent. Ask Diego to check the plan settings.` };
  const row = insertInvoice({ userId: rep.userId, repName: rep.name, month: monthKey, amount: lines.total, calc: lines.calc, planKey: rep.commissionPlan, lines: lines.lines, submittedBy: actorEmail });
  if (!row) return { ok: false, error: "This month was already sent for review." };
  addInvoiceEvent(row.id, "submitted", actorEmail, `${usd(row.amount)} · ${row.calc}`);

  const cfg = invoicesConfig();
  const pdfName = `${row.number}-${rep.name.replace(/[^A-Za-z0-9]+/g, "-")}-${monthKey}.pdf`;
  const pdf = renderInvoicePdf({
    number: row.number,
    title: "Commission invoice (estimated)",
    status: "Submitted for review",
    repName: rep.name,
    monthLabel: monthFmt.format(mStart),
    periodLabel: `${fmtDay(mStart)} – ${fmtDay(new Date(mEnd.getTime() - 1))}`,
    payer: cfg.payer,
    planText: planText(lines.plan),
    generatedAt: fmtDateTime(now),
    lines: row.lines,
    calc: row.calc,
    total: row.amount,
    notes: [
      "Estimated from VCN Sales Dashboard counts under the rep's commission plan; the official commission calculation is done outside this dashboard and may differ.",
      "Submissions are the first entry per contact into CA 101 submitted (Army) or IAU App Submitted (Veteran, every semester), credited to the opportunity owner at the event. Won means opportunity status = won, once per opportunity id, credited to the owner at the won event.",
      "This invoice becomes Approved when every listed approver has approved it in the dashboard, and Paid when an admin marks it paid.",
    ],
  });
  storeInvoicePdf(row.id, pdf, pdfName);

  const approveUrl = linkTo(`/invoices?focus=${row.id}`);
  const subject = `Invoice for review · ${rep.name} · ${monthFmt.format(mStart)} · ${usd(row.amount)} (estimated)`;
  const intro = `${esc(rep.name)} sent their ${esc(monthFmt.format(mStart))} commission invoice for review: <b>${usd(row.amount)}</b> (${esc(row.calc)}, estimated). The PDF is attached.`;
  const html = shell(`Invoice ${row.number}`, intro, linesTable(row.lines), approveUrl ? { label: "Review and approve", url: approveUrl } : null, `Approval needs ${cfg.approvers.join(" and ")}. Estimated from dashboard counts; the official calculation is done outside this dashboard.`);
  const text = `${rep.name} sent their ${monthFmt.format(mStart)} commission invoice for review: ${usd(row.amount)} (${row.calc}, estimated). The PDF is attached.\n\n${row.lines.map((l) => `${l.eventDay}  ${l.contactName}  ${l.program} · ${l.event}  ${usd(l.amount)}`).join("\n")}\n\nReview and approve: ${approveUrl ?? "(dashboard address not configured)"}`;
  if (cfg.reviewRecipients.length > 0) await send(row, cfg.reviewRecipients, subject, text, html, { data: pdf, name: pdfName });
  const mine = repEmail(rep);
  const myUrl = linkTo(`/invoices/${monthKey}`);
  if (mine) {
    const s2 = `Your ${monthFmt.format(mStart)} invoice was sent for review · ${usd(row.amount)} (estimated)`;
    await send(row, [mine], s2, `Your ${monthFmt.format(mStart)} commission invoice (${row.number}, ${usd(row.amount)} estimated) was sent to ${cfg.reviewRecipients.join(", ")} for review. You will get an email at each status change.${myUrl ? `\n\n${myUrl}` : ""}`, shell(`Invoice ${row.number} sent`, `Your ${esc(monthFmt.format(mStart))} commission invoice (<b>${usd(row.amount)}</b>, estimated) was sent to ${esc(cfg.reviewRecipients.join(", "))} for review. You will get an email at each status change.`, linesTable(row.lines), myUrl ? { label: "See its status", url: myUrl } : null, "Estimated from dashboard counts; the official calculation is done outside this dashboard."), { data: pdf, name: pdfName });
  }
  return { ok: true, invoice: invoiceById(row.id) ?? row, message: `Sent for review to ${cfg.reviewRecipients.join(", ")}.` };
}

async function notifyRep(inv: InvoiceRow, subject: string, body: string): Promise<void> {
  const rep = salesReps.find((r) => r.userId === inv.userId);
  const to = rep ? repEmail(rep) : null;
  if (!to) {
    addInvoiceEvent(inv.id, "email_failed", null, "rep has no signInEmail; not notified");
    return;
  }
  const url = linkTo(`/invoices/${inv.month}`);
  await send(inv, [to], subject, `${body}${url ? `\n\n${url}` : ""}`, shell(`Invoice ${inv.number}`, esc(body), "", url ? { label: "See its status", url } : null, "Estimated from dashboard counts; the official calculation is done outside this dashboard."));
}

/** One approver approves. The status turns Approved once every configured approver has. */
export async function approveInvoice(id: number, adminEmail: string): Promise<ActionResult> {
  const inv = invoiceById(id);
  if (!inv) return { ok: false, error: "Unknown invoice." };
  const email = adminEmail.trim().toLowerCase();
  if (!isApprover(email)) return { ok: false, error: `Only ${invoicesConfig().approvers.join(" and ")} can approve invoices.` };
  if (inv.status !== "submitted") return { ok: false, error: `This invoice is ${STATUS_LABEL[inv.status]}; only a Submitted invoice can be approved.` };
  if (inv.approvals.some((a) => a.email === email)) return { ok: false, error: "You already approved this invoice." };
  const approvals = [...inv.approvals, { email, at: new Date().toISOString() }];
  const cfg = invoicesConfig();
  const complete = cfg.approvers.every((a) => approvals.some((x) => x.email === a));
  setApprovals(id, approvals, complete ? new Date().toISOString() : null);
  addInvoiceEvent(id, "approval", email, complete ? "final approval" : `${approvals.length} of ${cfg.approvers.length} approvals`);
  if (complete) addInvoiceEvent(id, "approved", email, null);
  const updated = invoiceById(id) ?? inv;
  const month = monthFmt.format(monthStartOf(inv.month) ?? new Date());
  if (complete) await notifyRep(updated, `Your ${month} invoice is approved · ${usd(inv.amount)} (estimated)`, `Your ${month} commission invoice (${inv.number}, ${usd(inv.amount)} estimated) has been approved by ${cfg.approvers.join(" and ")}. It will show as Paid once it has been paid.`);
  else await notifyRep(updated, `Your ${month} invoice: ${approvals.length} of ${cfg.approvers.length} approvals`, `${email} approved your ${month} commission invoice (${inv.number}, ${usd(inv.amount)} estimated). ${cfg.approvers.length - approvals.length} more approval${cfg.approvers.length - approvals.length === 1 ? "" : "s"} needed before it is Approved.`);
  return { ok: true, invoice: updated, message: complete ? "Approved by everyone; the rep has been told." : `Recorded (${approvals.length} of ${cfg.approvers.length} approvals).` };
}

/** An admin marks an approved invoice paid. */
export async function markInvoicePaid(id: number, adminEmail: string): Promise<ActionResult> {
  const inv = invoiceById(id);
  if (!inv) return { ok: false, error: "Unknown invoice." };
  if (inv.status !== "approved") return { ok: false, error: `This invoice is ${STATUS_LABEL[inv.status]}; only an Approved invoice can be marked paid.` };
  const email = adminEmail.trim().toLowerCase();
  setPaid(id, email);
  addInvoiceEvent(id, "paid", email, null);
  const updated = invoiceById(id) ?? inv;
  const month = monthFmt.format(monthStartOf(inv.month) ?? new Date());
  await notifyRep(updated, `Your ${month} invoice is marked paid · ${usd(inv.amount)}`, `Your ${month} commission invoice (${inv.number}, ${usd(inv.amount)}) was marked paid by ${email}.`);
  return { ok: true, invoice: updated, message: "Marked paid; the rep has been told." };
}

/** The admin overview: every rep × month (newest first) with the stored status or a live Draft. */
export interface AdminInvoiceRow {
  rep: Rep;
  month: InvoiceMonth;
}

export function adminInvoiceOverview(now: Date): { months: string[]; rows: AdminInvoiceRow[] } {
  const rows: AdminInvoiceRow[] = [];
  for (const rep of salesReps) for (const m of invoiceMonths(rep, now)) rows.push({ rep, month: m });
  const months = [...new Set(rows.map((r) => r.month.key))].sort().reverse();
  return { months, rows };
}

export { monthFmt };

// Payroll invoices (owner request 2026-11-24): the two invoice types per rep,
// computed live until sent and frozen on sending.
//   A. Bi-weekly base invoice (base-pay reps): half the monthly base, minus a
//      deduction for every Non-paid day off at that day's daily rate,
//      itemized per working day (worked, non-paid, excused, paid holiday),
//      plus every weekly bounty the rep won in the period as its own line.
//      Available once the period has ended.
//   B. Monthly commission invoice (every rep): the plan's commission for the
//      calendar month itemized by contact with program, date, and rate, the
//      retro rate applied automatically (src/lib/invoices/lines.ts); a
//      commission-only rep's bounties ride on this invoice. Available from
//      the 1st of the following month.
// Sending freezes the lines and totals, assigns the number
// <prefix>-<initials>-<YYYYMMDD>-<BASE|COMM>, renders the PDF, emails it
// To/Cc the configured recipients and the rep, and stores it as Submitted.
// A period can be invoiced once; nothing changes after sending. Everything
// lives in this dashboard's cache; GHL is never touched.

import { addMonths, fmtDateTime, fmtDay, nyParts, parseNyDay, startOfMonth } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { computeInvoiceLines } from "@/lib/invoices/lines";
import { gmailConfigured, sendGmail, type MailMessage } from "@/lib/mailer";
import { planText } from "@/lib/me/commission";
import { initialsOf } from "@/lib/me/context";
import { planFor } from "@/lib/commission";
import { coverage } from "@/lib/metrics";
import type { Rep } from "@/lib/reps";
import { HISTORY_START } from "@/lib/sync/core";
import { dashboardBaseUrl } from "@/lib/weeklyReport/config";
import { computeAttendance, type Attendance } from "./attendance";
import { basePayFor, payrollConfig } from "./config";
import { renderPayrollPdf } from "./pdf";
import { periodAt, periodByKey, periodsThrough, type PayPeriod } from "./periods";
import { addPayrollEvent, insertPayrollInvoice, payrollEvents, payrollInvoiceById, payrollInvoiceFor, storePayrollPdf, STATUS_LABEL, TYPE_LABEL, type InvoiceType, type PayrollEvent, type PayrollInvoiceRow, type PayrollLine, type PayrollStatus, type PayrollTotals } from "./store";

const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const n = (v: number) => v.toLocaleString("en-US");
const monthFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long", year: "numeric" });
const round2 = (v: number) => Math.round(v * 100) / 100;

export interface InvoiceDraft {
  type: InvoiceType;
  /** Period start "YYYY-MM-DD" (base) or "YYYY-MM" (commission). */
  key: string;
  label: string;
  periodLabel: string;
  /** True while the period or month is still running. */
  current: boolean;
  /** True once it can be sent. */
  available: boolean;
  /** Why it cannot be sent yet (or at all). */
  unavailableReason: string | null;
  status: PayrollStatus;
  amount: number;
  totals: PayrollTotals;
  lines: PayrollLine[];
  summary: string;
  /** Base invoices: the non-paid days flagged so far. */
  flaggedDays: number;
  attendance: Attendance | null;
  stored: PayrollInvoiceRow | null;
  events: PayrollEvent[];
  number: string;
  notes: string[];
}

export function invoiceNumber(rep: Rep, type: InvoiceType, key: string): string {
  const cfg = payrollConfig();
  const ymd = (type === "base" ? key : `${key}-01`).replace(/-/g, "");
  return `${cfg.numberPrefix}-${initialsOf(rep.name)}-${ymd}-${type === "base" ? "BASE" : "COMM"}`;
}

interface Claim {
  period_key: string;
  amount: number;
  count: number;
  reached_at: string;
}

/** The rep's weekly bounty wins reached inside [start, end). */
function bountiesWon(userId: string, start: Date, end: Date): Claim[] {
  try {
    return getDb().prepare(`SELECT period_key, amount, count, reached_at FROM bounty_claims WHERE kind = 'weekly' AND user_id = ? AND reached_at >= ? AND reached_at < ? ORDER BY reached_at`).all(userId, start.toISOString(), end.toISOString()) as unknown as Claim[];
  } catch {
    return [];
  }
}

function bountyLines(claims: Claim[]): PayrollLine[] {
  return claims.map((c) => {
    const ws = parseNyDay(c.period_key) as Date;
    return { kind: "bounty", day: fmtDay(new Date(c.reached_at)), at: c.reached_at, label: "Weekly bounty won", detail: `Week of ${fmtDay(ws)} · first to ${n(c.count)} combined submissions`, rate: null, amount: c.amount };
  });
}

function totalsOf(lines: PayrollLine[]): PayrollTotals {
  const sum = (k: PayrollLine["kind"][]) => round2(lines.filter((l) => k.includes(l.kind)).reduce((s, l) => s + l.amount, 0));
  const base = sum(["base"]);
  const deductions = sum(["deduction"]);
  const extras = sum(["extra"]);
  const bounties = sum(["bounty"]);
  const commission = sum(["submission", "won"]);
  return { base, deductions, extras, bounties, commission, total: round2(base + deductions + extras + bounties + commission) };
}

function storedView(rep: Rep, type: InvoiceType, key: string, label: string, periodLabel: string, current: boolean, stored: PayrollInvoiceRow, attendance: Attendance | null, flaggedDays: number, notes: string[]): InvoiceDraft {
  return { type, key, label, periodLabel, current, available: false, unavailableReason: null, status: stored.status, amount: stored.amount, totals: stored.totals, lines: stored.lines, summary: stored.summary, flaggedDays, attendance, stored, events: payrollEvents(stored.id), number: stored.number, notes };
}

/** A. The bi-weekly base invoice for one period (live until sent). */
export function baseInvoice(rep: Rep, period: PayPeriod, now: Date): InvoiceDraft | null {
  const monthly = basePayFor(rep.userId);
  if (monthly === null) return null;
  const cfg = payrollConfig();
  const label = `Pay period ${n(period.index)}`;
  const att = computeAttendance(rep, period, now);
  const stored = payrollInvoiceFor(rep.userId, "base", period.key);
  const notes = [
    `Base pay — ${usd(monthly)} a month; a bi-weekly invoice carries half (${usd(monthly / 2)}) minus a deduction for every Non-paid day off at that day's daily rate (monthly base ÷ working days in that calendar month).`,
    `Worked day — at least ${n(cfg.workedDayMinDials)} outbound dials by you that day (one per call ID, automated calls excluded). Holidays are unpaid and left out of the working-day count (no deduction, no lower rate); an optional work day is paid extra at the daily rate when worked. Days an admin excused are paid and listed as such.`,
    "Bounties — every weekly bounty you won inside the period, on the day you reached the target, as its own line.",
    "Sending — freezes the lines and the total, assigns the invoice number, attaches the PDF, and emails it; a period can be sent once and nothing on it changes afterwards except the status.",
  ];
  if (stored) return storedView(rep, "base", period.key, label, period.label, period.current, stored, att, att.unpaid, notes);
  const lines: PayrollLine[] = [{ kind: "base", day: fmtDay(period.start), at: period.key, label: "Base pay", detail: `Half of ${usd(monthly)} monthly base · ${period.label}`, rate: null, amount: round2(monthly / 2) }];
  for (const d of att.days) {
    const optionalWorked = Boolean(d.holiday?.optional) && d.status === "worked";
    const label2 = optionalWorked ? "Worked · optional day" : d.status === "worked" ? "Worked" : d.status === "unpaid" ? "Non-paid day off" : d.status === "excused" ? `Excused · ${d.override ? d.override.kind.toUpperCase() : "admin"}` : d.status === "holiday" ? "Holiday · unpaid" : d.status === "today" ? "Today (in progress)" : "Upcoming";
    const detail = optionalWorked ? `${d.holiday?.name} · ${n(d.dials)} dials, paid at the daily rate` : d.status === "upcoming" ? "not yet" : d.status === "excused" ? d.override?.note || "approved by an admin" : d.status === "holiday" ? `${d.holiday?.name ?? "holiday"} · no deduction${d.holiday?.optional ? ` (optional work day, under ${n(cfg.workedDayMinDials)} dials)` : ""}` : `${n(d.dials)} dials${d.status === "unpaid" ? ` (under ${n(cfg.workedDayMinDials)})` : ""}`;
    const kind: PayrollLine["kind"] = optionalWorked ? "extra" : d.status === "unpaid" ? "deduction" : "day";
    lines.push({ kind, day: d.short, at: d.day, label: label2, detail, rate: d.rate, amount: optionalWorked ? round2(d.extra) : d.status === "unpaid" ? -round2(d.deduction) : 0 });
  }
  lines.push(...bountyLines(bountiesWon(rep.userId, period.start, period.end)));
  const totals = totalsOf(lines);
  const unavailableReason = period.ended ? null : period.upcoming ? `Starts ${fmtDay(period.start)}.` : `In progress; it can be sent from ${fmtDay(period.end)}.`;
  return {
    type: "base",
    key: period.key,
    label,
    periodLabel: period.label,
    current: period.current,
    available: period.ended,
    unavailableReason,
    status: "draft",
    amount: totals.total,
    totals,
    lines,
    summary: `${n(att.worked)} worked · ${n(att.unpaid)} non-paid · ${n(att.excused)} excused · ${n(att.holidays)} holiday${att.holidays === 1 ? "" : "s"}${att.optionalWorked > 0 ? ` · ${n(att.optionalWorked)} optional day${att.optionalWorked === 1 ? "" : "s"} worked` : ""}${att.remaining > 0 ? ` · ${n(att.remaining)} to go` : ""}`,
    flaggedDays: att.unpaid,
    attendance: att,
    stored: null,
    events: [],
    number: invoiceNumber(rep, "base", period.key),
    notes,
  };
}

/** B. The monthly commission invoice for one month "YYYY-MM" (live until sent). */
export function commissionInvoice(rep: Rep, monthKey: string, now: Date): InvoiceDraft | null {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return null;
  const mStart = parseNyDay(`${monthKey}-01`);
  if (!mStart) return null;
  const mEnd = addMonths(mStart, 1);
  const current = mEnd.getTime() > now.getTime();
  const end = current ? now : mEnd;
  const label = monthFmt.format(mStart);
  const periodLabel = `${fmtDay(mStart)} – ${fmtDay(new Date(end.getTime() - (current ? 0 : 1)))}`;
  const plan = planFor(rep);
  const commissionOnly = basePayFor(rep.userId) === null;
  const notes = [
    `Commission — ${plan ? planText(plan).replace(/.$/, "") : "plan not found"}; each submission or won is priced in its own calendar month, the retro rate applied automatically once the month reaches the threshold.`,
    "Submissions — the first entry per contact into CA 101 submitted (Army) or IAU App Submitted (Veteran, every semester), credited to the opportunity owner at the event. Won means opportunity status = won, once per opportunity id.",
    commissionOnly ? "Bounties — your plan has no base invoice, so every weekly bounty you won this month is a line here." : "Bounties — paid on the bi-weekly base invoice for the period you won them in.",
    "Available from the 1st of the following month. Sending freezes the lines and the total; a month can be sent once.",
    "Estimated from dashboard counts; the approved invoice is the record.",
  ];
  const stored = payrollInvoiceFor(rep.userId, "commission", monthKey);
  if (stored) return storedView(rep, "commission", monthKey, label, periodLabel, current, stored, null, 0, notes);
  const il = computeInvoiceLines(rep, mStart, end);
  const lines: PayrollLine[] = il.lines.map((l) => ({ kind: l.kind, day: l.eventDay, at: l.eventAt, label: l.contactName, detail: `${l.program} · ${l.event}${l.tier ? ` (${l.tier})` : ""}`, rate: l.rate, amount: l.amount }));
  if (commissionOnly) lines.push(...bountyLines(bountiesWon(rep.userId, mStart, end)));
  const totals = totalsOf(lines);
  const partial = mStart.toISOString() < (coverage().firstCoreSyncAt ?? HISTORY_START);
  return {
    type: "commission",
    key: monthKey,
    label,
    periodLabel,
    current,
    available: !current,
    unavailableReason: current ? `In progress; it can be sent from ${fmtDay(mEnd)}.` : null,
    status: "draft",
    amount: totals.total,
    totals,
    lines,
    summary: `${il.calc}${!il.reconciled ? " · warning: the itemized total does not match the commission estimate" : ""}${partial ? " · partial history" : ""}`,
    flaggedDays: 0,
    attendance: null,
    stored: null,
    events: [],
    number: invoiceNumber(rep, "commission", monthKey),
    notes,
  };
}

/** The months a rep can have a commission invoice for: from the first month with history (or the first stored one) to now, newest first. */
function commissionMonths(rep: Rep, now: Date): string[] {
  const first = startOfMonth(new Date(Math.max(Date.parse(HISTORY_START), Date.parse(coverage().firstCoreSyncAt ?? HISTORY_START))));
  const out: string[] = [];
  for (let m = startOfMonth(now); m.getTime() >= first.getTime(); m = addMonths(m, -1)) {
    const p = nyParts(m);
    out.push(`${p.y}-${String(p.m).padStart(2, "0")}`);
  }
  // Any stored month earlier than the history start (legacy copies) still lists.
  const stored = getDb().prepare(`SELECT period_key FROM payroll_invoices WHERE user_id = ? AND type = 'commission'`).all(rep.userId) as unknown as { period_key: string }[];
  for (const s of stored) if (!out.includes(s.period_key)) out.push(s.period_key);
  return out.sort().reverse();
}

/** Every invoice a rep has or can have: base periods (newest first) and commission months (newest first). */
export function repInvoices(rep: Rep, now: Date): { base: InvoiceDraft[]; commission: InvoiceDraft[]; hasBase: boolean } {
  const hasBase = basePayFor(rep.userId) !== null;
  const base: InvoiceDraft[] = [];
  if (hasBase) {
    const periods = periodsThrough(now);
    // Before the first period begins, show it as upcoming so the rep sees what is coming.
    const list = periods.length > 0 ? periods : [periodAt(1, now)];
    for (const p of [...list].reverse()) {
      const d = baseInvoice(rep, p, now);
      if (d) base.push(d);
    }
  }
  const commission = commissionMonths(rep, now)
    .map((k) => commissionInvoice(rep, k, now))
    .filter((x): x is InvoiceDraft => x !== null);
  return { base, commission, hasBase };
}

/** One invoice by type and key (for the detail page). */
export function invoiceDraft(rep: Rep, type: InvoiceType, key: string, now: Date): InvoiceDraft | null {
  if (type === "base") {
    const p = periodByKey(key, now);
    return p ? baseInvoice(rep, p, now) : null;
  }
  return commissionInvoice(rep, key, now);
}

// ---- sending -------------------------------------------------------------------------------------

export type SendResult = { ok: true; invoice: PayrollInvoiceRow; message: string } | { ok: false; error: string };

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

function linesTable(lines: PayrollLine[]): string {
  const rows = lines
    .filter((l) => !(l.kind === "day" && l.amount === 0))
    .map((l) => `<tr><td style="padding:4px 8px 4px 0;color:#46566a;white-space:nowrap">${esc(l.day)}</td><td style="padding:4px 8px 4px 0">${esc(l.label)}<br><span style="color:#5b6b7f;font-size:12px">${esc(l.detail)}</span></td><td style="padding:4px 0;text-align:right;white-space:nowrap">${l.amount < 0 ? "−" : ""}${usd(Math.abs(l.amount))}</td></tr>`)
    .join("");
  return `<table style="border-collapse:collapse;width:100%;font-size:13px">${rows}</table>`;
}

function shell(title: string, intro: string, body: string, button: { label: string; url: string } | null, foot: string): string {
  const btn = button ? `<p style="margin:20px 0"><a href="${esc(button.url)}" style="background:#1677ff;color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:8px;display:inline-block">${esc(button.label)}</a></p>` : "";
  return `<!doctype html><html><body style="margin:0;background:#e4eaf1;font-family:Manrope,'Helvetica Neue',Arial,sans-serif;color:#182536"><div style="max-width:640px;margin:0 auto;padding:24px"><div style="background:#f4f7fb;border:1px solid #c3cfdd;border-radius:14px;padding:24px"><div style="font-size:11px;letter-spacing:.08em;color:#1677ff;font-weight:700;margin-bottom:6px">INTELAGENT MEDIA · VCN SALES DASHBOARD</div><h1 style="font-size:20px;margin:0 0 8px">${esc(title)}</h1><p style="margin:0 0 16px;color:#46566a">${intro}</p>${body}${btn}<p style="margin:16px 0 0;font-size:12px;color:#5b6b7f">${esc(foot)}</p></div></div></body></html>`;
}

async function send(inv: PayrollInvoiceRow, to: string[], cc: string[], subject: string, text: string, html: string, pdf?: { data: Buffer; name: string }): Promise<void> {
  const cfg = payrollConfig();
  const ok = gmailConfigured();
  const all = [...new Set([...to, ...cc])];
  if (all.length === 0) return;
  if (!ok.ok) {
    addPayrollEvent(inv.id, "email_failed", null, `${all.join(", ")}: ${ok.reason}`);
    return;
  }
  const msg: MailMessage = { from: cfg.from, to, cc: cc.filter((c) => !to.includes(c)), subject, text, html, attachments: pdf ? [{ filename: pdf.name, contentType: "application/pdf", data: pdf.data }] : [] };
  try {
    const r = await sendGmail(msg);
    addPayrollEvent(inv.id, "email", null, `${subject} → ${all.join(", ")} (${r.messageId})`);
  } catch (e) {
    addPayrollEvent(inv.id, "email_failed", null, `${all.join(", ")}: ${(e as Error).message}`);
    console.error(`[payroll] email to ${all.join(", ")} failed: ${(e as Error).message}`);
  }
}

function linkTo(path: string): string | null {
  const base = dashboardBaseUrl();
  return base ? `${base}${path}` : null;
}

/** The rep sends an invoice. Refused when the period is still running, already sent, or empty. */
export async function sendInvoice(rep: Rep, type: InvoiceType, key: string, actorEmail: string, now: Date): Promise<SendResult> {
  const d = invoiceDraft(rep, type, key, now);
  if (!d) return { ok: false, error: "Unknown invoice period." };
  if (d.stored) return { ok: false, error: `This ${TYPE_LABEL[type].toLowerCase()} invoice was already sent (${d.stored.number}).` };
  if (!d.available) return { ok: false, error: d.unavailableReason ?? "Not available yet." };
  if (d.amount <= 0) return { ok: false, error: `Nothing to invoice for ${d.label}: the total is ${usd(d.amount)}.` };
  const row = insertPayrollInvoice({ userId: rep.userId, repName: rep.name, type, periodKey: key, periodLabel: d.periodLabel, number: d.number, amount: d.amount, totals: d.totals, lines: d.lines, summary: d.summary, submittedBy: actorEmail });
  if (!row) return { ok: false, error: "This period was already sent." };
  addPayrollEvent(row.id, "submitted", actorEmail, `${usd(row.amount)} · ${row.summary}`);

  const cfg = payrollConfig();
  const title = type === "base" ? "Bi-weekly base pay invoice" : "Monthly commission invoice";
  const pdfName = `${row.number}-${rep.name.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`;
  const pdf = renderPayrollPdf({
    number: row.number,
    title,
    typeLabel: TYPE_LABEL[type],
    status: "Submitted",
    repName: rep.name,
    periodLabel: `${d.label} · ${d.periodLabel}`,
    payer: cfg.payer,
    paymentTerms: cfg.paymentTerms,
    generatedAt: fmtDateTime(now),
    lines: row.lines,
    totals: row.totals,
    summary: row.summary,
    notes: d.notes,
  });
  storePayrollPdf(row.id, pdf, pdfName);

  const adminUrl = linkTo(`/invoices?focus=${row.id}`);
  const subject = `${title} · ${rep.name} · ${d.label} · ${usd(row.amount)} · ${row.number}`;
  const intro = `${esc(rep.name)} sent their ${esc(d.label.toLowerCase())} ${type === "base" ? "base pay" : "commission"} invoice (${esc(d.periodLabel)}): <b>${usd(row.amount)}</b>. The PDF is attached.`;
  const html = shell(`Invoice ${row.number}`, intro, linesTable(row.lines), adminUrl ? { label: "Open in the dashboard", url: adminUrl } : null, cfg.paymentTerms);
  const text = `${rep.name} sent their ${d.label} ${type === "base" ? "base pay" : "commission"} invoice (${d.periodLabel}): ${usd(row.amount)}. The PDF is attached.\n\n${row.lines.filter((l) => !(l.kind === "day" && l.amount === 0)).map((l) => `${l.day}  ${l.label} · ${l.detail}  ${l.amount < 0 ? "-" : ""}${usd(Math.abs(l.amount))}`).join("\n")}\n\nTotal due: ${usd(row.amount)}\n${adminUrl ? `\n${adminUrl}` : ""}`;
  await send(row, cfg.recipients.to, cfg.recipients.cc, subject, text, html, { data: pdf, name: pdfName });
  const mine = rep.signInEmail?.trim().toLowerCase() || null;
  const myUrl = linkTo(`/invoices/${type}/${key}`);
  if (mine && !cfg.recipients.to.includes(mine) && !cfg.recipients.cc.includes(mine)) {
    await send(row, [mine], [], `Your ${d.label} ${type === "base" ? "base pay" : "commission"} invoice was sent · ${usd(row.amount)} · ${row.number}`, `Your ${d.label} ${type === "base" ? "base pay" : "commission"} invoice (${row.number}, ${usd(row.amount)}) was sent to ${cfg.recipients.to.join(", ")}. You will get an email at each status change.${myUrl ? `\n\n${myUrl}` : ""}`, shell(`Invoice ${row.number} sent`, `Your ${esc(d.label)} ${type === "base" ? "base pay" : "commission"} invoice (<b>${usd(row.amount)}</b>) was sent to ${esc(cfg.recipients.to.join(", "))}. You will get an email at each status change.`, linesTable(row.lines), myUrl ? { label: "See its status", url: myUrl } : null, cfg.paymentTerms), { data: pdf, name: pdfName });
  }
  return { ok: true, invoice: payrollInvoiceById(row.id) ?? row, message: `Sent to ${cfg.recipients.to.join(", ")}${cfg.recipients.cc.length ? ` (cc ${cfg.recipients.cc.join(", ")})` : ""} as ${row.number}.` };
}

export { STATUS_LABEL, TYPE_LABEL };

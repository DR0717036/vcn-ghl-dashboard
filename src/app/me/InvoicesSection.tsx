// "My invoices" on the rep dashboard and the Invoices page (owner request
// 2026-11-24): the attendance card, then every bi-weekly base invoice
// (base-pay reps) and every monthly commission invoice with amount, status,
// flagged days, and one "Send invoice" button once the period has ended.
// Server component; the button is the existing client action button.

import type { InvoiceDraft } from "@/lib/payroll/invoices";
import { STATUS_LABEL, TYPE_LABEL } from "@/lib/payroll/store";
import { fmtDateTime } from "@/lib/dates";
import InvoiceActionButton from "../invoices/InvoiceActionButton";
import StatusPill from "../invoices/StatusPill";
import Notes from "../Notes";

const n = (v: number) => v.toLocaleString("en-US");
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function Row({ d, asQuery, canSend }: { d: InvoiceDraft; asQuery: string; canSend: boolean }) {
  const href = `/invoices/${d.type}/${d.key}${asQuery}`;
  return (
    <tr className={d.current ? "me-row-current" : undefined}>
      <td>
        <a className="me-link" href={href}>
          {d.label}
        </a>
        <span className="plan-label">{d.stored ? d.stored.number : d.number}</span>
      </td>
      <td className="note">{d.periodLabel}</td>
      <td className="note">{TYPE_LABEL[d.type]}</td>
      <td className="num">{usd(d.amount)}</td>
      <td className="num">{d.type === "base" ? (d.flaggedDays > 0 ? <span className="pill pill-warn">{n(d.flaggedDays)} non-paid</span> : <span className="note">none</span>) : <span className="note">—</span>}</td>
      <td>
        <StatusPill status={d.status} current={d.current} />
        {d.stored ? <span className="plan-label">sent {fmtDateTime(d.stored.submittedAt)}</span> : d.unavailableReason ? <span className="plan-label">{d.unavailableReason}</span> : null}
      </td>
      <td className="num inv-actions">
        {d.available && !d.stored && canSend && d.amount > 0 ? (
          <InvoiceActionButton url="/api/me/invoices" body={{ type: d.type, key: d.key }} label="Send invoice" busyLabel="Sending…" confirm={`Send your ${d.label} ${d.type === "base" ? "base pay" : "commission"} invoice (${usd(d.amount)}) now? The line items and the total are frozen once sent, and a period can be sent once.`} className="btn inv-btn" />
        ) : (
          <a className="me-link" href={href}>
            Open
          </a>
        )}
      </td>
    </tr>
  );
}

function Table({ rows, asQuery, canSend, empty }: { rows: InvoiceDraft[]; asQuery: string; canSend: boolean; empty: string }) {
  return (
    <div className="scroll kpi-body">
      <table className="stat-breakdown me-list inv-table">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Period</th>
            <th>Type</th>
            <th className="num">Amount</th>
            <th className="num">Flagged days</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="note">
                {empty}
              </td>
            </tr>
          ) : null}
          {rows.map((d) => (
            <Row key={`${d.type}-${d.key}`} d={d} asQuery={asQuery} canSend={canSend} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function InvoicesSection({ inv, asQuery, canSend, name, visible = false }: { inv: { base: InvoiceDraft[]; commission: InvoiceDraft[]; hasBase: boolean }; asQuery: string; canSend: boolean; name: string; /** Render visible at once (pages without the scroll-reveal observer, e.g. /invoices). */ visible?: boolean }) {
  const card = `stat kpi kpi-title-xl reveal me-card${visible ? " is-visible" : ""}`;
  const notes = [
    inv.hasBase ? "Bi-weekly base invoice — half your monthly base minus a deduction for every Non-paid day off at that day's daily rate, itemized per working day, plus every weekly bounty you won in the period. Available once the period has ended (the Monday after)." : "Base pay — none: your plan is commission only, so there is no bi-weekly invoice; your bounties ride on the monthly commission invoice.",
    "Monthly commission invoice — your plan's commission for the calendar month, itemized by contact with program, date, and rate, the retro rate applied automatically. Available from the 1st of the following month.",
    "Send invoice — freezes the line items and the total, assigns the number (VCN-initials-date-type), attaches the PDF, emails it to the payroll address with the admins copied, and stores it as Submitted. A period can be sent once; nothing on it changes afterwards except the status. You get an email at each status change (Submitted → Approved → Paid).",
    "Everything here lives in the dashboard's own records; nothing is written to GHL.",
  ];
  return (
    <>
      {inv.hasBase ? (
        <div className="kpi-row cols-1">
          <div className={card} data-kpi="inv-base-list">
            <div className="kpi-head">
              <div className="label">Bi-weekly base invoices</div>
              <div className="kpi-sub note">{name} · one per pay period · half the monthly base minus non-paid days, plus bounties won in the period</div>
            </div>
            <Table rows={inv.base} asQuery={asQuery} canSend={canSend} empty="No pay period yet." />
          </div>
        </div>
      ) : null}
      <div className="kpi-row cols-1">
        <div className={card} data-kpi="inv-commission-list">
          <div className="kpi-head">
            <div className="label">Monthly commission invoices</div>
            <div className="kpi-sub note">{name} · one per calendar month · submissions itemized by contact, retro applied automatically · available from the 1st of the next month</div>
          </div>
          <Table rows={inv.commission} asQuery={asQuery} canSend={canSend} empty="No month with history yet." />
        </div>
      </div>
      <details className="kpi-details rep-notes">
        <summary>How this is counted</summary>
        <div className="kpi-details-body">
          <Notes notes={notes} />
        </div>
      </details>
    </>
  );
}

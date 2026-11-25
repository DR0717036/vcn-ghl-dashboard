// One payroll invoice (owner request 2026-11-24): a bi-weekly base invoice
// (/invoices/base/<period start>) or a monthly commission invoice
// (/invoices/commission/<YYYY-MM>) for one rep: the line items, the totals,
// the status with its history, "Send invoice" once the period has ended
// and it is not yet sent, and the PDF once it exists. Reps see their own;
// admins open any rep's with ?as=<GHL user id>. Nothing here touches GHL.

import { fmtDateTime } from "@/lib/dates";
import { requirePageUser } from "@/lib/guard";
import { invoiceDraft } from "@/lib/payroll/invoices";
import { STATUS_LABEL, TYPE_LABEL } from "@/lib/payroll/store";
import { salesReps } from "@/lib/reps";
import { redirect } from "next/navigation";
import Notes from "../../../Notes";
import AttendanceCard from "../../../me/AttendanceCard";
import InvoiceActionButton from "../../InvoiceActionButton";
import StatusPill from "../../StatusPill";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const EVENT_LABEL: Record<string, string> = { submitted: "Sent", approval: "Approved by", approved: "Approved (all approvers)", paid: "Marked paid", email: "Email sent", email_failed: "Email not sent", migrated: "Copied from the old flow" };

export default async function PayrollInvoicePage({ params, searchParams }: { params: Promise<{ type: string; key: string }>; searchParams: Promise<Search> }) {
  const { type, key } = await params;
  const sp = await searchParams;
  const asParam = first(sp.as);
  const path = `/invoices/${type}/${key}${asParam ? `?as=${encodeURIComponent(asParam)}` : ""}`;
  const user = await requirePageUser(path);
  const rep = user.role === "rep" ? salesReps.find((r) => r.userId === user.repUserId) : asParam ? salesReps.find((r) => r.userId === asParam) : undefined;
  if (!rep) redirect(user.role === "rep" ? "/login?error=Configuration" : "/invoices");
  if (type !== "base" && type !== "commission") redirect("/invoices");
  const viewingAs = user.role === "admin";
  const d = invoiceDraft(rep, type, key, new Date());
  if (!d) redirect("/invoices");
  const repList = `/invoices?as=${encodeURIComponent(rep.userId)}`;
  const s = d.stored;
  const shownLines = d.lines;
  return (
    <section className="band band-dark inv-page">
      <div className="band-inner">
        {viewingAs ? (
          <div className="callout callout-info me-viewing">
            <b>Admin view.</b> {rep.name}&rsquo;s invoice exactly as they see it. <a href={repList}>Rep&rsquo;s invoice list</a> · <a href="/invoices">All invoices</a>
          </div>
        ) : null}
        <p className="note">
          <a className="me-link" href="/invoices">
            ← All invoices
          </a>
          {viewingAs ? (
            <>
              {" · "}
              <a className="me-link" href={repList}>
                Rep&rsquo;s invoice list
              </a>
            </>
          ) : null}
        </p>
        <div className="kpi-row cols-1">
          <div className="stat kpi kpi-title-xl reveal is-visible inv-detail" data-kpi="inv-detail">
            <div className="kpi-head">
              <div className="kpi-head-row">
                <div className="label">
                  {TYPE_LABEL[d.type]} · {d.label} · {rep.name}
                </div>
                <div className="kpi-head-right">
                  <StatusPill status={d.status} current={d.current} />
                </div>
              </div>
              <div className="kpi-sub note">
                {d.number} · {d.periodLabel}
                {d.stored ? ` · sent ${fmtDateTime(d.stored.submittedAt)}` : d.unavailableReason ? ` · ${d.unavailableReason}` : " · ready to send"}
              </div>
            </div>
            <div className="me-hero">
              <div className="me-hero-main">
                <div className="stat-value">{usd(d.amount)}</div>
                <div className="note">{d.stored ? "frozen on sending" : "live estimate"} · {d.summary}</div>
              </div>
              <div className="inv-cta">
                {d.available && !s && !viewingAs && d.amount > 0 ? <InvoiceActionButton url="/api/me/invoices" body={{ type: d.type, key: d.key }} label="Send invoice" busyLabel="Sending…" confirm={`Send your ${d.label} ${d.type === "base" ? "base pay" : "commission"} invoice (${usd(d.amount)}) now? The line items and the total are frozen once sent, and a period can be sent once.`} /> : null}
                {!d.available && !s ? <span className="note">{d.unavailableReason}</span> : null}
                {d.available && !s && viewingAs ? <span className="note">Not sent yet. Only the rep can send it.</span> : null}
                {d.available && !s && !viewingAs && d.amount <= 0 ? <span className="note">Nothing to invoice for this period.</span> : null}
                {s ? (
                  <a className="btn btn-secondary" href={`/api/me/invoices/pdf?id=${s.id}`}>
                    Download PDF
                  </a>
                ) : null}
              </div>
            </div>
            <div className="inv-totals note">
              {d.totals.base > 0 ? <span>Base {usd(d.totals.base)}</span> : null}
              {d.totals.deductions !== 0 ? <span className="delta-down">Non-paid days −{usd(Math.abs(d.totals.deductions))}</span> : null}
              {d.totals.bounties > 0 ? <span>Bounties {usd(d.totals.bounties)}</span> : null}
              {d.totals.commission > 0 ? <span>Commission {usd(d.totals.commission)}</span> : null}
              <span>
                <b>Total {usd(d.totals.total)}</b>
              </span>
            </div>
            <div className="scroll kpi-body">
              <table className="stat-breakdown me-list inv-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Item</th>
                    <th>Detail</th>
                    <th className="num">Rate</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {shownLines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="note">
                        No line items{d.current ? " yet" : ""}.
                      </td>
                    </tr>
                  ) : null}
                  {shownLines.map((l, i) => (
                    <tr key={`${l.at}-${i}`} className={l.kind === "deduction" ? "inv-row-deduction" : l.kind === "day" ? "inv-row-muted" : undefined}>
                      <td className="note">{l.day}</td>
                      <td>
                        <b>{l.label}</b>
                      </td>
                      <td className="note">{l.detail}</td>
                      <td className="num">{l.rate === null ? "—" : usd(l.rate)}</td>
                      <td className={`num${l.amount < 0 ? " delta-down" : ""}`}>{l.kind === "day" && l.amount === 0 ? <span className="note">included</span> : `${l.amount < 0 ? "−" : ""}${usd(Math.abs(l.amount))}`}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="me-row-current">
                    <td colSpan={4} className="num">
                      Total due
                    </td>
                    <td className="num">{usd(d.amount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {d.attendance && !s ? (
              <div className="inv-attendance">
                <AttendanceCard a={d.attendance} visible />
              </div>
            ) : null}
            {s ? (
              <div className="inv-history">
                <div className="label kpi-notes-title">Status history</div>
                <ul className="plain">
                  {d.events
                    .filter((e) => e.kind !== "email" && e.kind !== "email_failed")
                    .map((e) => (
                      <li key={e.id}>
                        <b>{EVENT_LABEL[e.kind] ?? e.kind}</b>
                        {e.actor ? ` ${e.actor}` : ""} · {fmtDateTime(e.at)}
                        {e.detail ? <span className="note"> · {e.detail}</span> : null}
                      </li>
                    ))}
                  {s.status === "submitted" ? <li className="note">Waiting for approval.</li> : null}
                  {s.status === "approved" ? <li className="note">Approved; waiting to be marked paid.</li> : null}
                </ul>
                {d.events.some((e) => e.kind === "email_failed") ? <div className="callout callout-warn">Some notification emails could not be sent: {d.events.filter((e) => e.kind === "email_failed").map((e) => e.detail).join("; ")}</div> : null}
              </div>
            ) : null}
            <details className="kpi-details">
              <summary>How this is counted</summary>
              <div className="kpi-details-body">
                <Notes notes={d.notes} />
              </div>
            </details>
          </div>
        </div>
        <p className="note">
          Status: <b>{STATUS_LABEL[d.status]}</b>
          {d.current ? " (live preview)" : ""}.
        </p>
      </div>
    </section>
  );
}

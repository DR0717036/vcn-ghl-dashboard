// One month's invoice for one rep: the itemized lines, the total, the
// status with its history, "Send for review" when the month is complete and
// not yet sent, and the PDF once it exists. Reps see their own; admins open
// any rep's with ?as=<GHL user id>.

import { fmtDateTime } from "@/lib/dates";
import { requirePageUser } from "@/lib/guard";
import { invoiceView, STATUS_LABEL } from "@/lib/invoices/service";
import { salesReps } from "@/lib/reps";
import { redirect } from "next/navigation";
import Notes from "../../Notes";
import InvoiceActionButton from "../InvoiceActionButton";
import StatusPill from "../StatusPill";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const EVENT_LABEL: Record<string, string> = { submitted: "Sent for review", approval: "Approved by", approved: "Approved (all approvers)", paid: "Marked paid", email: "Email sent", email_failed: "Email not sent" };

export default async function InvoiceMonthPage({ params, searchParams }: { params: Promise<{ month: string }>; searchParams: Promise<Search> }) {
  const { month } = await params;
  const sp = await searchParams;
  const asParam = first(sp.as);
  const path = `/invoices/${month}${asParam ? `?as=${encodeURIComponent(asParam)}` : ""}`;
  const user = await requirePageUser(path);
  const rep = user.role === "rep" ? salesReps.find((r) => r.userId === user.repUserId) : asParam ? salesReps.find((r) => r.userId === asParam) : undefined;
  if (!rep) redirect(user.role === "rep" ? "/login?error=Configuration" : "/invoices");
  const viewingAs = user.role === "admin";
  const v = invoiceView(rep, month, new Date(), { email: user.email, isRep: user.role === "rep" });
  if (!v) redirect(viewingAs ? "/invoices" : "/invoices");
  const back = viewingAs ? `/invoices?as=${encodeURIComponent(rep.userId)}` : "/invoices";
  const s = v.stored;
  return (
    <section className="band band-dark inv-page">
      <div className="band-inner">
        {viewingAs ? (
          <div className="callout callout-info me-viewing">
            <b>Admin view.</b> {rep.name}&rsquo;s invoice exactly as they see it. <a href="/invoices">All invoices</a>
          </div>
        ) : null}
        <p className="note">
          <a className="me-link" href={back}>
            ← All months
          </a>
        </p>
        <div className="kpi-row cols-1">
          <div className="stat kpi kpi-title-xl reveal is-visible inv-detail" data-kpi="inv-detail">
            <div className="kpi-head">
              <div className="kpi-head-row">
                <div className="label">
                  {v.label} · {rep.name}
                </div>
                <div className="kpi-head-right">
                  <StatusPill status={v.status} current={v.current} />
                </div>
              </div>
              <div className="kpi-sub note">
                {s ? `${s.number} · ` : ""}
                {v.periodLabel} · commission invoice, estimated · plan {rep.commissionPlan}
              </div>
            </div>
            <div className="me-hero">
              <div className="me-hero-main">
                <div className="stat-value">{usd(v.amount)}</div>
                <div className="note">
                  estimated · {v.calc || "no commission-earning events"}
                  {!v.reconciled && !s ? " · warning: the itemized total does not match the estimate; ask Diego" : ""}
                </div>
              </div>
              <div className="inv-cta">
                {v.canSubmit ? <InvoiceActionButton url="/api/me/invoices" body={{ month: v.key }} label="Send for review" busyLabel="Sending…" confirm={`Send your ${v.label} invoice (${usd(v.amount)}, estimated) to ${v.approvers.join(" and ")} for review? The amount and the items are frozen once sent.`} /> : null}
                {v.current ? <span className="note">This month is still in progress; it can be sent for review from the 1st of next month.</span> : null}
                {!v.current && v.status === "draft" && !v.canSubmit && viewingAs ? <span className="note">Not sent yet. Only the rep can send it.</span> : null}
                {!v.current && v.status === "draft" && !viewingAs && v.amount <= 0 ? <span className="note">Nothing to invoice for this month.</span> : null}
                {s ? (
                  <a className="btn btn-secondary" href={`/api/me/invoices/pdf?id=${s.id}`}>
                    Download PDF
                  </a>
                ) : null}
              </div>
            </div>
            <p className="note me-plan-text">
              <b>Plan:</b> {v.planText}
            </p>
            <div className="scroll kpi-body">
              <table className="stat-breakdown me-list inv-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Contact</th>
                    <th>Program</th>
                    <th>Event</th>
                    <th className="num">Rate</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {v.lines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="note">
                        No commission-earning events in this month{v.current ? " so far" : ""}.
                      </td>
                    </tr>
                  ) : null}
                  {v.lines.map((l, i) => (
                    <tr key={`${l.contactId ?? "x"}-${i}`}>
                      <td className="note">{l.eventDay}</td>
                      <td>
                        <b>{l.contactName}</b>
                      </td>
                      <td>{l.program}</td>
                      <td className="note">
                        {l.event}
                        {l.tier ? <span className="plan-label">{l.tier}</span> : null}
                      </td>
                      <td className="num">{usd(l.rate)}</td>
                      <td className="num">{usd(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="me-row-current">
                    <td colSpan={5} className="num">
                      Total (estimated)
                    </td>
                    <td className="num">{usd(v.amount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {s ? (
              <div className="inv-history">
                <div className="label kpi-notes-title">Status history</div>
                <ul className="plain">
                  {v.events
                    .filter((e) => e.kind !== "email" && e.kind !== "email_failed")
                    .map((e) => (
                      <li key={e.id}>
                        <b>{EVENT_LABEL[e.kind] ?? e.kind}</b>
                        {e.actor ? ` ${e.actor}` : ""} · {fmtDateTime(e.at)}
                        {e.detail ? <span className="note"> · {e.detail}</span> : null}
                      </li>
                    ))}
                  {s.status === "submitted" ? (
                    <li className="note">
                      Waiting for approval from {v.approvers.filter((a) => !s.approvals.some((x) => x.email === a)).join(" and ") || "nobody"}.
                    </li>
                  ) : null}
                  {s.status === "approved" ? <li className="note">Approved; waiting to be marked paid.</li> : null}
                </ul>
                {v.events.some((e) => e.kind === "email_failed") ? <div className="callout callout-warn">Some notification emails could not be sent: {v.events.filter((e) => e.kind === "email_failed").map((e) => e.detail).join("; ")}</div> : null}
              </div>
            ) : null}
            <details className="kpi-details">
              <summary>How this is counted</summary>
              <div className="kpi-details-body">
                <Notes notes={v.notes} />
              </div>
            </details>
          </div>
        </div>
        <p className="note">
          Status: <b>{STATUS_LABEL[v.status]}</b>
          {v.current ? " (live preview)" : ""}.
        </p>
      </div>
    </section>
  );
}

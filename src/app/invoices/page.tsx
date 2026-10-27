// Invoices (owner request 2026-10-26). A rep sees their own months with the
// amount and status of each; an admin sees every rep and month with the
// status (Draft / Submitted / Approved / Paid) and the Approve and Mark paid
// actions, or a rep's own view with ?as=<GHL user id>. Nothing here touches
// GHL; invoice data lives in the dashboard's own cache.

import { fmtDateTime } from "@/lib/dates";
import { requirePageUser } from "@/lib/guard";
import { invoicesConfig, isApprover } from "@/lib/invoices/config";
import { adminInvoiceOverview, invoiceMonths, monthFmt, monthStartOf } from "@/lib/invoices/service";
import { repViewOf } from "@/lib/me/context";
import { salesReps } from "@/lib/reps";
import { redirect } from "next/navigation";
import InvoiceActionButton from "./InvoiceActionButton";
import StatusPill from "./StatusPill";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function RepInvoices({ userId, name, viewingAs, asQuery }: { userId: string; name: string; viewingAs: boolean; asQuery: string }) {
  const rep = salesReps.find((r) => r.userId === userId);
  if (!rep) return null;
  const months = invoiceMonths(rep, new Date());
  return (
    <section className="band band-dark inv-page">
      <div className="band-inner">
        {viewingAs ? (
          <div className="callout callout-info me-viewing">
            <b>Admin view.</b> {name}&rsquo;s invoices exactly as they see them. <a href="/invoices">Back to all invoices</a>
          </div>
        ) : null}
        <h1 className="page-title">My invoices</h1>
        <div className="kpi-row cols-1">
          <div className="stat kpi kpi-title-xl reveal is-visible" data-kpi="inv-list">
            <div className="kpi-head">
              <div className="label">{name} · commission invoices</div>
              <div className="kpi-sub note">One per month, estimated from your plan · a month can be sent for review from the 1st of the following month · the current month is a live preview</div>
            </div>
            <div className="scroll kpi-body">
              <table className="stat-breakdown me-list inv-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Period</th>
                    <th className="num">Items</th>
                    <th className="num">Estimated commission</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.key} className={m.current ? "me-row-current" : undefined}>
                      <td>
                        {m.label}
                        {m.partial ? <span className="plan-label">partial history</span> : null}
                      </td>
                      <td className="note">{m.periodLabel}</td>
                      <td className="num">{m.lineCount.toLocaleString("en-US")}</td>
                      <td className="num">{usd(m.amount)}</td>
                      <td>
                        <StatusPill status={m.status} current={m.current} />
                      </td>
                      <td className="num">
                        <a className="me-link" href={`/invoices/${m.key}${asQuery}`}>
                          {m.status === "draft" && m.available && m.amount > 0 && !viewingAs ? "Open and send" : "Open"}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note">Every amount is an estimate from dashboard counts under your commission plan; the official calculation is done outside this dashboard.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function AdminInvoices({ email, focus }: { email: string; focus: number | null }) {
  const now = new Date();
  const { months, rows } = adminInvoiceOverview(now);
  const cfg = invoicesConfig();
  const approver = isApprover(email);
  return (
    <section className="band band-dark inv-page">
      <div className="band-inner">
        <h1 className="page-title">Invoices</h1>
        <p className="note inv-intro">
          One row per rep and month. Draft = not sent yet (the live estimate is shown); Submitted = sent for review with its PDF; Approved once {cfg.approvers.join(" and ")} have both approved; Paid after an admin marks it paid. The rep is emailed at each change.
          {approver ? "" : " Your address is not on the approver list, so you can mark paid but not approve."}
        </p>
        {months.map((mk) => {
          const mStart = monthStartOf(mk);
          const list = rows.filter((r) => r.month.key === mk);
          const current = list[0]?.month.current ?? false;
          const total = list.reduce((s, r) => s + r.month.amount, 0);
          return (
            <div key={mk} className="kpi-row cols-1">
              <div className="stat kpi kpi-title-xl reveal is-visible" data-kpi={`inv-month-${mk}`}>
                <div className="kpi-head">
                  <div className="kpi-head-row">
                    <div className="label">{mStart ? monthFmt.format(mStart) : mk}</div>
                    <div className="kpi-head-right">{current ? <span className="pill pill-neutral">Live preview · can be sent from the 1st</span> : null}</div>
                  </div>
                  <div className="kpi-sub note">
                    {list.length} reps · {usd(total)} estimated in total
                  </div>
                </div>
                <div className="scroll kpi-body">
                  <table className="stat-breakdown me-list inv-table">
                    <thead>
                      <tr>
                        <th>Rep</th>
                        <th>Status</th>
                        <th className="num">Estimated</th>
                        <th>Calculation</th>
                        <th>Sent</th>
                        <th>Approvals</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map(({ rep, month: m }) => {
                        const s = m.stored;
                        const mine = s ? s.approvals.some((a) => a.email === email) : false;
                        return (
                          <tr key={rep.userId} id={s ? `inv-${s.id}` : undefined} className={s && focus === s.id ? "inv-focus" : undefined}>
                            <td>
                              <a className="me-link" href={`/invoices/${mk}?as=${encodeURIComponent(rep.userId)}`} title="Open this rep's invoice as they see it">
                                {rep.name}
                              </a>
                              {s ? <span className="plan-label">{s.number}</span> : null}
                            </td>
                            <td>
                              <StatusPill status={m.status} current={m.current} />
                            </td>
                            <td className="num">{usd(m.amount)}</td>
                            <td className="note">{m.calc}</td>
                            <td className="note">{s ? fmtDateTime(s.submittedAt) : "—"}</td>
                            <td className="note">{s ? (s.approvals.length === 0 ? "none yet" : s.approvals.map((a) => `${a.email.split("@")[0]} ${fmtDateTime(a.at)}`).join(" · ")) : "—"}</td>
                            <td className="inv-actions">
                              {s ? (
                                <>
                                  <a className="btn btn-secondary inv-btn" href={`/api/me/invoices/pdf?id=${s.id}`}>
                                    PDF
                                  </a>
                                  {s.status === "submitted" && approver && !mine ? <InvoiceActionButton url="/api/admin/invoices" body={{ id: s.id, action: "approve" }} label="Approve" busyLabel="Approving…" className="btn inv-btn" /> : null}
                                  {s.status === "submitted" && mine ? <span className="note">you approved</span> : null}
                                  {s.status === "approved" ? <InvoiceActionButton url="/api/admin/invoices" body={{ id: s.id, action: "paid" }} label="Mark paid" busyLabel="Marking…" confirm={`Mark ${rep.name}'s ${mStart ? monthFmt.format(mStart) : mk} invoice (${usd(s.amount)}) as paid?`} className="btn inv-btn" /> : null}
                                  {s.status === "paid" ? <span className="note">paid {fmtDateTime(s.paidAt)}</span> : null}
                                </>
                              ) : (
                                <span className="note">{m.current ? "in progress" : "not sent yet"}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const asParam = first(sp.as);
  const user = await requirePageUser(asParam ? `/invoices?as=${encodeURIComponent(asParam)}` : "/invoices");
  if (user.role === "rep") {
    const rep = salesReps.find((r) => r.userId === user.repUserId);
    if (!rep) redirect("/login?error=Configuration");
    const view = repViewOf(rep, user, false);
    return <RepInvoices userId={view.userId} name={view.name} viewingAs={false} asQuery="" />;
  }
  if (asParam) {
    const rep = salesReps.find((r) => r.userId === asParam);
    if (rep) return <RepInvoices userId={rep.userId} name={rep.name} viewingAs asQuery={`?as=${encodeURIComponent(rep.userId)}`} />;
  }
  const focus = Number(first(sp.focus));
  return <AdminInvoices email={user.email} focus={Number.isFinite(focus) && focus > 0 ? focus : null} />;
}

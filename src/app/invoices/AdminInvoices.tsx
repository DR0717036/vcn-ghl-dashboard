// The admin Invoices page (owner request 2026-11-24): what is due now,
// every rep's invoices (stored and live drafts) through rep / period / type
// / status filters with Approve and Mark paid, PDF and CSV downloads, the
// attendance overrides (current period per base-pay rep, the form, and the
// log), and the monthly summary preview. Server component; the buttons and
// the form are small client pieces. Nothing here touches GHL.

import { fmtDateTime } from "@/lib/dates";
import { invoicesConfig, isApprover } from "@/lib/invoices/config";
import { adminInvoiceRows, monthlySummary, nextSummaryAt, type AdminFilters, type AdminInvoiceRow } from "@/lib/payroll/admin";
import { allOverrides, attendanceForNow, DAY_STATUS_LABEL, overrideLog, OVERRIDE_LABEL, type Attendance } from "@/lib/payroll/attendance";
import { basePayFor, payrollConfig } from "@/lib/payroll/config";
import { STATUS_LABEL, TYPE_LABEL } from "@/lib/payroll/store";
import { activeReps, salesReps } from "@/lib/reps";
import InvoiceActionButton from "./InvoiceActionButton";
import OverrideForm from "./OverrideForm";
import OverrideDayButton from "./OverrideDayButton";
import StatusPill from "./StatusPill";

const n = (v: number) => v.toLocaleString("en-US");
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function Filters({ f }: { f: AdminFilters }) {
  const reps = salesReps;
  return (
    <form method="get" action="/invoices" className="inv-filters">
      <label>
        <span className="label">Rep</span>
        <select name="rep" defaultValue={f.rep ?? ""}>
          <option value="">Every rep</option>
          {reps.map((r) => (
            <option key={r.userId} value={r.userId}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="label">Type</span>
        <select name="type" defaultValue={f.type ?? ""}>
          <option value="">Both</option>
          <option value="base">Bi-weekly base</option>
          <option value="commission">Monthly commission</option>
        </select>
      </label>
      <label>
        <span className="label">Status</span>
        <select name="status" defaultValue={f.status ?? ""}>
          <option value="">Any</option>
          <option value="draft">Draft (not sent)</option>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="paid">Paid</option>
        </select>
      </label>
      <label>
        <span className="label">Period (YYYY-MM or period start)</span>
        <input type="text" name="period" defaultValue={f.period ?? ""} placeholder="2026-12" />
      </label>
      <button type="submit" className="btn">
        Apply
      </button>
      <a className="btn btn-secondary" href="/invoices">
        Clear
      </a>
    </form>
  );
}

function AttendanceStrip({ a, name, userId }: { a: Attendance; name: string; userId: string }) {
  return (
    <div className="inv-att-row">
      <div className="inv-att-name">
        <b>{name}</b>
        <span className="note">
          {n(a.worked)} worked · {n(a.unpaid)} non-paid · {n(a.excused)} excused · {n(a.holidays)} holiday{a.holidays === 1 ? "" : "s"} · deduction {usd(a.deduction)}
          {a.extras > 0 ? ` · extra +${usd(a.extras)}` : ""} · expected {a.expected === null ? "—" : usd(a.expected)}
        </span>
      </div>
      <div className="inv-att-days">
        {a.days.map((d) => {
          const cls = `inv-att-day is-${d.holiday?.optional && d.status === "worked" ? "worked" : d.status}`;
          const title = `${d.weekday} ${d.short} · ${n(d.dials)} dials · ${d.override ? `${OVERRIDE_LABEL[d.override.kind]} (${d.override.createdBy}${d.override.note ? `: ${d.override.note}` : ""})` : d.holiday ? `${d.holiday.name}${d.holiday.optional ? ", optional" : ""}` : DAY_STATUS_LABEL[d.status]}`;
          const inner = (
            <>
              <i>{d.short.replace(/^\w+ /, "")}</i>
              <b>{d.status === "upcoming" ? "·" : n(d.dials)}</b>
            </>
          );
          // A red (non-paid) day is a button: it pre-fills the override form.
          if (d.status === "unpaid")
            return (
              <OverrideDayButton key={d.day} userId={userId} day={d.day} className={cls} title={`${title} · click to mark this day paid`}>
                {inner}
              </OverrideDayButton>
            );
          return (
            <span key={d.day} className={cls} title={title}>
              {inner}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminInvoices({ f, focus, email }: { f: AdminFilters; focus: number | null; email: string }) {
  const now = new Date();
  const rows = adminInvoiceRows(now, f);
  const approver = isApprover(email);
  const cfg = invoicesConfig();
  const pcfg = payrollConfig();
  const s = monthlySummary(now);
  const baseReps = activeReps(now).filter((r) => basePayFor(r.userId) !== null);
  const strips = baseReps.map((r) => ({ rep: r, a: attendanceForNow(r, now) }));
  const shown = strips[0]?.a ?? null;
  const overrides = allOverrides();
  const log = overrideLog(30);
  const nameOf = (id: string) => salesReps.find((r) => r.userId === id)?.name ?? id;
  const csvQuery = new URLSearchParams(Object.entries({ rep: f.rep ?? "", type: f.type ?? "", status: f.status ?? "", period: f.period ?? "" }).filter(([, v]) => v)).toString();
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

  const actions = (r: AdminInvoiceRow) => {
    const st = r.stored;
    if (!st) return <span className="note">{r.available ? "ended · not sent by the rep yet" : (r.unavailableReason ?? "in progress")}</span>;
    const mine = st.approvals.some((a) => a.email === email);
    return (
      <>
        <a className="btn btn-secondary inv-btn" href={`/api/me/invoices/pdf?id=${st.id}`}>
          PDF
        </a>
        <a className="btn btn-secondary inv-btn" href={`/api/admin/invoices/csv?id=${st.id}`}>
          Lines CSV
        </a>
        {st.status === "submitted" && approver && !mine ? <InvoiceActionButton url="/api/admin/invoices" body={{ id: st.id, action: "approve" }} label="Approve" busyLabel="Approving…" className="btn inv-btn" /> : null}
        {st.status === "submitted" && mine ? <span className="note">you approved · waiting for {cfg.approvers.filter((a) => !st.approvals.some((x) => x.email === a)).join(", ") || "nobody"}</span> : null}
        {st.status === "submitted" && !approver && !mine ? <span className="note">approval by {cfg.approvers.join(" and ")}</span> : null}
        {st.status === "approved" ? <InvoiceActionButton url="/api/admin/invoices" body={{ id: st.id, action: "paid" }} label="Mark paid" busyLabel="Marking…" confirm={`Mark ${r.repName}'s ${r.periodLabel} ${TYPE_LABEL[r.type].toLowerCase()} invoice (${usd(st.amount)}) as paid?`} className="btn inv-btn" /> : null}
        {st.status === "paid" ? <span className="note">paid {fmtDateTime(st.paidAt)}</span> : null}
      </>
    );
  };

  return (
    <section className="band band-dark inv-page">
      <div className="band-inner">
        <h1 className="page-title">Invoices</h1>
        <p className="note inv-intro">
          Bi-weekly base pay and monthly commission invoices for every rep. Draft = the rep has not sent it (the live estimate shows); Submitted = sent with its PDF; Approved once {cfg.approvers.join(" and ")} have both approved; Paid after an admin marks it paid. The rep is emailed at each change. Invoices go To {pcfg.recipients.to.join(", ")} with {pcfg.recipients.cc.join(", ")} in Cc.
          {approver ? "" : " Your address is not on the approver list, so you can mark paid but not approve."}
        </p>

        <div className="kpi-row cols-3">
          <div className="stat kpi reveal is-visible" data-kpi="inv-due">
            <div className="kpi-head">
              <div className="label">Outstanding</div>
              <div className="kpi-sub note">sent, not yet paid</div>
            </div>
            <div className="stat-value">{usd(s.dueTotal)}</div>
            <div className="note">
              {n(s.due.length)} invoice{s.due.length === 1 ? "" : "s"} · {n(s.due.filter((r) => r.status === "submitted").length)} waiting for approval · {n(s.due.filter((r) => r.status === "approved").length)} approved, unpaid
            </div>
          </div>
          <div className="stat kpi reveal is-visible" data-kpi="inv-unsent">
            <div className="kpi-head">
              <div className="label">Ended, not sent</div>
              <div className="kpi-sub note">periods the reps could send now</div>
            </div>
            <div className="stat-value">{usd(s.unsentTotal)}</div>
            <div className="note">{s.unsent.length === 0 ? "every ended period has been sent" : s.unsent.map((r) => `${r.repName} (${TYPE_LABEL[r.type].split(" ")[0].toLowerCase()} ${r.key})`).join(", ")}</div>
          </div>
          <div className="stat kpi reveal is-visible" data-kpi="inv-summary">
            <div className="kpi-head">
              <div className="label">Monthly summary</div>
              <div className="kpi-sub note">emailed to {pcfg.monthlySummary.to.join(", ")}</div>
            </div>
            <div className="stat-value">{n(s.due.length + s.unsent.length)}</div>
            <div className="note">
              items in the next summary · next send {nextSummaryAt(now)} ·{" "}
              <a className="me-link" href="/api/admin/payroll-summary" target="_blank" rel="noreferrer">
                preview
              </a>
            </div>
          </div>
        </div>

        <div className="kpi-row cols-1">
          <div className="stat kpi kpi-title-xl reveal is-visible" data-kpi="inv-admin-list">
            <div className="kpi-head">
              <div className="kpi-head-row">
                <div className="label">All invoices</div>
                <div className="kpi-head-right">
                  <a className="btn btn-secondary inv-btn" href={`/api/admin/invoices/csv${csvQuery ? `?${csvQuery}` : ""}`}>
                    Download CSV ({n(rows.length)} rows)
                  </a>
                </div>
              </div>
              <div className="kpi-sub note">{n(rows.length)} shown · newest period first · click a rep to open their invoices as they see them</div>
            </div>
            <Filters f={f} />
            <div className="scroll kpi-body">
              <table className="stat-breakdown me-list inv-table">
                <thead>
                  <tr>
                    <th>Rep</th>
                    <th>Invoice</th>
                    <th>Type</th>
                    <th>Period</th>
                    <th className="num">Amount</th>
                    <th className="num">Flagged days</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="note">
                        Nothing matches these filters.
                      </td>
                    </tr>
                  ) : null}
                  {rows.map((r) => (
                    <tr key={`${r.userId}-${r.type}-${r.key}`} id={r.stored ? `inv-${r.stored.id}` : undefined} className={r.stored && focus === r.stored.id ? "inv-focus" : undefined}>
                      <td>
                        <a className="me-link" href={`/invoices?as=${encodeURIComponent(r.userId)}`} title="Open this rep's invoices as they see them">
                          {r.repName}
                        </a>
                      </td>
                      <td>
                        <a className="me-link" href={`/invoices/${r.type}/${r.key}?as=${encodeURIComponent(r.userId)}`}>
                          {r.number}
                        </a>{" "}
                        <a className="btn btn-secondary inv-btn inv-btn-mini" href={`/api/me/invoices/preview?type=${r.type}&key=${encodeURIComponent(r.key)}&as=${encodeURIComponent(r.userId)}`} target="_blank" rel="noreferrer" title={r.stored ? "Open the PDF that was sent" : "Open the PDF as it would be sent right now (not stored, not emailed)"}>
                          Preview PDF
                        </a>
                        {r.stored?.legacy ? <span className="plan-label">from the old flow</span> : null}
                      </td>
                      <td className="note">{TYPE_LABEL[r.type]}</td>
                      <td className="note">{r.periodLabel}</td>
                      <td className="num">{usd(r.amount)}</td>
                      <td className="num">{r.type === "base" ? (r.flaggedDays > 0 ? <span className="pill pill-warn">{n(r.flaggedDays)}</span> : <span className="note">none</span>) : <span className="note">—</span>}</td>
                      <td>
                        <StatusPill status={r.status} current={!r.available && !r.stored} />
                        {r.stored ? <span className="plan-label">{r.stored.approvals.length > 0 && r.status === "submitted" ? `${r.stored.approvals.length} of ${cfg.approvers.length} approvals` : `sent ${fmtDateTime(r.stored.submittedAt)}`}</span> : null}
                      </td>
                      <td className="inv-actions">{actions(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="kpi-row cols-1">
          <div className="stat kpi kpi-title-xl reveal is-visible" data-kpi="inv-attendance">
            <div className="kpi-head">
              <div className="label">Attendance overrides</div>
              <div className="kpi-sub note">
                {shown ? (shown.preview ? `preview of the two weeks before the first pay period · ${shown.period.label}` : `pay period ${n(shown.period.index)} · ${shown.period.label}`) : "no base-pay rep"} · each base-pay rep&rsquo;s working days with their dials · mark a day approved PTO, sick, company holiday, or excused so it is paid; the note is shown to the rep and every change is logged
              </div>
            </div>
            <div className="inv-att-list">
              {strips.map(({ rep, a }) => (
                <AttendanceStrip key={rep.userId} a={a} name={rep.name} userId={rep.userId} />
              ))}
              {baseReps.length === 0 ? <p className="note">No rep has base pay configured.</p> : null}
            </div>
            <div className="note me-att-legend">
              <span className="me-att-key is-worked">Worked</span>
              <span className="me-att-key is-unpaid">Non-paid day off</span>
              <span className="me-att-key is-excused">Excused (override)</span>
              <span className="me-att-key is-holiday">Holiday (unpaid)</span>
              <span className="me-att-key is-today">Today</span>
              <span className="me-att-key is-upcoming">Upcoming</span>
            </div>
            <p className="note inv-override-hint">Only red days need action. Mark a day to pay it anyway (PTO, sick, excused). Click a red day above to fill in the form.</p>
            <OverrideForm reps={baseReps.map((r) => ({ userId: r.userId, name: r.name }))} defaultDay={todayKey} />
            <div className="label kpi-notes-title">Current overrides</div>
            <div className="scroll kpi-body">
              <table className="stat-breakdown me-list inv-table">
                <thead>
                  <tr>
                    <th>Rep</th>
                    <th>Day</th>
                    <th>Marked as</th>
                    <th>Note</th>
                    <th>By</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {overrides.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="note">
                        No overrides yet.
                      </td>
                    </tr>
                  ) : null}
                  {overrides.map((o) => (
                    <tr key={`${o.userId}-${o.day}`}>
                      <td>{nameOf(o.userId)}</td>
                      <td>{o.day}</td>
                      <td>{OVERRIDE_LABEL[o.kind]}</td>
                      <td className="note">{o.note ?? "—"}</td>
                      <td className="note">{o.createdBy}</td>
                      <td className="note">{fmtDateTime(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details className="kpi-details">
              <summary>Override log ({n(log.length)} most recent)</summary>
              <div className="kpi-details-body">
                <table className="stat-breakdown me-list inv-table">
                  <tbody>
                    {log.map((l) => (
                      <tr key={l.id}>
                        <td className="note">{fmtDateTime(l.at)}</td>
                        <td>{l.actor}</td>
                        <td>
                          {l.action === "set" ? "set" : "cleared"} {nameOf(l.userId)} · {l.day}
                          {l.kind ? ` · ${OVERRIDE_LABEL[l.kind]}` : ""}
                        </td>
                        <td className="note">{l.note ?? ""}</td>
                      </tr>
                    ))}
                    {log.length === 0 ? (
                      <tr>
                        <td className="note">Nothing logged yet.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </details>
            <p className="note">
              Status labels: <b>{Object.values(STATUS_LABEL).join(" · ")}</b>.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

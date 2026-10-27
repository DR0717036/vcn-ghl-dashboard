// "My commission": this month's estimate as a hero figure with the
// calculation shown beside it, then a month-by-month table. Every amount is
// labeled estimated. Server component.

import type { RepCommissionData } from "@/lib/me/commission";
import Notes from "../Notes";

const n = (v: number) => v.toLocaleString("en-US");
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function CommissionCard({ c, invoicesHref = "/invoices" }: { c: RepCommissionData; invoicesHref?: string }) {
  const m = c.thisMonth;
  return (
    <div className="stat kpi kpi-title-xl reveal me-card" data-kpi="me-commission">
      <div className="kpi-head">
        <div className="label">My commission</div>
        <div className="kpi-sub note">Estimated from dashboard counts · plan {c.planKey} · the official calculation is done outside this dashboard</div>
      </div>
      <div className="me-hero">
        <div className="me-hero-main">
          <div className="stat-value">{m.amount === null ? "—" : usd(m.amount)}</div>
          <div className="note">
            <b>{m.label}</b> · estimated · {m.rangeLabel}
          </div>
        </div>
        <div className="me-calc">
          <div className="label">How it adds up</div>
          <div className="me-calc-line">{m.calc}</div>
          <div className="note">
            {n(m.submissions)} submission{m.submissions === 1 ? "" : "s"} · {n(m.won)} won ({usd(m.wonValue)} Opportunity Value)
          </div>
        </div>
      </div>
      <p className="note me-plan-text">
        <b>Your plan:</b> {c.planText}{" "}
        <a className="me-link" href={invoicesHref}>
          Invoices and their status →
        </a>
      </p>
      <div className="scroll kpi-body">
        <table className="stat-breakdown me-list">
          <thead>
            <tr>
              <th>Month</th>
              <th className="num">Submissions</th>
              <th className="num">Won</th>
              <th>Calculation</th>
              <th className="num">Estimated commission</th>
            </tr>
          </thead>
          <tbody>
            {c.history.map((h) => (
              <tr key={h.key} className={h.current ? "me-row-current" : undefined}>
                <td>
                  {h.label}
                  {h.current ? <span className="plan-label">month to date</span> : null}
                  {h.partial ? <span className="plan-label">partial history</span> : null}
                </td>
                <td className="num">{n(h.submissions)}</td>
                <td className="num" title={`Opportunity Value ${usd(h.wonValue)}`}>
                  {n(h.won)}
                </td>
                <td>{h.calc}</td>
                <td className="num">{h.amount === null ? "—" : usd(h.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="kpi-details">
        <summary>How this is counted</summary>
        <div className="kpi-details-body">
          <Notes notes={c.notes} />
        </div>
      </details>
    </div>
  );
}

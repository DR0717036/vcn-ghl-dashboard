// "My overview": three tiles at the top of the rep dashboard. Commission
// earned this month (estimate with its calculation), the next milestone
// under the rep's plan with a small progress bar, and the rep's rank by
// submissions this month with the change vs last month. Server component.

import type { RepOverview } from "@/lib/me/overview";
import Notes from "../Notes";

const n = (v: number) => v.toLocaleString("en-US");
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function OverviewCard({ o }: { o: RepOverview }) {
  const m = o.milestone;
  const r = o.rank;
  const rankDelta = r.delta === null ? null : r.delta > 0 ? { cls: "delta-up", text: `▲ up ${n(r.delta)} vs last month (#${r.lastRank})` } : r.delta < 0 ? { cls: "delta-down", text: `▼ down ${n(-r.delta)} vs last month (#${r.lastRank})` } : { cls: "delta-flat", text: `same as last month (#${r.lastRank})` };
  return (
    <div className="stat kpi kpi-title-xl reveal me-card" data-kpi="me-overview">
      <div className="kpi-head">
        <div className="label">My overview</div>
        <div className="kpi-sub note">{o.monthLabel} · estimates from your plan · the official commission calculation is done outside this dashboard</div>
      </div>
      <div className="stat-tiles me-overview">
        <div className="stat-tile">
          <div className="label">Commission earned this month</div>
          <div className="stat-value">{o.commission.amount === null ? "—" : usd(o.commission.amount)}</div>
          <div className="note stat-tile-caption">
            estimated · {o.commission.calc}
            {o.commission.planLabel ? ` · ${o.commission.planLabel}` : ""}
          </div>
        </div>
        <div className="stat-tile">
          <div className="label">{m.title}</div>
          <div className={`me-milestone${m.done ? " is-done" : ""}`}>{m.text}</div>
          {m.progress ? (
            <div className="me-goal" title={`${n(m.progress.value)} of ${n(m.progress.max)}`}>
              <div className={`me-bar ${m.done ? "me-bar-good" : "me-bar-accent"}`} role="img" aria-label={`${n(m.progress.value)} of ${n(m.progress.max)}`}>
                <span style={{ width: `${Math.min(100, Math.round((m.progress.value / Math.max(1, m.progress.max)) * 100))}%` }} />
              </div>
              <div className="note me-goal-text">
                {n(m.progress.value)} of {n(m.progress.max)} this month
              </div>
            </div>
          ) : null}
          <div className="note stat-tile-caption">{m.detail}</div>
        </div>
        <div className="stat-tile">
          <div className="label">My rank</div>
          <div className="stat-value">
            {r.rank === null ? "—" : `#${r.rank}`} <span className="me-hero-of">of {n(r.of)}</span>
          </div>
          <div className="note stat-tile-caption">
            in submissions this month ({n(r.mtd)})
            {rankDelta ? (
              <>
                {" · "}
                <span className={rankDelta.cls}>{rankDelta.text}</span>
              </>
            ) : (
              " · no rank last month"
            )}
          </div>
        </div>
      </div>
      <details className="kpi-details">
        <summary>How this is counted</summary>
        <div className="kpi-details-body">
          <Notes notes={o.notes} />
        </div>
      </details>
    </div>
  );
}

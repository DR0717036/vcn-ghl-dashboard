// "My scorecard": one tile per KPI for the date range selected in the
// control bar, built like the team's KPI cards: the figure, a Met / On Track
// / Missed pill against the rep's own goal, a goal bar with the "by now"
// mark, the goal text, and the change vs the previous period. Server
// component: no hooks, nothing fetched by the browser.

import type { ScoreMetric, RepScorecard } from "@/lib/me/scorecard";
import { fmtKind } from "@/lib/me/scorecard";
import { StatusPill } from "../GoalLine";
import { Delta } from "../KpiShell";
import Notes from "../Notes";

function barClass(attainment: number | null): string {
  if (attainment === null) return "me-bar-none";
  if (attainment >= 1) return "me-bar-good";
  if (attainment >= 0.5) return "me-bar-warn";
  return "me-bar-bad";
}

function GoalLine({ m, partial }: { m: ScoreMetric; partial: boolean }) {
  if (!m.goal) return <div className="me-goal note">{m.goalNote ?? "No goal for this KPI"}</div>;
  const attainment = m.value === null ? null : m.value / m.goal.full;
  const pct = attainment === null ? 0 : Math.min(1, attainment);
  const showByNow = partial && Math.round(m.goal.scaled) !== Math.round(m.goal.full);
  const label = `Goal ${fmtKind(m.kind, Math.round(m.goal.full))}${attainment !== null ? ` · ${Math.round(attainment * 100)}% of goal` : ""}${showByNow ? ` · ${fmtKind(m.kind, Math.round(m.goal.scaled))} by now` : ""}`;
  return (
    <div className="me-goal" title={label}>
      <div className={`me-bar ${barClass(attainment)}`} role="img" aria-label={label}>
        <span style={{ width: `${Math.round(pct * 100)}%` }} />
        {showByNow && m.goal.full > 0 ? <i className="me-bar-mark" style={{ left: `${Math.min(100, Math.round((m.goal.scaled / m.goal.full) * 100))}%` }} aria-hidden="true" /> : null}
      </div>
      <div className="note me-goal-text">{label}</div>
    </div>
  );
}

function Tile({ m, partial }: { m: ScoreMetric; partial: boolean }) {
  const fmt = m.kind === "minutes" ? "minutes" : "count";
  return (
    <div className="stat-tile me-tile" title={m.source}>
      <div className="label">{m.label}</div>
      <div className="me-tile-value">
        <div className={`stat-value${m.value === null ? " unavailable" : ""}`}>{m.text}</div>
        <div className="kpi-pill">{m.status ? <StatusPill status={m.status} /> : m.goal === null && !m.goalNote ? <span className="pill pill-neutral">No goal</span> : null}</div>
      </div>
      {m.unavailable ? <div className="note">{m.unavailable}</div> : null}
      <GoalLine m={m} partial={partial} />
      <div className="me-tile-delta">{m.kind === "pct" ? <PctDelta value={m.value} prev={m.prev} reason={m.prevUnavailable} /> : <Delta value={m.value} prev={m.prev} format={fmt} reason={m.prevUnavailable} />}</div>
      {m.sub ? <div className="note me-sub">{m.sub}</div> : null}
      {m.parts ? (
        <div className="me-parts">
          {m.parts.map((p) => (
            <span key={p.label}>
              {p.label} <b>{p.text}</b>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Change in percentage points for a rate (the Delta component is for counts and minutes). */
function PctDelta({ value, prev, reason }: { value: number | null; prev: number | null; reason?: string }) {
  if (value === null || prev === null)
    return (
      <span className="kpi-muted" title={reason}>
        Comparison unavailable
      </span>
    );
  const pts = Math.round((value - prev) * 100);
  const cls = pts > 0 ? "delta-up" : pts < 0 ? "delta-down" : "delta-flat";
  return (
    <span className={cls} title={`Previous period: ${Math.round(prev * 100)}%`}>
      {pts > 0 ? "+" : pts < 0 ? "−" : "±"}
      {Math.abs(pts)} pts vs prior
    </span>
  );
}

export default function ScorecardCard({ s, name, rangeText, prevText }: { s: RepScorecard; name: string; rangeText: string; prevText: string }) {
  return (
    <div className="stat kpi kpi-title-xl reveal me-card" data-kpi="me-scorecard">
      <div className="kpi-head">
        <div className="label">My scorecard · {s.rangeLabel}</div>
        <div className="kpi-sub note">
          {name} · {rangeText} · compared with {prevText}
          {s.partial ? " (same elapsed portion)" : ""} · every figure is your row on the team scorecard, against your own goals
        </div>
      </div>
      <div className="stat-tiles me-tiles">
        {s.metrics.map((m) => (
          <Tile key={m.key} m={m} partial={s.partial} />
        ))}
      </div>
      <details className="kpi-details">
        <summary>How this is counted</summary>
        <div className="kpi-details-body">
          <Notes notes={s.notes} />
        </div>
      </details>
    </div>
  );
}

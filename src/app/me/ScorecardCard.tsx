// "My scorecard": one card, a column per period (Today, This Week, This
// Month, and the selected range when it is a different period), a row per
// KPI. Each cell shows the figure, a goal bar against the rep's own goal for
// the whole period (green at 100%+, yellow at 50–99%, red below, as the
// weekly report colors it), the goal text, and the smaller lines the admin
// rows carry (conversations, no-shows, the Army / Veteran split, Opportunity
// Value). Server component: no hooks, nothing fetched by the browser.

import type { Cell, RepScorecard } from "@/lib/me/scorecard";
import { fmtKind } from "@/lib/me/scorecard";
import Notes from "../Notes";

function barClass(attainment: number | null): string {
  if (attainment === null) return "me-bar-none";
  if (attainment >= 1) return "me-bar-good";
  if (attainment >= 0.5) return "me-bar-warn";
  return "me-bar-bad";
}

export function GoalBar({ c, kind, partial }: { c: Cell; kind: RepScorecard["rows"][number]["kind"]; partial: boolean }) {
  if (c.goal === null) return <div className="me-goal note">{c.goalNote ?? "No goal for this KPI"}</div>;
  const pct = c.attainment === null ? 0 : Math.min(1, c.attainment);
  const byNow = partial && c.goalByNow !== null && Math.round(c.goalByNow) !== Math.round(c.goal) ? ` · ${fmtKind(kind, Math.round(c.goalByNow))} by now` : "";
  const label = `Goal ${fmtKind(kind, Math.round(c.goal))}${byNow}${c.attainment !== null ? ` · ${Math.round(c.attainment * 100)}%` : ""}`;
  return (
    <div className="me-goal" title={label}>
      <div className={`me-bar ${barClass(c.attainment)}`} role="img" aria-label={label}>
        <span style={{ width: `${Math.round(pct * 100)}%` }} />
        {partial && c.goalByNow !== null && c.goal > 0 ? <i className="me-bar-mark" style={{ left: `${Math.min(100, Math.round((c.goalByNow / c.goal) * 100))}%` }} aria-hidden="true" /> : null}
      </div>
      <div className="note me-goal-text">{label}</div>
    </div>
  );
}

export default function ScorecardCard({ s, name }: { s: RepScorecard; name: string }) {
  const cols = s.periods.length;
  return (
    <div className="stat kpi kpi-title-xl reveal me-card" data-kpi="me-scorecard">
      <div className="kpi-head">
        <div className="label">My scorecard</div>
        <div className="kpi-sub note">{name} · every figure is your row on the team scorecard, against your own goals</div>
      </div>
      <div className="scroll kpi-body">
        <div className="me-score" style={{ gridTemplateColumns: `minmax(170px, 1.1fr) repeat(${cols}, minmax(170px, 1fr))` }}>
          <div className="me-score-corner" />
          {s.periods.map((p) => (
            <div key={p.key} className="me-score-head">
              <div className="label">{p.label}</div>
              <div className="note">{p.text}</div>
            </div>
          ))}
          {s.rows.map((row) => (
            <div key={row.key} className="me-score-row">
              <div className="me-score-label" title={row.source}>
                <b>{row.label}</b>
                <span className="note">{row.source.replace(/\s*\(.*$/, "")}</span>
              </div>
              {row.cells.map((c, i) => (
                <div key={s.periods[i].key} className="me-score-cell">
                  <div className={`stat-value${c.value === null ? " unavailable" : ""}`}>{c.text}</div>
                  <GoalBar c={c} kind={row.kind} partial={s.periods[i].partial} />
                  {c.sub ? <div className="note me-sub">{c.sub}</div> : null}
                  {c.parts ? (
                    <div className="me-parts">
                      {c.parts.map((p) => (
                        <span key={p.label}>
                          {p.label} <b>{p.text}</b>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>
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

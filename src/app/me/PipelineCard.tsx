// "My pipeline": the rep's live opportunities by stage, one table per
// program pipeline (Army CA, Veteran G.I. Bill), with open / won / lost and
// the Opportunity Value on the open ones. Server component.

import type { ProgramPipeline, RepPipelineData } from "@/lib/me/pipeline";
import Notes from "../Notes";

const n = (v: number) => v.toLocaleString("en-US");
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function ProgramTable({ p }: { p: ProgramPipeline }) {
  const max = Math.max(1, ...p.stages.map((s) => s.total));
  return (
    <div className="stat kpi reveal me-card" data-kpi={`me-pipeline-${p.program}`}>
      <div className="kpi-head">
        <div className="label">{p.label}</div>
        <div className="kpi-sub note">{p.pipelineName} · your opportunities by stage · snapshot as of the last sync</div>
      </div>
      <div className="kpi-value-row">
        <div className="kpi-value">
          <div className="stat-value">
            {n(p.totals.open)} <span className="me-hero-of">open</span>
          </div>
        </div>
        <div className="kpi-pill">
          <span className="pill pill-neutral" title="Opportunity Value on your open opportunities; never revenue">
            {usd(p.totals.openValue)} open value
          </span>
        </div>
      </div>
      <div className="kpi-line">
        <span className="kpi-muted">
          {n(p.totals.won)} won · {n(p.totals.lost)} lost · {n(p.totals.total)} in total
        </span>
      </div>
      <div className="scroll kpi-body">
        <table className="stat-breakdown me-list me-stages">
          <thead>
            <tr>
              <th>Stage</th>
              <th className="num">Open</th>
              <th className="num">Won</th>
              <th className="num">Lost</th>
              <th className="num">Open value</th>
            </tr>
          </thead>
          <tbody>
            {p.stages.map((s) => (
              <tr key={s.stageId} className={s.total === 0 ? "me-row-empty" : undefined}>
                <td>
                  <span className="me-stage-name">{s.name}</span>
                  <span className="me-stage-bar" aria-hidden="true">
                    <i style={{ width: `${Math.round((s.total / max) * 100)}%` }} />
                  </span>
                </td>
                <td className="num">{n(s.open)}</td>
                <td className="num">{n(s.won)}</td>
                <td className="num">{n(s.lost)}</td>
                <td className="num" title={s.valueMissing > 0 ? `${n(s.valueMissing)} open opportunit${s.valueMissing === 1 ? "y has" : "ies have"} no value in GHL` : undefined}>
                  {s.open > 0 ? usd(s.openValue) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PipelineCard({ d }: { d: RepPipelineData }) {
  return (
    <>
      <div className="kpi-row cols-2 kpi-row-top">
        {d.programs.map((p) => (
          <ProgramTable key={p.program} p={p} />
        ))}
      </div>
      {d.otherPipelines > 0 ? <p className="note">You also own {n(d.otherPipelines)} live opportunit{d.otherPipelines === 1 ? "y" : "ies"} outside the two program pipelines; they are not shown here.</p> : null}
      <details className="kpi-details rep-notes">
        <summary>How this is counted</summary>
        <div className="kpi-details-body">
          <Notes notes={d.notes} />
        </div>
      </details>
    </>
  );
}

// "My pipeline": the rep's live opportunities by stage, one card per program
// pipeline (Army CA, Veteran G.I. Bill), with open / won / lost. Each card
// shows a fixed set of working stages first, in a fixed order (owner request
// 2026-11-24, round 7): New Lead, Tier 1–7, Sale in Progress, Active Reply,
// the booked / scheduled appointment stage, and the missed-appointment stage,
// skipping a row only when the pipeline has no such stage; "View all stages"
// opens the full list in a modal. A rep never sees Opportunity Value. Server
// component apart from the modal button.

import type { ProgramPipeline, RepPipelineData } from "@/lib/me/pipeline";
import Notes from "../Notes";
import StagesModal, { StageTable } from "./StagesModal";

const n = (v: number) => v.toLocaleString("en-US");

/** The rows every card shows, in order; each entry lists the stage names that fill it (case-insensitive), the first match wins. */
const FIXED_ROWS: string[][] = [["New Lead"], ["Tier 1"], ["Tier 2"], ["Tier 3"], ["Tier 4"], ["Tier 5"], ["Tier 6"], ["Tier 7"], ["Sale in Progress"], ["Active Reply"], ["Appointment Booked (VCN)", "Appointment Scheduled"], ["IAU Appointment Missed", "Appointment missed", "Missed Appointment"]];

/** The fixed rows the pipeline has, in the fixed order, and how many other stages carry activity. */
export function fixedStages(p: ProgramPipeline): { rows: ProgramPipeline["stages"]; hidden: number } {
  const byName = new Map(p.stages.map((s) => [s.name.trim().toLowerCase(), s]));
  const rows: ProgramPipeline["stages"] = [];
  for (const names of FIXED_ROWS) {
    const hit = names.map((x) => byName.get(x.toLowerCase())).find((s) => s !== undefined);
    if (hit) rows.push(hit);
  }
  const shown = new Set(rows.map((s) => s.stageId));
  return { rows, hidden: p.stages.filter((s) => !shown.has(s.stageId) && s.total > 0).length };
}

function ProgramTable({ p }: { p: ProgramPipeline }) {
  const { rows, hidden } = fixedStages(p);
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
          <span className="pill pill-neutral" title="Your live opportunities in this pipeline, by opportunity id">
            {n(p.totals.total)} in total
          </span>
        </div>
      </div>
      <div className="kpi-line">
        <span className="kpi-muted">
          {n(p.totals.won)} won · {n(p.totals.lost)} lost · the working stages, {n(rows.length)} of {n(p.stages.length)}
          {hidden > 0 ? ` · ${n(hidden)} other stage${hidden === 1 ? "" : "s"} with activity in the full list` : ""}
        </span>
      </div>
      <div className="scroll kpi-body">{rows.length > 0 ? <StageTable p={p} rows={rows} /> : <p className="note">This pipeline has none of the working stages.</p>}</div>
      <div className="kpi-footer">
        <StagesModal p={p} hidden={hidden} />
      </div>
    </div>
  );
}

export default function PipelineCard({ d }: { d: RepPipelineData }) {
  return (
    <>
      <div className="kpi-row cols-2">
        {d.programs.map((p) => (
          <ProgramTable key={p.program} p={p} />
        ))}
      </div>
      {d.otherPipelines > 0 ? <p className="note">You also own {n(d.otherPipelines)} live opportunit{d.otherPipelines === 1 ? "y" : "ies"} outside the two program pipelines; they are not shown here.</p> : null}
      <details className="kpi-details rep-notes">
        <summary>How this is counted</summary>
        <div className="kpi-details-body">
          <Notes notes={[...d.notes, "Stages shown — the working stages in a fixed order (New Lead, Tier 1–7, Sale in Progress, Active Reply, Appointment Booked (VCN) or Appointment Scheduled, and the missed-appointment stage), a row skipped only when the pipeline has no such stage; \"View all stages\" lists every stage in pipeline order."]} />
        </div>
      </details>
    </>
  );
}

"use client";

// "View all stages" on a My pipeline card (owner request 2026-11-24, round
// 6): a button that opens the full stage list for one program pipeline in
// the shared modal shell. The card itself shows only the stages with any
// count, up to a dozen.

import { useState } from "react";
import type { ProgramPipeline } from "@/lib/me/pipeline";
import { ModalShell } from "../Drilldown";

const n = (v: number) => v.toLocaleString("en-US");

export function StageTable({ p, rows }: { p: ProgramPipeline; rows: ProgramPipeline["stages"] }) {
  const max = Math.max(1, ...p.stages.map((s) => s.total));
  return (
    <table className="stat-breakdown me-list me-stages">
      <thead>
        <tr>
          <th>Stage</th>
          <th className="num">Open</th>
          <th className="num">Won</th>
          <th className="num">Lost</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
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
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function StagesModal({ p, hidden }: { p: ProgramPipeline; hidden: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="kpi-details-btn" onClick={() => setOpen(true)}>
        View all stages ({n(p.stages.length)}){hidden > 0 ? ` · ${n(hidden)} more with activity` : ""}
      </button>
      {open ? (
        <ModalShell title={`${p.label} · every stage`} onClose={() => setOpen(false)}>
          <div className="modal-title">{p.label} · every stage</div>
          <div className="note modal-sub">
            {p.pipelineName} · your opportunities by stage, in pipeline order · snapshot as of the last sync · {n(p.totals.open)} open · {n(p.totals.won)} won · {n(p.totals.lost)} lost
          </div>
          <div className="modal-table-wrap">
            <StageTable p={p} rows={p.stages} />
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}

"use client";

// "Needs a call" on My pipeline (owner requests 2026-11-24, rounds 6 and 7):
// the rep's leads in an active working tier (tiers, Sale in Progress, Active
// Reply, the No Show and Missed Appointment stages) with no outbound call
// from them for more than N days: the total, the Army / Veteran split, a
// breakdown by stage, and a drilldown listing every lead (stage, days
// silent, last call outcome, GHL link), longest silent first. Clicking a
// stage row opens the list filtered to that stage; the card or "View the
// list" opens the full list. Rows come from /api/me/drilldown.

import { useState } from "react";
import { programColors } from "@/lib/design";
import type { NeedsCallResult } from "@/lib/needsCall";
import { DrilldownModal, NEEDS_CALL_COLUMNS, type DrilldownSpec } from "../Drilldown";
import KpiShell from "../KpiShell";

const n = (v: number) => v.toLocaleString("en-US");
const dateTime = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export default function NeedsCallCard({ r, asQuery }: { r: NeedsCallResult; asQuery: string }) {
  const [open, setOpen] = useState<DrilldownSpec | null>(null);
  const base: DrilldownSpec = {
    endpoint: "/api/me/drilldown",
    query: `kind=needsCall${asQuery}`,
    title: `Needs a call · ${n(r.total)} ${r.total === 1 ? "lead" : "leads"}`,
    subtitle: `Open leads of yours in an active tier with no outbound call from you for more than ${n(r.silentDays)} days · snapshot ${dateTime.format(new Date(r.asOf))} · longest silent first`,
    expected: r.total,
    facts: [
      { label: "Army", value: n(r.army) },
      { label: "Veteran", value: n(r.veteran) },
    ],
    columns: NEEDS_CALL_COLUMNS,
    segments: [{ key: "all", label: "All stages", expected: r.total }, ...r.byStage.map((s) => ({ key: s.stageId, label: `${s.stage} (${s.program === "army" ? "Army" : "Veteran"})`, expected: s.total }))],
    defaultSort: "daysSilent",
    notes: r.notes,
    csvName: "Needs a call",
  };
  const openAll = () => setOpen(base);
  const openStage = (stageId: string, label: string) => setOpen({ ...base, defaultSegment: stageId, title: `Needs a call · ${label}` });
  const table =
    r.byStage.length > 0 ? (
      <div className="scroll kpi-body">
        <table className="stat-breakdown rep-table rep-table-cohort me-needs-call">
          <colgroup>
            <col className="col-name" />
            <col className="col-num" />
            <col className="col-num" />
            <col className="col-num" />
          </colgroup>
          <thead>
            <tr>
              <th>Stage · click a row for its leads</th>
              <th className="num">
                <span className="stat-split-dot" style={{ background: programColors.army }} /> Army
              </th>
              <th className="num">
                <span className="stat-split-dot" style={{ background: programColors.veteran }} /> Veteran
              </th>
              <th className="num combined">Total</th>
            </tr>
          </thead>
          <tbody>
            {r.byStage.map((s) => (
              <tr
                key={s.stageId}
                className="rep-row-click"
                tabIndex={0}
                title={`Click for the ${n(s.total)} ${s.stage} lead${s.total === 1 ? "" : "s"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  openStage(s.stageId, `${s.stage} (${s.program === "army" ? "Army" : "Veteran"})`);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    openStage(s.stageId, `${s.stage} (${s.program === "army" ? "Army" : "Veteran"})`);
                  }
                }}
              >
                <td className="rep-name">
                  {s.stage}
                  <span className="plan-label">{s.pipeline}</span>
                </td>
                <td className="num">{n(s.army)}</td>
                <td className="num">{n(s.veteran)}</td>
                <td className="num combined">{n(s.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="note">Every lead of yours in an active tier has had a call from you in the last {n(r.silentDays)} days.</p>
    );
  return (
    <>
      <div style={{ display: "contents" }} onClick={openAll}>
        <KpiShell
          id="me-needs-call"
          className="kpi-clickable kpi-title-xl me-card"
          title="Needs a call"
          subtitle={`Your open leads in Tier 1–7, Sale in Progress, Active Reply, or a No Show / Missed Appointment stage with no outbound call from you in more than ${n(r.silentDays)} days · snapshot as of the last sync`}
          value={
            <>
              <div className="stat-value">{n(r.total)}</div>
              <div className="stat-split">
                <div title="In the Army CA pipeline">
                  <span className="stat-split-dot" style={{ background: programColors.army }} />
                  <span className="stat-split-value">{n(r.army)}</span>
                  <span className="stat-split-label">Army</span>
                </div>
                <div title="In the Veteran G.I. Bill pipeline">
                  <span className="stat-split-dot" style={{ background: programColors.veteran }} />
                  <span className="stat-split-value">{n(r.veteran)}</span>
                  <span className="stat-split-label">Veteran</span>
                </div>
              </div>
            </>
          }
          pill={r.total > 0 ? <span className="pill pill-warn">{n(r.total)} to call</span> : <span className="pill pill-ok">All called</span>}
          goalLine={<span className="kpi-muted">Longest silent first in the list · a stage row opens that stage only · the card opens every lead</span>}
          deltaLine={<span className="kpi-muted">Snapshot: the date range does not apply · calls only, texts and emails do not count</span>}
          body={table}
          footer={
            <button type="button" className="kpi-details-btn">
              View the list
            </button>
          }
        />
      </div>
      {open ? <DrilldownModal spec={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

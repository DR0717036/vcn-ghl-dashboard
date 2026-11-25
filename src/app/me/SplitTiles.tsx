"use client";

// The two program tiles on the Momentum card (owner request 2026-11-19):
// "Army CA 101 · 3" and "Veteran IAU · 4" (semester split underneath), each
// opening the drilldown of this month's submissions: contact, program and
// semester, submission time, the opportunity's stage now, the estimated
// commission, and a link to the contact in GHL (never Opportunity Value). Rows
// come from /api/me/drilldown (the rep's own rows only).

import { useState } from "react";
import { chartSeries } from "@/lib/design";
import type { Momentum } from "@/lib/me/overview";
import { DrilldownModal, MY_SUBMISSION_COLUMNS, type DrilldownSpec } from "../Drilldown";

const n = (v: number) => v.toLocaleString("en-US");

export default function SplitTiles({ m, monthLabel, asQuery }: { m: Momentum; monthLabel: string; asQuery: string }) {
  const [open, setOpen] = useState<DrilldownSpec | null>(null);
  const semParts = m.splitSemesters.filter((s) => s.count > 0);
  const semText = semParts.length === 0 ? (m.splitSemesters[0] ? `${m.splitSemesters[0].short} · 0` : "no semester configured") : semParts.map((s) => `${s.short} · ${n(s.count)}`).join("  ·  ");
  const spec = (program: "army" | "veteran"): DrilldownSpec => ({
    endpoint: "/api/me/drilldown",
    query: `kind=subs&program=${program}&range=this_month${asQuery}`,
    title: program === "army" ? `Army CA 101 submissions · ${n(m.split.army)}` : `Veteran IAU App submissions · ${n(m.split.veteran)}`,
    subtitle: `${monthLabel} · yours · ${program === "army" ? '"CA 101 submitted", Army CA' : `IAU App Submitted, every semester (${m.splitSemesters.map((s) => `${s.short} ${n(s.count)}`).join(", ")})`}`,
    expected: program === "army" ? m.split.army : m.split.veteran,
    columns: MY_SUBMISSION_COLUMNS,
    notes: [
      "Rows — your counted submissions this calendar month: the first entry into the stage per contact, credited to the opportunity owner at the time of the event (you); the same events as Program Submissions and your Momentum count.",
      "Stage — where the opportunity sits now (a snapshot).",
      "Commission (est.) — what the submission earns under your plan this month, priced as your invoice lines are: the retro rate once the month reaches the threshold; a dash when your plan pays per won, not per submission. Estimated; the official calculation is done outside this dashboard.",
      "Contact name — opens the contact in GHL in a new tab.",
    ],
    csvName: `${program === "army" ? "Army CA 101" : "Veteran IAU"} submissions ${monthLabel}`,
  });
  return (
    <>
      <div className="me-split-tiles">
        <button type="button" className="me-tile-btn" onClick={() => setOpen(spec("army"))} title="Click for the list of these submissions">
          <div className="me-ov-k">
            <span className="legend-swatch" style={{ background: chartSeries[0] }} /> Army CA 101
          </div>
          <div className="me-tile-n" data-me-split-army={m.split.army}>{n(m.split.army)}</div>
          <div className="me-tile-sub">this month · click for the list</div>
        </button>
        <button type="button" className="me-tile-btn" onClick={() => setOpen(spec("veteran"))} title="Click for the list of these submissions">
          <div className="me-ov-k">
            <span className="legend-swatch" style={{ background: chartSeries[1] }} /> Veteran IAU
          </div>
          <div className="me-tile-n" data-me-split-veteran={m.split.veteran}>{n(m.split.veteran)}</div>
          <div className="me-tile-sub">{semText}</div>
        </button>
      </div>
      {open ? <DrilldownModal spec={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

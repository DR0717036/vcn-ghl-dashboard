// Goal display shared by the KPI cards: a status pill (Met / On Track /
// Missed, or a neutral "Goal not set") computed against the goal scaled to
// the elapsed portion of the selected period, and a one-line goal text.

import { GOAL_STATUS_LABEL, goalStatus, type Goal, type GoalStatus } from "@/lib/goals";
import { fmtMinutes } from "@/lib/metrics";

const PILL: Record<GoalStatus, string> = { met: "pill-ok", on_track: "pill-info", missed: "pill-bad" };

export function StatusPill({ status, title }: { status: GoalStatus | null; title?: string }) {
  if (!status) return null;
  return (
    <span className={`pill ${PILL[status]}`} title={title}>
      {GOAL_STATUS_LABEL[status]}
    </span>
  );
}

const RULE = "Met = at or above the full goal; On Track = at or above the goal for the time elapsed; Missed = below it.";

/** The pill that sits beside the big number. Always renders something so cards line up. */
export function GoalPill({ goal, value }: { goal: Goal | null; value: number | null }) {
  if (!goal) return <span className="pill pill-neutral">Goal not set</span>;
  if (value === null) return <span className="pill pill-neutral" title="No value to judge against the goal.">No status</span>;
  return <StatusPill status={goalStatus(value, goal)} title={`${goal.basis}. ${RULE}`} />;
}

function fmt(v: number, format: "count" | "minutes"): string {
  const r = Math.round(v);
  return format === "minutes" ? fmtMinutes(r) : r.toLocaleString("en-US");
}

/** One line: "Goal 4,200 · 986 expected by now · 12% of goal", or "Goal not set". */
export function GoalText({ goal, value, format = "count" }: { goal: Goal | null; value: number | null; format?: "count" | "minutes" }) {
  if (!goal) return <span className="kpi-muted">Goal not set</span>;
  const pct = value === null || goal.full === 0 ? null : Math.round((value / goal.full) * 100);
  const showScaled = goal.partial && !goal.snapshot && Math.round(goal.scaled) !== Math.round(goal.full);
  const text = `Goal ${fmt(goal.full, format)}${pct !== null ? ` · ${pct}% of goal` : ""}${showScaled ? ` · ${fmt(goal.scaled, format)} by now` : ""}`;
  return <span title={`${text}. ${goal.basis}`}>{text}</span>;
}

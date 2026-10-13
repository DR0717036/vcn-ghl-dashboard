// Goal display shared by the KPI cards: status pill (Met / On Track /
// Missed) computed against the goal scaled to the elapsed portion of the
// selected period, plus the goal numbers and their derivation.

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

function fmt(v: number, format: "count" | "minutes"): string {
  const r = Math.round(v);
  return format === "minutes" ? fmtMinutes(r) : r.toLocaleString("en-US");
}

export default function GoalLine({ goal, value, format = "count" }: { goal: Goal | null; value: number | null; format?: "count" | "minutes" }) {
  if (!goal) return <span>Goal not set</span>;
  const status = value === null ? null : goalStatus(value, goal);
  const pct = value === null || goal.full === 0 ? null : Math.round((value / goal.full) * 100);
  const showScaled = goal.partial && !goal.snapshot && Math.round(goal.scaled) !== Math.round(goal.full);
  return (
    <>
      <StatusPill status={status} title={`${goal.basis}. Met = at or above the full goal; On Track = at or above the goal for the time elapsed; Missed = below it.`} />
      <span title={goal.basis}>
        Goal {fmt(goal.full, format)}
        {showScaled ? ` · ${fmt(goal.scaled, format)} expected by now` : ""}
        {pct !== null ? ` · ${pct}% of goal` : ""}
      </span>
    </>
  );
}

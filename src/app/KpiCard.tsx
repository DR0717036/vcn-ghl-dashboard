import type { ReactNode } from "react";
import { fmtMinutes, type KpiResult } from "@/lib/metrics";
import { GoalPill, GoalText } from "./GoalLine";
import KpiShell, { Delta } from "./KpiShell";

export { Delta } from "./KpiShell";

function fmtValue(k: KpiResult): string {
  if (k.value === null) return "unavailable";
  return k.format === "minutes" ? fmtMinutes(k.value) : k.value.toLocaleString("en-US");
}

export default function KpiCard({ k, chart, className = "" }: { k: KpiResult; chart?: ReactNode; className?: string }) {
  const unavailable = k.value === null;
  const notes: ReactNode[] = [...k.notes];
  if (k.goal) notes.push(`Goal basis: ${k.goal.basis}.`);
  return (
    <KpiShell
      id={k.key}
      className={className}
      title={k.title}
      subtitle={k.subtitle}
      value={
        <>
          <div className={`stat-value${unavailable ? " unavailable" : ""}`}>{fmtValue(k)}</div>
          {unavailable && k.unavailableReason ? <div className="note kpi-reason">{k.unavailableReason}</div> : null}
        </>
      }
      pill={<GoalPill goal={k.goal} value={k.value} />}
      goalLine={<GoalText goal={k.goal} value={k.value} format={k.format} />}
      deltaLine={<Delta value={k.value} prev={k.prev} format={k.format} reason={k.prevUnavailableReason} />}
      chart={chart}
      breakdown={k.breakdown}
      sections={k.sections ?? []}
      notes={notes}
    />
  );
}

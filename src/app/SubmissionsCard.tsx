// Program Submissions (combined): CA 101 submitted + IAU App Submitted (FS2),
// per rep and team total. Carries the combined weekly rep goal. Same card
// anatomy as every other KPI card; the rep table is the card body.

import { repGoalStatus } from "@/lib/goals";
import type { SubmissionsResult } from "@/lib/submissions";
import { GoalPill, GoalText, StatusPill } from "./GoalLine";
import KpiShell, { Delta } from "./KpiShell";

const n = (v: number) => v.toLocaleString("en-US");

export default function SubmissionsCard({ s, className = "" }: { s: SubmissionsResult; className?: string }) {
  const unavailable = s.value === null;
  const g = s.goal;
  const repGoalCol = Boolean(g && g.perRepFull !== null);
  const notes = [...s.notes];
  if (g) notes.push(`Goal basis: ${g.basis}. Each rep is judged against their own share; the team total against all six.`);
  if (s.unmatchedReps.length > 0) notes.push(`Not found among GHL users (check config/sales-reps.json): ${s.unmatchedReps.map((r) => `${r.name} <${r.email}>`).join(", ")}.`);

  const table = !unavailable ? (
    <div className="scroll kpi-body">
      <table className="stat-breakdown rep-table">
        <thead>
          <tr>
            <th>Sales rep</th>
            <th className="num">CA 101</th>
            <th className="num">IAU App (FS2)</th>
            <th className="num">Combined</th>
            {repGoalCol ? <th className="num">Rep goal</th> : null}
            {repGoalCol ? <th className="status">Status</th> : null}
          </tr>
        </thead>
        <tbody>
          {s.rows.map((r) => (
            <tr key={r.userId ?? r.name}>
              <td>{r.name}</td>
              <td className="num">{n(r.ca101)}</td>
              <td className="num">{n(r.fs2)}</td>
              <td className="num">{n(r.total)}</td>
              {repGoalCol && g ? (
                <td className="num">
                  {Math.round(g.perRepFull ?? 0)}
                  {g.partial && !g.snapshot && Math.round(g.perRepScaled ?? 0) !== Math.round(g.perRepFull ?? 0) ? ` (${Math.round(g.perRepScaled ?? 0)} by now)` : ""}
                </td>
              ) : null}
              {repGoalCol && g ? (
                <td className="status">
                  <StatusPill status={repGoalStatus(r.total, g)} />
                </td>
              ) : null}
            </tr>
          ))}
          {s.others ? (
            <tr>
              <td className="note">{s.others.name}</td>
              <td className="num">{n(s.others.ca101)}</td>
              <td className="num">{n(s.others.fs2)}</td>
              <td className="num">{n(s.others.total)}</td>
              {repGoalCol ? <td className="num note">—</td> : null}
              {repGoalCol ? <td className="status note">not a rep</td> : null}
            </tr>
          ) : null}
          <tr className="rep-total">
            <td>Team total</td>
            <td className="num">{n(s.ca101)}</td>
            <td className="num">{n(s.fs2)}</td>
            <td className="num">{n(s.value ?? 0)}</td>
            {repGoalCol && g ? <td className="num">{Math.round(g.full)}</td> : null}
            {repGoalCol ? (
              <td className="status">
                <GoalPill goal={g} value={s.value} />
              </td>
            ) : null}
          </tr>
        </tbody>
      </table>
    </div>
  ) : null;

  return (
    <KpiShell
      id={s.key}
      className={`kpi-title-xl ${className}`.trim()}
      title={s.title}
      subtitle="CA 101 submitted (Army CA) + IAU App Submitted (FS2) (Veteran G.I. Bill) · reached during period · team total"
      value={
        <>
          <div className={`stat-value${unavailable ? " unavailable" : ""}`}>{unavailable ? "unavailable" : n(s.value ?? 0)}</div>
          {unavailable && s.unavailableReason ? <div className="note kpi-reason">{s.unavailableReason}</div> : null}
        </>
      }
      pill={<GoalPill goal={g} value={s.value} />}
      goalLine={<GoalText goal={g} value={s.value} />}
      badges={s.partialHistory ? <span className="pill pill-warn">partial history</span> : null}
      deltaLine={<Delta value={s.value} prev={s.prev} reason={s.prevUnavailableReason} />}
      body={table}
      notes={notes}
    />
  );
}

// Program Submissions (combined): CA 101 submitted + IAU App Submitted (FS2),
// per rep and team total. Carries the combined weekly rep goal. Same card
// anatomy as every other KPI card; the rep table is the card body.
//
// Round 4: count and Opportunity Value side by side at the top (same pair
// layout as the three submission cards), named non-rep rows (e.g. Johnny M)
// after the reps, and a scannable table: fixed narrow number columns next to
// the names, zebra rows, emphasized Combined column, team total pinned last.

import { repGoalStatus } from "@/lib/goals";
import { fmtUsd } from "@/lib/milestones";
import type { SubmissionRow, SubmissionsResult } from "@/lib/submissions";
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

  const numCells = (r: SubmissionRow) => (
    <>
      <td className="num">{n(r.ca101)}</td>
      <td className="num">{n(r.fs2)}</td>
      <td className="num combined">{n(r.total)}</td>
    </>
  );
  const notARep = repGoalCol ? (
    <>
      <td className="num note">—</td>
      <td className="status note">not a rep</td>
    </>
  ) : null;

  const table = !unavailable ? (
    <div className="scroll kpi-body">
      <table className="stat-breakdown rep-table">
        <colgroup>
          <col className="col-name" />
          <col className="col-num" />
          <col className="col-num" />
          <col className="col-num" />
          {repGoalCol ? <col className="col-goal" /> : null}
          {repGoalCol ? <col className="col-status" /> : null}
        </colgroup>
        <thead>
          <tr>
            <th>Sales rep</th>
            <th className="num">CA 101</th>
            <th className="num">IAU App (FS2)</th>
            <th className="num combined">Combined</th>
            {repGoalCol ? <th className="num">Rep goal</th> : null}
            {repGoalCol ? <th className="status">Status</th> : null}
          </tr>
        </thead>
        <tbody>
          {s.rows.map((r) => (
            <tr key={r.userId ?? r.name}>
              <td className="rep-name">{r.name}</td>
              {numCells(r)}
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
          {s.named.map((r) => (
            <tr key={r.userId ?? r.name}>
              <td className="rep-name">{r.name}</td>
              {numCells(r)}
              {notARep}
            </tr>
          ))}
          {s.others ? (
            <tr>
              <td className="note">{s.others.name}</td>
              {numCells(s.others)}
              {notARep}
            </tr>
          ) : null}
          <tr className="rep-total">
            <td className="rep-name">Team total</td>
            <td className="num">{n(s.ca101)}</td>
            <td className="num">{n(s.fs2)}</td>
            <td className="num combined">{n(s.value ?? 0)}</td>
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
        unavailable ? (
          <>
            <div className="stat-value unavailable">unavailable</div>
            {s.unavailableReason ? <div className="note kpi-reason">{s.unavailableReason}</div> : null}
          </>
        ) : (
          <div className="stat-pair">
            <div>
              <div className="stat-value">{n(s.value ?? 0)}</div>
              <div className="note">Contacts</div>
            </div>
            <div>
              <div className="stat-value">{fmtUsd(s.oppValue)}</div>
              <div className="note">Opportunity Value{s.oppValueMissing > 0 ? ` (${n(s.oppValueMissing)} missing)` : ""}</div>
            </div>
          </div>
        )
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

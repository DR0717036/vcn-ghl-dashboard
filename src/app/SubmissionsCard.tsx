// Program Submissions (combined): CA 101 submitted + IAU App Submitted (FS2),
// per rep and team total. Carries the combined weekly rep goal.

import { repGoalStatus } from "@/lib/goals";
import type { SubmissionsResult } from "@/lib/submissions";
import GoalLine, { StatusPill } from "./GoalLine";
import { Delta } from "./KpiCard";

const n = (v: number) => v.toLocaleString("en-US");

export default function SubmissionsCard({ s, className = "" }: { s: SubmissionsResult; className?: string }) {
  const unavailable = s.value === null;
  const g = s.goal;
  const repGoalCol = g && g.perRepFull !== null;
  return (
    <div className={`stat ${className}`.trim()} data-kpi={s.key}>
      <div className="label">{s.title}</div>
      <div className="note">CA 101 submitted (Army CA) + IAU App Submitted (FS2) (Veteran G.I. Bill) · reached during period · team total</div>
      <div className={`stat-value${unavailable ? " unavailable" : ""}`}>{unavailable ? "unavailable" : n(s.value ?? 0)}</div>
      {unavailable && s.unavailableReason ? <div className="note">{s.unavailableReason}</div> : null}
      <div className="stat-meta">
        <GoalLine goal={s.goal} value={s.value} />
        <Delta value={s.value} prev={s.prev} reason={s.prevUnavailableReason} />
        {s.partialHistory ? <span className="pill pill-warn">partial history</span> : null}
      </div>
      {g ? <div className="note">Goal basis: {g.basis}. Each rep is judged against their own share; the team total against all six.</div> : null}
      {!unavailable ? (
        <div className="scroll">
          <table className="stat-breakdown">
            <thead>
              <tr>
                <th>Sales rep</th>
                <th className="num">CA 101</th>
                <th className="num">IAU App (FS2)</th>
                <th className="num">Combined</th>
                {repGoalCol ? <th className="num">Rep goal</th> : null}
                {repGoalCol ? <th>Status</th> : null}
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
                    <td>
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
                  {repGoalCol ? <td className="note">not a rep</td> : null}
                </tr>
              ) : null}
              <tr>
                <td>
                  <b>Team total</b>
                </td>
                <td className="num">{n(s.ca101)}</td>
                <td className="num">{n(s.fs2)}</td>
                <td className="num">
                  <b>{n(s.value ?? 0)}</b>
                </td>
                {repGoalCol && g ? <td className="num">{Math.round(g.full)}</td> : null}
                {repGoalCol && g && s.value !== null ? (
                  <td>
                    <GoalLine goal={g} value={s.value} />
                  </td>
                ) : null}
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
      {s.unmatchedReps.length > 0 ? (
        <div className="note">
          Not found among GHL users (check config/sales-reps.json): {s.unmatchedReps.map((r) => `${r.name} <${r.email}>`).join(", ")}
        </div>
      ) : null}
      <details className="stat-notes">
        <summary className="note">How this is counted</summary>
        <ul className="plain note">
          {s.notes.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// Program Submissions (combined): CA 101 submitted + IAU App Submitted (FS2),
// per rep and team total. Carries the combined weekly rep goal.

import type { SubmissionsResult } from "@/lib/submissions";
import { Delta } from "./KpiCard";

const n = (v: number) => v.toLocaleString("en-US");

export default function SubmissionsCard({ s, className = "" }: { s: SubmissionsResult; className?: string }) {
  const unavailable = s.value === null;
  const goalText = s.goal === null ? "Goal not set" : unavailable || s.goal === 0 ? `Goal ${n(s.goal)}` : `Goal ${n(s.goal)} · ${Math.round(((s.value ?? 0) / s.goal) * 100)}% of goal`;
  return (
    <div className={`stat ${className}`.trim()} data-kpi={s.key}>
      <div className="label">{s.title}</div>
      <div className="note">CA 101 submitted (Army CA) + IAU App Submitted (FS2) (Veteran G.I. Bill) · reached during period · team total</div>
      <div className={`stat-value${unavailable ? " unavailable" : ""}`}>{unavailable ? "unavailable" : n(s.value ?? 0)}</div>
      {unavailable && s.unavailableReason ? <div className="note">{s.unavailableReason}</div> : null}
      <div className="stat-meta">
        <span>{goalText}</span>
        <Delta value={s.value} prev={s.prev} reason={s.prevUnavailableReason} />
        {s.partialHistory ? <span className="pill pill-warn">partial history</span> : null}
      </div>
      {!unavailable ? (
        <div className="scroll">
          <table className="stat-breakdown">
            <thead>
              <tr>
                <th>Sales rep</th>
                <th className="num">CA 101</th>
                <th className="num">IAU App (FS2)</th>
                <th className="num">Combined</th>
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r) => (
                <tr key={r.userId ?? r.name}>
                  <td>{r.name}</td>
                  <td className="num">{n(r.ca101)}</td>
                  <td className="num">{n(r.fs2)}</td>
                  <td className="num">{n(r.total)}</td>
                </tr>
              ))}
              {s.others ? (
                <tr>
                  <td className="note">{s.others.name}</td>
                  <td className="num">{n(s.others.ca101)}</td>
                  <td className="num">{n(s.others.fs2)}</td>
                  <td className="num">{n(s.others.total)}</td>
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

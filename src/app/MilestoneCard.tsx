import Notes from "./Notes";
import { fmtUsd, type MilestoneResult } from "@/lib/milestones";

const n = (v: number) => v.toLocaleString("en-US");

function Delta({ m }: { m: MilestoneResult }) {
  if (m.achieved === null || m.prev === null) return <span className="delta-flat">Comparison unavailable</span>;
  const diff = m.achieved - m.prev;
  const cls = diff > 0 ? "delta-up" : diff < 0 ? "delta-down" : "delta-flat";
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
  const pct = m.prev === 0 ? (diff === 0 ? "0%" : "New") : `${diff >= 0 ? "+" : "−"}${Math.abs(Math.round((diff / m.prev) * 100))}%`;
  return (
    <span className={cls} title={m.prevUnavailableReason ?? `Previous period: ${n(m.prev)}`}>
      {sign}
      {n(Math.abs(diff))} ({pct}) vs prior{m.prevUnavailableReason ? "*" : ""}
    </span>
  );
}

export default function MilestoneCard({ m }: { m: MilestoneResult }) {
  const unavailable = m.achieved === null;
  const goalText =
    m.goal === null
      ? "Goal not set"
      : unavailable || m.goal === 0
        ? `Goal ${n(m.goal)}`
        : `Goal ${n(m.goal)} · ${Math.round(((m.achieved ?? 0) / m.goal) * 100)}% of goal`;
  return (
    <div className="stat" data-milestone={m.key}>
      <div className="label">{m.label}</div>
      <div className="note">
        {m.programLabel} · {m.reportingGroup} · achieved during period
      </div>
      <div className={`stat-value${unavailable ? " unavailable" : ""}`}>{unavailable ? "unavailable" : n(m.achieved ?? 0)}</div>
      {unavailable && m.unavailableReason ? <div className="note">{m.unavailableReason}</div> : null}
      {!unavailable ? (
        <div className="note">
          {n(m.achievedOpps)} {m.achievedOpps === 1 ? "opportunity" : "opportunities"} · {fmtUsd(m.value)} Opportunity Value
          {m.valueMissing > 0 ? ` (${n(m.valueMissing)} missing a value; total incomplete)` : ""}
        </div>
      ) : null}
      <div className="stat-meta">
        <span>{goalText}</span>
        <Delta m={m} />
      </div>
      {m.partialHistory ? <span className="pill pill-warn">partial history</span> : null}
      <table className="stat-breakdown">
        <tbody>
          <tr>
            <td>Currently in stage (snapshot)</td>
            <td className="num">{n(m.currentInStage)}</td>
          </tr>
          <tr>
            <td>Current Opportunity Value{m.currentValueMissing > 0 ? ` (${n(m.currentValueMissing)} missing)` : ""}</td>
            <td className="num">{fmtUsd(m.currentValue)}</td>
          </tr>
          {m.currentWon > 0 ? (
            <tr>
              <td>…of which status = won</td>
              <td className="num">{n(m.currentWon)}</td>
            </tr>
          ) : null}
          {m.currentUnclassified > 0 ? (
            <tr>
              <td>In stage without a {m.reportingGroup} tag (not counted)</td>
              <td className="num">{n(m.currentUnclassified)}</td>
            </tr>
          ) : null}
          {m.unclassified > 0 ? (
            <tr>
              <td>Entered in period, contact has no {m.reportingGroup} tag yet (not counted; counts once the tag is added in GHL)</td>
              <td className="num">{n(m.unclassified)}</td>
            </tr>
          ) : null}
          {m.reps.slice(0, 6).map((r) => (
            <tr key={r.userId ?? "none"}>
              <td>Rep: {r.name}</td>
              <td className="num">
                {n(r.contacts)} · {fmtUsd(r.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className="stat-notes">
        <summary className="note">How this is counted</summary>
        <Notes title={null} notes={[...m.notes, "Rep credit — the opportunity owner at the time of the event, not the current owner."]} />
      </details>
    </div>
  );
}

import { fmtUsd } from "@/lib/milestones";
import Notes from "./Notes";
import type { WonReport, WonView } from "@/lib/won";

const n = (v: number) => v.toLocaleString("en-US");

function Delta({ v }: { v: WonView }) {
  if (v.prev === null) return <span className="delta-flat" title={v.prevUnavailableReason}>Comparison unavailable</span>;
  const diff = v.period.count - v.prev;
  const cls = diff > 0 ? "delta-up" : diff < 0 ? "delta-down" : "delta-flat";
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
  const pct = v.prev === 0 ? (diff === 0 ? "0%" : "New") : `${diff >= 0 ? "+" : "−"}${Math.abs(Math.round((diff / v.prev) * 100))}%`;
  return (
    <span className={cls} title={`Previous period: ${n(v.prev)}`}>
      {sign}
      {n(Math.abs(diff))} ({pct}) vs prior
    </span>
  );
}

function valueLine(t: { value: number; valueMissing: number; zeroValue: number }): string {
  const parts = [`${fmtUsd(t.value)} Won Opportunity Value`];
  if (t.zeroValue > 0) parts.push(`${n(t.zeroValue)} at $0`);
  if (t.valueMissing > 0) parts.push(`${n(t.valueMissing)} missing a value; total incomplete`);
  return parts.join(" · ");
}

function WonCard({ v }: { v: WonView }) {
  const goalText =
    v.goal === null ? "Goal not set" : v.goal === 0 ? `Goal ${n(v.goal)}` : `Goal ${n(v.goal)} · ${Math.round((v.period.count / v.goal) * 100)}% of goal`;
  return (
    <div className="stat" data-won={v.key}>
      <div className="label">{v.title}</div>
      <div className="note">Became Won During Period</div>
      <div className="stat-value">{n(v.period.count)}</div>
      <div className="note">{valueLine(v.period)}</div>
      <div className="stat-meta">
        <span>{goalText}</span>
        <Delta v={v} />
      </div>
      <table className="stat-breakdown">
        <tbody>
          <tr>
            <td>Currently Won (snapshot)</td>
            <td className="num">{n(v.current.count)}</td>
          </tr>
          <tr>
            <td>Current Won Opportunity Value{v.current.valueMissing > 0 ? ` (${n(v.current.valueMissing)} missing)` : ""}</td>
            <td className="num">{fmtUsd(v.current.value)}</td>
          </tr>
          {v.current.zeroValue > 0 ? (
            <tr>
              <td>…of which valued at $0</td>
              <td className="num">{n(v.current.zeroValue)}</td>
            </tr>
          ) : null}
          <tr>
            <td>Reopened / reversed in period (not subtracted)</td>
            <td className="num">{n(v.period.reversals)}</td>
          </tr>
        </tbody>
      </table>
      <div className="note">Scope: {v.scope}</div>
      <details className="stat-notes">
        <summary className="note">How this is counted</summary>
        <Notes title={null} notes={v.notes} />
      </details>
    </div>
  );
}

export default function WonSection({ report }: { report: WonReport }) {
  return (
    <section>
      <h2>Won opportunities</h2>
      <p className="note">
        Won means opportunity status = won. Each card shows production during the range (an event) and the current snapshot. Values are
        Opportunity Value, not cash collected or commission. {report.historyNote}
      </p>
      <div className="grid grid-4">
        {report.views.map((v) => (
          <WonCard key={v.key} v={v} />
        ))}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Veteran G.I. Bill won opportunities by stage</h3>
        <p className="note">
          &quot;Became won&quot; uses the stage the opportunity was in at the won event; &quot;currently won&quot; uses its stage now. The two can
          differ when an opportunity moved after it was won.
        </p>
        {report.veteranByStage.length === 0 ? (
          <p className="note">No won opportunities in this pipeline for the range or snapshot.</p>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Stage</th>
                  <th className="num">Became won in period</th>
                  <th className="num">Value at event</th>
                  <th className="num">Currently won</th>
                  <th className="num">Current value</th>
                </tr>
              </thead>
              <tbody>
                {report.veteranByStage.map((s) => (
                  <tr key={s.stageId}>
                    <td>{s.stageName}</td>
                    <td className="num">{n(s.periodCount)}</td>
                    <td className="num">{fmtUsd(s.periodValue)}</td>
                    <td className="num">{n(s.currentCount)}</td>
                    <td className="num">{fmtUsd(s.currentValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {report.discrepancies.length > 0 ? (
        <div className="callout callout-warn">
          <b>Discrepancies:</b> opportunities sitting in a Won-named stage whose status is not won. They count in the stage snapshot but not in
          any won total.
          <ul className="plain">
            {report.discrepancies.map((d) => (
              <li key={`${d.pipelineName}-${d.stageName}-${d.status}`}>
                {d.pipelineName} · {d.stageName}: {n(d.count)} with status {d.status}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="callout callout-info">No opportunity sits in a Won-named stage with a status other than won.</div>
      )}
    </section>
  );
}

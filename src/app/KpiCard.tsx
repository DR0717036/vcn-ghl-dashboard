import { fmtMinutes, type KpiResult } from "@/lib/metrics";

function fmtValue(k: KpiResult): string {
  if (k.value === null) return "unavailable";
  return k.format === "minutes" ? fmtMinutes(k.value) : k.value.toLocaleString("en-US");
}

function fmtGoal(k: KpiResult): string {
  if (k.goal === null) return "Goal not set";
  const g = k.format === "minutes" ? fmtMinutes(k.goal) : k.goal.toLocaleString("en-US");
  if (k.value === null || k.goal === 0) return `Goal ${g}`;
  return `Goal ${g} · ${Math.round((k.value / k.goal) * 100)}% of goal`;
}

function Delta({ k }: { k: KpiResult }) {
  if (k.value === null) return <span className="delta-flat">Comparison unavailable</span>;
  if (k.prev === null) return <span className="delta-flat" title={k.prevUnavailableReason}>Comparison unavailable</span>;
  const diff = k.value - k.prev;
  const prevText = k.format === "minutes" ? fmtMinutes(k.prev) : k.prev.toLocaleString("en-US");
  const diffText = k.format === "minutes" ? fmtMinutes(Math.abs(diff)) : Math.abs(diff).toLocaleString("en-US");
  const cls = diff > 0 ? "delta-up" : diff < 0 ? "delta-down" : "delta-flat";
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
  const pct = k.prev === 0 ? (diff === 0 ? "0%" : "New") : `${diff >= 0 ? "+" : "−"}${Math.abs(Math.round((diff / k.prev) * 100))}%`;
  return (
    <span className={cls} title={`Previous period: ${prevText}`}>
      {sign}
      {diffText} ({pct}) vs prior
    </span>
  );
}

export default function KpiCard({ k, compact = false }: { k: KpiResult; compact?: boolean }) {
  const unavailable = k.value === null;
  return (
    <div className="stat" data-kpi={k.key}>
      <div className="label">{k.title}</div>
      {k.subtitle ? <div className="note">{k.subtitle}</div> : null}
      <div className={`stat-value${unavailable ? " unavailable" : ""}`}>{fmtValue(k)}</div>
      {unavailable && k.unavailableReason ? <div className="note">{k.unavailableReason}</div> : null}
      <div className="stat-meta">
        <span>{fmtGoal(k)}</span>
        <Delta k={k} />
      </div>
      {!compact && k.breakdown.length > 0 ? (
        <table className="stat-breakdown">
          <tbody>
            {k.breakdown.map((b) => (
              <tr key={b.label}>
                <td>{b.label}</td>
                <td className="num">{b.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {!compact && k.notes.length > 0 ? (
        <details className="stat-notes">
          <summary className="note">How this is counted</summary>
          <ul className="plain note">
            {k.notes.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

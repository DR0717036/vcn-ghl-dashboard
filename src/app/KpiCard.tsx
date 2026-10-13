import type { ReactNode } from "react";
import { fmtMinutes, type KpiResult } from "@/lib/metrics";
import GoalLine from "./GoalLine";

function fmtValue(k: KpiResult): string {
  if (k.value === null) return "unavailable";
  return k.format === "minutes" ? fmtMinutes(k.value) : k.value.toLocaleString("en-US");
}

export function Delta({ value, prev, format = "count", reason }: { value: number | null; prev: number | null; format?: "count" | "minutes" | "usd"; reason?: string }) {
  if (value === null || prev === null) return <span className="delta-flat" title={reason}>Comparison unavailable</span>;
  const diff = value - prev;
  const f = (v: number) =>
    format === "minutes" ? fmtMinutes(v) : format === "usd" ? v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : v.toLocaleString("en-US");
  const cls = diff > 0 ? "delta-up" : diff < 0 ? "delta-down" : "delta-flat";
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
  const pct = prev === 0 ? (diff === 0 ? "0%" : "New") : `${diff >= 0 ? "+" : "−"}${Math.abs(Math.round((diff / prev) * 100))}%`;
  return (
    <span className={cls} title={`Previous period: ${f(prev)}`}>
      {sign}
      {f(Math.abs(diff))} ({pct}) vs prior{reason ? "*" : ""}
    </span>
  );
}

export default function KpiCard({ k, compact = false, chart, className = "" }: { k: KpiResult; compact?: boolean; chart?: ReactNode; className?: string }) {
  const unavailable = k.value === null;
  return (
    <div className={`stat ${className}`.trim()} data-kpi={k.key}>
      <div className="label">{k.title}</div>
      {k.subtitle ? <div className="note">{k.subtitle}</div> : null}
      <div className={`stat-value${unavailable ? " unavailable" : ""}`}>{fmtValue(k)}</div>
      {unavailable && k.unavailableReason ? <div className="note">{k.unavailableReason}</div> : null}
      <div className="stat-meta">
        <GoalLine goal={k.goal} value={k.value} format={k.format} />
        <Delta value={k.value} prev={k.prev} format={k.format} reason={k.prevUnavailableReason} />
      </div>
      {k.goal ? <div className="note">Goal basis: {k.goal.basis}.</div> : null}
      {chart}
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
      {!compact && k.sections
        ? k.sections.map((s) => (
            <table className="stat-breakdown" key={s.title}>
              <thead>
                <tr>
                  <th colSpan={2}>{s.title}</th>
                </tr>
              </thead>
              <tbody>
                {s.rows.map((b) => (
                  <tr key={b.label}>
                    <td>{b.label}</td>
                    <td className="num">{b.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))
        : null}
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

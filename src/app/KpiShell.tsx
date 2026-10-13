// The one card anatomy every Primary KPI card uses, top to bottom:
//   title + one-line subtitle
//   big number row, status pill at the right
//   goal line
//   change-vs-prior line
//   optional chart area at a fixed height
//   "Details" toggle (collapsed): breakdown tables and "How this is counted"
// Everything above the toggle sits at the same vertical position on every
// card, and the toggle is pinned to the bottom, so cards in a row line up.

import type { ReactNode } from "react";
import { fmtMinutes, type Breakdown, type BreakdownSection } from "@/lib/metrics";

export function Delta({ value, prev, format = "count", reason, what }: { value: number | null; prev: number | null; format?: "count" | "minutes" | "usd"; reason?: string; what?: string }) {
  if (value === null || prev === null) {
    return (
      <span className="kpi-muted" title={reason}>
        {what ? `${what}: ` : ""}Comparison unavailable
      </span>
    );
  }
  const diff = value - prev;
  const f = (v: number) =>
    format === "minutes" ? fmtMinutes(v) : format === "usd" ? v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : v.toLocaleString("en-US");
  const cls = diff > 0 ? "delta-up" : diff < 0 ? "delta-down" : "delta-flat";
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
  const pct = prev === 0 ? (diff === 0 ? "0%" : "New") : `${diff >= 0 ? "+" : "−"}${Math.abs(Math.round((diff / prev) * 100))}%`;
  return (
    <span className={cls} title={`Previous period: ${f(prev)}${reason ? `. ${reason}` : ""}`}>
      {what ? `${what} ` : ""}
      {sign}
      {f(Math.abs(diff))} ({pct}) vs prior{reason ? "*" : ""}
    </span>
  );
}

export function BreakdownTable({ rows, title }: { rows: Breakdown[]; title?: string }) {
  if (rows.length === 0) return null;
  return (
    <table className="stat-breakdown">
      {title ? (
        <thead>
          <tr>
            <th colSpan={2}>{title}</th>
          </tr>
        </thead>
      ) : null}
      <tbody>
        {rows.map((b) => (
          <tr key={b.label}>
            <td>{b.label}</td>
            <td className="num">{b.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function KpiShell({
  id,
  title,
  subtitle,
  value,
  pill,
  goalLine,
  deltaLine,
  chart,
  body,
  breakdown = [],
  sections = [],
  notes = [],
  badges,
  className = "",
}: {
  id: string;
  title: string;
  subtitle?: string;
  /** The big number (or a pair of numbers). */
  value: ReactNode;
  pill: ReactNode;
  goalLine: ReactNode;
  deltaLine: ReactNode;
  chart?: ReactNode;
  /** Content that stays visible below the lines (e.g. the submissions table). */
  body?: ReactNode;
  breakdown?: Breakdown[];
  sections?: BreakdownSection[];
  notes?: ReactNode[];
  /** Small pills shown next to the goal line (e.g. "partial history"). */
  badges?: ReactNode;
  className?: string;
}) {
  const hasDetails = breakdown.length > 0 || sections.length > 0 || notes.length > 0;
  return (
    <div className={`stat kpi ${className}`.trim()} data-kpi={id}>
      <div className="kpi-head">
        <div className="label">{title}</div>
        <div className="kpi-sub note" title={subtitle}>
          {subtitle ?? " "}
        </div>
      </div>
      <div className="kpi-value-row">
        <div className="kpi-value">{value}</div>
        <div className="kpi-pill">{pill}</div>
      </div>
      <div className="kpi-line">
        {goalLine}
        {badges}
      </div>
      <div className="kpi-line">{deltaLine}</div>
      {chart ? <div className="kpi-chart">{chart}</div> : null}
      {body}
      {hasDetails ? (
        <details className="kpi-details">
          <summary>Details</summary>
          <div className="kpi-details-body">
            <BreakdownTable rows={breakdown} />
            {sections.map((s) => (
              <BreakdownTable key={s.title} rows={s.rows} title={s.title} />
            ))}
            {notes.length > 0 ? (
              <>
                <div className="label kpi-notes-title">How this is counted</div>
                <ul className="plain note">
                  {notes.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}

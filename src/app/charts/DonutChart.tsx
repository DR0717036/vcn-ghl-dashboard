"use client";

// Small donut with the total in the center and an HTML legend to the right
// (name, count, and an extra text such as a rate). Hover highlights a
// segment and shows a tooltip.

import { useState } from "react";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
  /** Extra legend text, e.g. "7.8%". */
  extra?: string;
}

const n = (v: number) => v.toLocaleString("en-US");

function arc(cx: number, cy: number, r1: number, r2: number, a0: number, a1: number): string {
  // rounded so the server and the browser produce the same path text (their trig differs in the last digit, which React reports as a hydration mismatch)
  const p = (r: number, a: number) => [Math.round((cx + r * Math.cos(a)) * 1000) / 1000, Math.round((cy + r * Math.sin(a)) * 1000) / 1000];
  const [x0, y0] = p(r2, a0);
  const [x1, y1] = p(r2, a1);
  const [x2, y2] = p(r1, a1);
  const [x3, y3] = p(r1, a0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${x0},${y0} A${r2},${r2} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r1},${r1} 0 ${large} 0 ${x3},${y3} Z`;
}

export default function DonutChart({ segments, total, centerLabel, size = 160, emptyText = "No data in range." }: { segments: DonutSegment[]; total: number; centerLabel: string; size?: number; emptyText?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const sum = segments.reduce((s, x) => s + x.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r2 = size / 2 - 2;
  const r1 = r2 - 22;
  let a = -Math.PI / 2;
  const gap = sum > 0 && segments.length > 1 ? 0.03 : 0;
  const check = JSON.stringify({ total, segments: segments.map((s) => ({ label: s.label, value: s.value })) });

  return (
    <div className="donut-wrap" data-check={check}>
      <div className="donut" style={{ width: size, height: size }}>
        {sum === 0 ? (
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="chart" role="img" aria-label={centerLabel}>
            <circle cx={cx} cy={cy} r={(r1 + r2) / 2} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={r2 - r1} />
          </svg>
        ) : (
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="chart" role="img" aria-label={`${centerLabel}: ${segments.map((s) => `${s.label} ${n(s.value)}`).join(", ")}`} onMouseLeave={() => setHover(null)}>
            {segments.map((s, i) => {
              const span = (s.value / sum) * Math.PI * 2;
              const a0 = a + gap / 2;
              const a1 = a + span - gap / 2;
              a += span;
              if (a1 <= a0) return null;
              return <path key={s.label} d={arc(cx, cy, r1, r2, a0, a1)} fill={s.color} opacity={hover !== null && hover !== i ? 0.45 : 1} onMouseEnter={() => setHover(i)}>
                <title>{`${s.label}: ${n(s.value)}${s.extra ? ` · ${s.extra}` : ""}`}</title>
              </path>;
            })}
          </svg>
        )}
        <div className="donut-center">
          <div className="donut-total">{n(total)}</div>
          <div className="donut-label">{centerLabel}</div>
        </div>
      </div>
      <ul className="donut-legend">
        {segments.length === 0 ? <li className="note">{emptyText}</li> : null}
        {segments.map((s, i) => (
          <li key={s.label} className={hover === i ? "is-hover" : ""} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} title={s.label}>
            <span className="legend-swatch" style={{ background: s.color }} />
            <span className="donut-legend-name">{s.label}</span>
            <span className="donut-legend-count">{n(s.value)}</span>
            {s.extra ? <span className="donut-legend-extra">{s.extra}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

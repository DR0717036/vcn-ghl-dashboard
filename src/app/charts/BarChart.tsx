"use client";

// Single-series bar chart over time. Inline SVG, no library. Thin bars with
// rounded data-ends, 2px gaps, recessive grid, hover tooltip, selective
// direct label on the peak. Colors come from the shared tokens.

import { useState } from "react";

export interface BarPoint {
  key: string;
  label: string;
  count: number;
}

export default function BarChart({ points, color = "var(--series-1)", height = 220, unit = "new leads" }: { points: BarPoint[]; color?: string; height?: number; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000;
  const H = height;
  const padL = 40;
  const padR = 12;
  const padT = 20;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = Math.max(1, ...points.map((p) => p.count));
  const niceMax = niceCeil(max);
  const n = Math.max(1, points.length);
  const slot = plotW / n;
  const gap = Math.min(6, Math.max(2, slot * 0.25));
  const barW = Math.max(2, slot - gap);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(niceMax * f));
  const peak = points.reduce((best, p, i) => (p.count > (points[best]?.count ?? -1) ? i : best), 0);
  const labelEvery = Math.max(1, Math.ceil(n / 12));

  const y = (v: number) => padT + plotH - (v / niceMax) * plotH;

  if (points.length === 0) return <p className="note">No days in range.</p>;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`${unit} per period`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="chart-tick">
              {t.toLocaleString("en-US")}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = padL + i * slot + gap / 2;
          const h = Math.max(p.count > 0 ? 2 : 0, (p.count / niceMax) * plotH);
          const top = padT + plotH - h;
          const active = hover === i;
          return (
            <g key={p.key} onMouseEnter={() => setHover(i)}>
              <rect x={padL + i * slot} y={padT} width={slot} height={plotH} fill="transparent" />
              {h > 0 ? (
                <path
                  d={roundedTop(x, top, barW, h, Math.min(4, barW / 2))}
                  fill={color}
                  opacity={hover === null || active ? 1 : 0.45}
                  stroke={active ? "var(--surface-card)" : "none"}
                  strokeWidth={active ? 2 : 0}
                />
              ) : null}
              {i === peak && p.count > 0 && hover === null ? (
                <text x={x + barW / 2} y={top - 6} textAnchor="middle" className="chart-label-strong">
                  {p.count.toLocaleString("en-US")}
                </text>
              ) : null}
              {i % labelEvery === 0 ? (
                <text x={x + barW / 2} y={H - padB + 18} textAnchor="middle" className="chart-tick">
                  {p.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {hover !== null ? (
          <g pointerEvents="none">
            <line x1={padL + hover * slot + slot / 2} x2={padL + hover * slot + slot / 2} y1={padT} y2={padT + plotH} stroke="var(--chart-axis)" strokeDasharray="3 3" />
            {(() => {
              const p = points[hover];
              const tx = Math.min(W - padR - 160, Math.max(padL, padL + hover * slot + slot / 2 - 80));
              return (
                <g transform={`translate(${tx}, ${padT})`}>
                  <rect width={160} height={44} rx={6} fill="var(--surface-raised)" stroke="var(--border)" />
                  <text x={10} y={18} className="chart-tooltip-title">
                    {p.label}
                  </text>
                  <text x={10} y={36} className="chart-tooltip-value">
                    {p.count.toLocaleString("en-US")} {unit}
                  </text>
                </g>
              );
            })()}
          </g>
        ) : null}
      </svg>
    </div>
  );
}

function niceCeil(v: number): number {
  if (v <= 5) return 5;
  const mag = 10 ** Math.floor(Math.log10(v));
  const norm = v / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

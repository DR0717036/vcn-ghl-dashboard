"use client";

// Multi-series line chart over time. Inline SVG, no library, drawn at the
// container's measured width and a FIXED pixel height so text never
// stretches. Supports a muted prior-period overlay (aligned by position)
// and, when the owner asks for it, a second measure on a right-hand axis.
// 2.5px smooth monotone lines (never overshooting between points), small
// hollow markers, >=8px hit targets, recessive grid, crosshair tooltip across
// all series, legend in HTML above the plot. Colors come from the shared tokens.

import { useState } from "react";
import { useWidth } from "./useWidth";

export type ValueFormat = "count" | "minutes" | "usd";

export interface LinePoint {
  label: string;
  value: number;
}

export interface LineSeries {
  label: string;
  color: string;
  points: LinePoint[];
  axis?: "left" | "right";
  format?: ValueFormat;
  /** Prior-period style: thinner, dashed, no markers. */
  muted?: boolean;
}

export function fmtValue(v: number, f: ValueFormat): string {
  if (f === "usd") return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  if (f === "minutes") {
    const h = Math.floor(v / 60);
    const m = Math.round(v % 60);
    return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  }
  return v.toLocaleString("en-US");
}

function fmtTick(v: number, f: ValueFormat): string {
  if (f === "usd") return v >= 1000 ? `$${(v / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}K` : `$${v}`;
  if (f === "minutes") return v >= 60 ? `${(v / 60).toLocaleString("en-US", { maximumFractionDigits: 1 })}h` : `${v}m`;
  return v.toLocaleString("en-US");
}

/**
 * Smooth path through the points using monotone cubic (Fritsch–Carlson)
 * interpolation: the curve never overshoots between points and never dips
 * below the lower of two neighbours, so a series that is >= 0 stays >= 0.
 */
export function monotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0].x},${pts[0].y}`;
  const dx: number[] = [];
  const dy: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    dy.push(pts[i + 1].y - pts[i].y);
    m.push(dx[i] === 0 ? 0 : dy[i] / dx[i]);
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      t[i] = tau * a * m[i];
      t[i + 1] = tau * b * m[i];
    }
  }
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i].x + h},${pts[i].y + h * t[i]} ${pts[i + 1].x - h},${pts[i + 1].y - h * t[i + 1]} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return d;
}

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  if (v <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(v));
  const norm = v / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 4 ? 4 : norm <= 5 ? 5 : 10;
  return step * mag;
}

export default function LineChart({
  series,
  height = 200,
  leftLabel,
  rightLabel,
}: {
  series: LineSeries[];
  height?: number;
  leftLabel?: string;
  rightLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [wrapRef, W] = useWidth<HTMLDivElement>();
  const n = Math.max(1, ...series.map((s) => s.points.length));
  const hasRight = series.some((s) => s.axis === "right");
  const H = height;
  const padL = leftLabel ? 62 : 48;
  const padR = hasRight ? (rightLabel ? 66 : 52) : 14;
  const padT = 12;
  const padB = 30;
  const plotW = Math.max(10, W - padL - padR);
  const plotH = H - padT - padB;
  const x = (i: number) => (n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW);

  const leftMax = niceCeil(Math.max(0, ...series.filter((s) => s.axis !== "right").flatMap((s) => s.points.map((p) => p.value))));
  const rightMax = niceCeil(Math.max(0, ...series.filter((s) => s.axis === "right").flatMap((s) => s.points.map((p) => p.value))));
  const yFor = (s: LineSeries) => (v: number) => padT + plotH - (v / (s.axis === "right" ? rightMax : leftMax)) * plotH;
  const leftFmt = series.find((s) => s.axis !== "right")?.format ?? "count";
  const rightFmt = series.find((s) => s.axis === "right")?.format ?? "count";
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const primary = series.find((s) => !s.muted) ?? series[0];
  const labels = primary?.points.map((p) => p.label) ?? [];
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 70))));
  const showMarkers = n <= 40 && plotW / n >= 12;

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.label} className="legend">
            <span className={`legend-swatch${s.muted ? " legend-swatch-line" : ""}`} style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
      {!primary || primary.points.length === 0 ? (
        <p className="note">No data points in range.</p>
      ) : (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={series.map((s) => s.label).join(" and ")} onMouseLeave={() => setHover(null)}>
          {ticks.map((f) => {
            const yy = padT + plotH - f * plotH;
            return (
              <g key={f}>
                <line x1={padL} x2={W - padR} y1={yy} y2={yy} stroke="var(--chart-grid)" strokeWidth={1} />
                <text x={padL - 8} y={yy + 4} textAnchor="end" className="chart-tick">
                  {fmtTick(Math.round(leftMax * f * 100) / 100, leftFmt)}
                </text>
                {hasRight ? (
                  <text x={W - padR + 8} y={yy + 4} className="chart-tick">
                    {fmtTick(Math.round(rightMax * f * 100) / 100, rightFmt)}
                  </text>
                ) : null}
              </g>
            );
          })}
          {leftLabel ? (
            <text transform={`translate(11, ${padT + plotH / 2}) rotate(-90)`} textAnchor="middle" className="chart-tick">
              {leftLabel}
            </text>
          ) : null}
          {hasRight && rightLabel ? (
            <text transform={`translate(${W - 9}, ${padT + plotH / 2}) rotate(90)`} textAnchor="middle" className="chart-tick">
              {rightLabel}
            </text>
          ) : null}
          {labels.map((l, i) =>
            i % labelEvery === 0 ? (
              <text key={i} x={x(i)} y={H - padB + 18} textAnchor="middle" className="chart-tick">
                {l}
              </text>
            ) : null,
          )}
          {series.map((s) => {
            const y = yFor(s);
            const d = monotonePath(s.points.map((p, i) => ({ x: x(i), y: y(p.value) })));
            return (
              <g key={s.label}>
                <path
                  d={d}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.muted ? 1.5 : 2.5}
                  strokeDasharray={s.muted ? "5 4" : undefined}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={s.muted ? 0.9 : 1}
                />
                {showMarkers && !s.muted
                  ? s.points.map((p, i) => (
                      <circle key={i} cx={x(i)} cy={y(p.value)} r={hover === i ? 5 : 3.5} fill="var(--surface-card)" stroke={s.color} strokeWidth={2} />
                    ))
                  : null}
              </g>
            );
          })}
          {Array.from({ length: n }, (_, i) => {
            const left = i === 0 ? padL : (x(i - 1) + x(i)) / 2;
            const right = i === n - 1 ? W - padR : (x(i) + x(i + 1)) / 2;
            return <rect key={i} x={left} y={padT} width={Math.max(1, right - left)} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />;
          })}
          {hover !== null ? (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} stroke="var(--chart-axis)" strokeDasharray="3 3" />
              {(() => {
                const rows = series.map((s) => ({ s, p: s.points[hover] })).filter((r) => r.p);
                const boxW = Math.min(240, Math.max(150, plotW * 0.6));
                const boxH = 22 + rows.length * 18;
                const tx = Math.min(W - padR - boxW, Math.max(padL, x(hover) - boxW / 2));
                return (
                  <g transform={`translate(${tx}, ${padT})`}>
                    <rect width={boxW} height={boxH} rx={6} fill="var(--surface-raised)" stroke="var(--border)" />
                    <text x={10} y={16} className="chart-tooltip-title">
                      {labels[hover]}
                    </text>
                    {rows.map((r, j) => (
                      <text key={r.s.label} x={10} y={34 + j * 18} className="chart-tooltip-value">
                        <tspan fill={r.s.color}>●</tspan> {r.s.muted ? "prior" : r.s.label.split(" per ")[0]}
                        {r.s.muted && r.p.label !== labels[hover] ? ` (${r.p.label})` : ""}: {fmtValue(r.p.value, r.s.format ?? "count")}
                      </text>
                    ))}
                  </g>
                );
              })()}
            </g>
          ) : null}
        </svg>
      )}
    </div>
  );
}

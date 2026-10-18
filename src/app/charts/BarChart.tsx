"use client";

// Bar chart over time with an optional second, muted series (the prior
// period, aligned by position) drawn beside each bar. Inline SVG, no
// library, drawn at the container's measured width and a FIXED pixel height.
// Thin bars with rounded data-ends, 2px gaps, recessive grid, hover tooltip,
// selective direct label on the peak. Colors come from the shared tokens.

import { useState } from "react";
import ChartTooltip, { type TipPos } from "./ChartTooltip";
import { fmtValue, type ValueFormat } from "./LineChart";
import { useWidth } from "./useWidth";

export interface BarPoint {
  key: string;
  label: string;
  count: number;
}

export default function BarChart({
  points,
  prior,
  priorLabel = "prior period",
  color = "var(--series-1)",
  priorColor = "var(--series-prior)",
  height = 200,
  unit = "new leads",
  format = "count",
}: {
  points: BarPoint[];
  prior?: BarPoint[] | null;
  priorLabel?: string;
  color?: string;
  priorColor?: string;
  height?: number;
  unit?: string;
  format?: ValueFormat;
}) {
  const [hoverPos, setHoverPos] = useState<({ i: number } & TipPos) | null>(null);
  const hover = hoverPos?.i ?? null;
  const [wrapRef, W] = useWidth<HTMLDivElement>();
  const H = height;
  const padL = 52;
  const padR = 12;
  const padT = 18;
  const padB = 30;
  const plotW = Math.max(10, W - padL - padR);
  const plotH = H - padT - padB;
  const hasPrior = Boolean(prior && prior.length > 0);
  const max = Math.max(1, ...points.map((p) => p.count), ...(prior ?? []).map((p) => p.count));
  const niceMax = niceCeil(max);
  const n = Math.max(1, points.length);
  const slot = plotW / n;
  const gap = Math.min(10, Math.max(2, slot * 0.3));
  const groupW = Math.max(2, slot - gap);
  const barW = hasPrior ? Math.max(1.5, (groupW - 2) / 2) : groupW;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(niceMax * f));
  const peak = points.reduce((best, p, i) => (p.count > (points[best]?.count ?? -1) ? i : best), 0);
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 70))));

  const y = (v: number) => padT + plotH - (v / niceMax) * plotH;
  const fmt = (v: number) => fmtValue(v, format);

  return (
    <div className="chart-wrap anim-root" ref={wrapRef}>
      <div className="chart-legend">
        <span className="legend">
          <span className="legend-swatch" style={{ background: color }} /> {unit}
        </span>
        {hasPrior ? (
          <span className="legend">
            <span className="legend-swatch" style={{ background: priorColor }} /> {priorLabel}
          </span>
        ) : null}
      </div>
      {points.length === 0 ? (
        <p className="note">No periods in range.</p>
      ) : (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`${unit} per period`} onMouseLeave={() => setHoverPos(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="chart-tick">
                {format === "count" ? t.toLocaleString("en-US") : fmt(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const x0 = padL + i * slot + gap / 2;
            const h = Math.max(p.count > 0 ? 2 : 0, (p.count / niceMax) * plotH);
            const top = padT + plotH - h;
            const pr = prior?.[i];
            const ph = pr ? Math.max(pr.count > 0 ? 2 : 0, (pr.count / niceMax) * plotH) : 0;
            const active = hover === i;
            const dim = hover !== null && !active;
            return (
              <g key={p.key} onMouseMove={(e) => setHoverPos({ i, clientX: e.clientX, clientY: e.clientY })}>
                <rect x={padL + i * slot} y={padT} width={slot} height={plotH} fill="transparent" />
                {h > 0 ? <path d={roundedTop(x0, top, barW, h, Math.min(4, barW / 2))} fill={color} opacity={dim ? 0.45 : 1} className="bar-v" style={{ "--i": Math.min(i, 12) } as React.CSSProperties} /> : null}
                {hasPrior && ph > 0 ? (
                  <path d={roundedTop(x0 + barW + 2, padT + plotH - ph, barW, ph, Math.min(4, barW / 2))} fill={priorColor} opacity={dim ? 0.35 : 0.85} className="bar-v" style={{ "--i": Math.min(i, 12) } as React.CSSProperties} />
                ) : null}
                {i === peak && p.count > 0 && hover === null ? (
                  <text x={x0 + barW / 2} y={top - 5} textAnchor="middle" className="chart-label-strong">
                    {fmt(p.count)}
                  </text>
                ) : null}
                {i % labelEvery === 0 ? (
                  <text x={x0 + groupW / 2} y={H - padB + 18} textAnchor={x0 + groupW / 2 > W - 28 ? "end" : x0 + groupW / 2 < 28 ? "start" : "middle"} className="chart-tick">
                    {p.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      )}
      <ChartTooltip pos={hoverPos} width={220}>
        {hover !== null ? (
          <>
            <div className="chart-tip-title">{points[hover].label}</div>
            <div>
              <span className="legend-swatch" style={{ background: color }} /> <b>{fmt(points[hover].count)}</b> {unit.split(" per ")[0]}
            </div>
            {prior?.[hover] ? (
              <div>
                <span className="legend-swatch" style={{ background: priorColor }} /> prior ({prior[hover].label}): <b>{fmt(prior[hover].count)}</b>
              </div>
            ) : null}
          </>
        ) : null}
      </ChartTooltip>
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

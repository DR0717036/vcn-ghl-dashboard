"use client";

// A few vertical bars (e.g. Army FY27 vs Veteran FS2) with a value label and
// a count label above each bar, a baseline, and a portal tooltip. Fixed
// height so it lines up with the other card charts; no dead space.

import { useState } from "react";
import ChartTooltip, { type TipPos } from "./ChartTooltip";
import { useWidth } from "./useWidth";

export interface VBar {
  label: string;
  value: number;
  color: string;
  /** Formatted value shown above the bar (e.g. "$17,850"). */
  text: string;
  /** Second label line above the bar (e.g. "12 won"). */
  sub?: string;
  /** Extra tooltip line. */
  detail?: string;
}

export default function VBarChart({ bars, height = 236, emptyText = "No data." }: { bars: VBar[]; height?: number; emptyText?: string }) {
  const [wrapRef, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<({ i: number } & TipPos) | null>(null);
  const padT = 48; // two label lines above the tallest bar
  const padB = 28; // bar names
  const padX = 24;
  const plotH = Math.max(10, height - padT - padB);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const slot = Math.max(10, (W - padX * 2) / Math.max(1, bars.length));
  const barW = Math.max(16, Math.min(140, slot * 0.5));
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const check = JSON.stringify(bars.map((b) => ({ label: b.label, value: b.value })));

  return (
    <div className="chart-wrap chart-rel" ref={wrapRef} data-check={check} onMouseLeave={() => setHover(null)}>
      {bars.length === 0 ? (
        <p className="note">{emptyText}</p>
      ) : (
        <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} className="chart" role="img" aria-label={bars.map((b) => `${b.label} ${b.text}${b.sub ? ` ${b.sub}` : ""}`).join(", ")}>
          <line x1={padX} x2={W - padX} y1={padT + plotH} y2={padT + plotH} stroke="var(--chart-grid)" strokeWidth={1} />
          {bars.map((b, i) => {
            const cx = padX + i * slot + slot / 2;
            const top = y(b.value);
            const h = Math.max(b.value > 0 ? 2 : 0, padT + plotH - top);
            return (
              <g key={b.label} onMouseMove={(e) => setHover({ i, clientX: e.clientX, clientY: e.clientY })}>
                <rect x={padX + i * slot} y={0} width={slot} height={height} fill={hover?.i === i ? "rgba(22,119,255,0.06)" : "transparent"} />
                <rect x={cx - barW / 2} y={padT + plotH - h} width={barW} height={h} rx={4} fill={b.color} opacity={hover && hover.i !== i ? 0.55 : 1} />
                <text x={cx} y={padT + plotH - h - 24} textAnchor="middle" className="chart-label-strong">
                  {b.text}
                </text>
                {b.sub ? (
                  <text x={cx} y={padT + plotH - h - 8} textAnchor="middle" className="chart-tick">
                    {b.sub}
                  </text>
                ) : null}
                <text x={cx} y={height - 8} textAnchor="middle" className="chart-row-label">
                  {b.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      <ChartTooltip pos={hover} width={220}>
        {hover ? (
          <>
            <div className="chart-tip-title">{bars[hover.i].label}</div>
            <div>
              <span className="legend-swatch" style={{ background: bars[hover.i].color }} /> <b>{bars[hover.i].text}</b>
              {bars[hover.i].sub ? ` · ${bars[hover.i].sub}` : ""}
            </div>
            {bars[hover.i].detail ? <div>{bars[hover.i].detail}</div> : null}
          </>
        ) : null}
      </ChartTooltip>
    </div>
  );
}

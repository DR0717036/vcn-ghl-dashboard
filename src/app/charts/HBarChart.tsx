"use client";

// Horizontal bars with a value label at the end of each bar, an optional
// dashed reference line, and a hover tooltip. Fixed height, measured width.

import { useState } from "react";
import { useWidth } from "./useWidth";

export interface HBarRow {
  label: string;
  value: number;
  color: string;
  /** Formatted value shown at the end of the bar and in the tooltip. */
  text: string;
  /** Extra tooltip line. */
  detail?: string;
}

export default function HBarChart({ rows, height = 220, line, lineLabel, maxValue, emptyText = "No data in range." }: { rows: HBarRow[]; height?: number; line?: number; lineLabel?: string; maxValue?: number; emptyText?: string }) {
  const [wrapRef, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const max = Math.max(1, maxValue ?? 0, ...rows.map((r) => r.value), line ?? 0);
  const padL = 130;
  const padR = 90;
  const padT = line !== undefined ? 16 : 4;
  const plotW = Math.max(10, W - padL - padR);
  const rowH = Math.min(30, (height - padT - 6) / Math.max(1, rows.length));
  const barH = Math.max(8, rowH - 8);
  const x = (v: number) => padL + (v / max) * plotW;
  const check = JSON.stringify(rows.map((r) => ({ label: r.label, value: Math.round(r.value * 100) / 100 })));

  return (
    <div className="chart-wrap chart-rel" ref={wrapRef} data-check={check} onMouseLeave={() => setHover(null)}>
      {rows.length === 0 ? (
        <p className="note">{emptyText}</p>
      ) : (
        <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} className="chart" role="img" aria-label={rows.map((r) => `${r.label} ${r.text}`).join(", ")}>
          {line !== undefined && line <= max ? (
            <g>
              <line x1={x(line)} x2={x(line)} y1={padT - 2} y2={padT + rows.length * rowH} stroke="var(--chart-axis)" strokeDasharray="4 4" />
              <text x={x(line)} y={padT - 5} textAnchor="middle" className="chart-tick">
                {lineLabel ?? String(line)}
              </text>
            </g>
          ) : null}
          {rows.map((r, i) => {
            const y = padT + i * rowH;
            return (
              <g key={r.label} onMouseMove={(e) => setHover({ i, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}>
                <text x={padL - 10} y={y + barH / 2 + 4} textAnchor="end" className="chart-row-label">
                  {r.label}
                </text>
                <rect x={padL} y={y} width={plotW} height={barH} rx={4} fill="rgba(255,255,255,0.05)" />
                <rect x={padL} y={y} width={Math.max(2, x(r.value) - padL)} height={barH} rx={4} fill={r.color} opacity={hover && hover.i !== i ? 0.55 : 1} />
                <text x={x(r.value) + 8} y={y + barH / 2 + 4} className="chart-label-strong">
                  {r.text}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {hover ? (
        <div className="chart-tip" style={{ left: Math.min(hover.x + 12, Math.max(0, W - 240)), top: hover.y + 10 }}>
          <div className="chart-tip-title">{rows[hover.i].label}</div>
          <div>
            <b>{rows[hover.i].text}</b>
          </div>
          {rows[hover.i].detail ? <div>{rows[hover.i].detail}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

"use client";

// Horizontal stacked bars, one per row, drawn at the measured width and a
// fixed height. Each row can carry a thin goal marker. The label and total
// sit at the end of the bar. Hover shows an HTML tooltip with every segment.

import { useState } from "react";
import ChartTooltip, { type TipPos } from "./ChartTooltip";
import { useWidth } from "./useWidth";

export interface StackSegment {
  label: string;
  value: number;
  color: string;
}

export interface StackRow {
  label: string;
  segments: StackSegment[];
  /** A thin vertical marker at this value (e.g. the row's goal). */
  marker?: number | null;
  markerLabel?: string;
}

const n = (v: number) => v.toLocaleString("en-US");

export default function StackedBarChart({ rows, height = 220, legend, emptyText = "No data in range." }: { rows: StackRow[]; height?: number; legend: StackSegment[]; emptyText?: string }) {
  const [wrapRef, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<({ i: number } & TipPos) | null>(null);
  const totals = rows.map((r) => r.segments.reduce((s, x) => s + x.value, 0));
  const max = Math.max(1, ...totals, ...rows.map((r) => r.marker ?? 0));
  const legendH = 24;
  const padL = 8;
  const padR = 170; // room for "name · total" after the bar
  const plotW = Math.max(10, W - padL - padR);
  const H = height;
  const rowH = Math.min(30, (H - legendH - 6) / Math.max(1, rows.length));
  const barH = Math.max(8, rowH - 8);
  const x = (v: number) => padL + (v / max) * plotW;
  const check = JSON.stringify(rows.map((r) => ({ label: r.label, values: r.segments.map((s) => s.value), marker: r.marker ?? null })));

  return (
    <div className="chart-wrap chart-rel" ref={wrapRef} data-check={check} onMouseLeave={() => setHover(null)}>
      <div className="chart-legend">
        {legend.map((s) => (
          <span key={s.label} className="legend">
            <span className="legend-swatch" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
        {rows.some((r) => r.marker !== null && r.marker !== undefined) ? (
          <span className="legend">
            <span className="legend-swatch legend-marker" /> goal by now (pro-rated)
          </span>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="note">{emptyText}</p>
      ) : (
        <svg width={W} height={H - legendH} viewBox={`0 0 ${W} ${H - legendH}`} className="chart" role="img" aria-label="Submissions per rep, stacked by program">
          {rows.map((r, i) => {
            const y = 4 + i * rowH;
            let cursor = 0;
            return (
              <g key={r.label} onMouseMove={(e) => setHover({ i, clientX: e.clientX, clientY: e.clientY })}>
                <rect x={padL} y={y} width={plotW} height={barH} rx={4} fill="rgba(255,255,255,0.05)" />
                {r.segments.map((s) => {
                  const x0 = x(cursor);
                  const w = Math.max(0, x(cursor + s.value) - x0);
                  cursor += s.value;
                  return w > 0 ? <rect key={s.label} x={x0} y={y} width={Math.max(w - 1, 1)} height={barH} rx={3} fill={s.color} opacity={hover && hover.i !== i ? 0.55 : 1} /> : null;
                })}
                {r.marker !== null && r.marker !== undefined ? <line x1={x(r.marker)} x2={x(r.marker)} y1={y - 3} y2={y + barH + 3} stroke="var(--accent-yellow)" strokeWidth={2} /> : null}
                <text x={x(totals[i]) + 8} y={y + barH / 2 + 4} className="chart-row-label">
                  {r.label} · {n(totals[i])}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      <ChartTooltip pos={hover} width={240}>
        {hover ? (
          <>
          <div className="chart-tip-title">{rows[hover.i].label}</div>
          {rows[hover.i].segments.map((s) => (
            <div key={s.label}>
              <span className="legend-swatch" style={{ background: s.color }} /> {s.label}: <b>{n(s.value)}</b>
            </div>
          ))}
          <div>
            Combined: <b>{n(totals[hover.i])}</b>
            {rows[hover.i].marker !== null && rows[hover.i].marker !== undefined ? ` · ${rows[hover.i].markerLabel ?? "goal"} ${n(Math.round(rows[hover.i].marker as number))}` : ""}
          </div>
          </>
        ) : null}
      </ChartTooltip>
    </div>
  );
}

"use client";

// Horizontal funnel with two series per step (e.g. Army and Veteran): one
// row per step, two thin bars side by side, value labels at the bar ends,
// a legend above, and a hover tooltip. Fixed height, measured width. Used by
// the Appointment → Outcome card; the series colors follow the programs
// and never swap.

import { useState } from "react";
import ChartTooltip, { type TipPos } from "./ChartTooltip";
import { useWidth } from "./useWidth";

export interface PairedRow {
  label: string;
  a: number;
  b: number;
  /** Extra text under each value in the tooltip, e.g. "27% of cohort". */
  aDetail?: string;
  bDetail?: string;
  /** Side-branch rows (e.g. Lost) are drawn with a muted label and hatched bars. */
  muted?: boolean;
}

const n = (v: number) => v.toLocaleString("en-US");

export default function PairedHBarChart({
  rows,
  seriesA,
  seriesB,
  height = 220,
  emptyText = "No data in range.",
}: {
  rows: PairedRow[];
  seriesA: { label: string; color: string };
  seriesB: { label: string; color: string };
  height?: number;
  emptyText?: string;
}) {
  const [wrapRef, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<({ i: number } & TipPos) | null>(null);
  const legendH = 24;
  const padL = 150;
  const padR = 56;
  const padT = 6;
  const H = height - legendH;
  const plotW = Math.max(10, W - padL - padR);
  const max = Math.max(1, ...rows.flatMap((r) => [r.a, r.b])) / 0.85;
  const rowH = Math.min(44, (H - padT - 4) / Math.max(1, rows.length));
  const barH = Math.max(6, Math.min(12, (rowH - 10) / 2));
  const x = (v: number) => padL + (v / max) * plotW;
  const check = JSON.stringify(rows.map((r) => ({ label: r.label, a: r.a, b: r.b })));

  return (
    <div className="chart-wrap chart-rel anim-root" ref={wrapRef} data-check={check} onMouseLeave={() => setHover(null)}>
      <div className="chart-legend">
        <span className="legend">
          <span className="legend-swatch" style={{ background: seriesA.color }} /> {seriesA.label}
        </span>
        <span className="legend">
          <span className="legend-swatch" style={{ background: seriesB.color }} /> {seriesB.label}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="note">{emptyText}</p>
      ) : (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={rows.map((r) => `${r.label}: ${seriesA.label} ${n(r.a)}, ${seriesB.label} ${n(r.b)}`).join("; ")}>
          <defs>
            <pattern id="paired-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0,0,0,0.25)" strokeWidth="2" />
            </pattern>
          </defs>
          {rows.map((r, i) => {
            const y = padT + i * rowH;
            const yA = y + (rowH - (2 * barH + 2)) / 2;
            const yB = yA + barH + 2;
            const dim = hover && hover.i !== i ? 0.55 : 1;
            return (
              <g key={r.label} onMouseMove={(e) => setHover({ i, clientX: e.clientX, clientY: e.clientY })}>
                <rect x={0} y={y} width={W} height={rowH} fill={hover?.i === i ? "rgba(22,119,255,0.06)" : "transparent"} />
                <text x={padL - 10} y={y + rowH / 2 + 4} textAnchor="end" className={`chart-row-label${r.muted ? " muted" : ""}`}>
                  {r.label.length > 24 ? r.label.slice(0, 23) + "…" : r.label}
                </text>
                <rect x={padL} y={yA} width={Math.max(r.a > 0 ? 2 : 0, x(r.a) - padL)} height={barH} rx={3} fill={seriesA.color} opacity={dim} className="bar-h" style={{ "--i": i * 2 } as React.CSSProperties} />
                {r.muted && r.a > 0 ? <rect x={padL} y={yA} width={Math.max(2, x(r.a) - padL)} height={barH} rx={3} fill="url(#paired-hatch)" opacity={dim} /> : null}
                <text x={x(r.a) + 6} y={yA + barH / 2 + 3.5} className="chart-tick chart-value">
                  {n(r.a)}
                </text>
                <rect x={padL} y={yB} width={Math.max(r.b > 0 ? 2 : 0, x(r.b) - padL)} height={barH} rx={3} fill={seriesB.color} opacity={dim} className="bar-h" style={{ "--i": i * 2 + 1 } as React.CSSProperties} />
                {r.muted && r.b > 0 ? <rect x={padL} y={yB} width={Math.max(2, x(r.b) - padL)} height={barH} rx={3} fill="url(#paired-hatch)" opacity={dim} /> : null}
                <text x={x(r.b) + 6} y={yB + barH / 2 + 3.5} className="chart-tick chart-value">
                  {n(r.b)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      <ChartTooltip pos={hover} width={230}>
        {hover ? (
          <>
            <div className="chart-tip-title">{rows[hover.i].label}</div>
            <div>
              <span className="legend-swatch" style={{ background: seriesA.color }} /> {seriesA.label}: <b>{n(rows[hover.i].a)}</b>
              {rows[hover.i].aDetail ? ` · ${rows[hover.i].aDetail}` : ""}
            </div>
            <div>
              <span className="legend-swatch" style={{ background: seriesB.color }} /> {seriesB.label}: <b>{n(rows[hover.i].b)}</b>
              {rows[hover.i].bDetail ? ` · ${rows[hover.i].bDetail}` : ""}
            </div>
          </>
        ) : null}
      </ChartTooltip>
    </div>
  );
}

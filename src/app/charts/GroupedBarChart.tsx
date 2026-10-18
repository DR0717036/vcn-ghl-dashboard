"use client";

// Vertical grouped bars: one group per category, several bars side by side.
// Value labels above bars, category names below (abbreviated when the group
// is narrow), an optional short horizontal tick per group (e.g. a goal), a
// y axis from 0 with integer ticks, and an HTML tooltip kept inside the
// chart box. Fixed height, measured width.

import { useState } from "react";
import ChartTooltip, { type TipPos } from "./ChartTooltip";
import { useWidth } from "./useWidth";

export interface GroupBar {
  label: string;
  value: number;
  color: string;
}

export interface BarGroup {
  label: string;
  bars: GroupBar[];
  /** A short horizontal tick across the group at this value (e.g. the goal). */
  tick?: number | null;
  tickLabel?: string;
}

const n = (v: number) => v.toLocaleString("en-US");

function niceStep(max: number): number {
  if (max <= 5) return 1;
  if (max <= 10) return 2;
  if (max <= 25) return 5;
  if (max <= 50) return 10;
  if (max <= 100) return 20;
  if (max <= 250) return 50;
  return 100;
}

/** "Isabela Estrada" → "Isabela E." when the slot is narrow. */
function shorten(label: string, slot: number): string {
  if (slot >= 110 || label.length <= 12) return label;
  const parts = label.split(/\s+/);
  if (parts.length >= 2) return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
  return label.slice(0, 10) + "…";
}

export default function GroupedBarChart({ groups, legend, height = 220, emptyText = "No data in range." }: { groups: BarGroup[]; legend: { label: string; color: string }[]; height?: number; emptyText?: string }) {
  const [wrapRef, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<({ i: number } & TipPos) | null>(null);
  const legendH = 24;
  const padL = 36;
  const padR = 12;
  const padT = 18; // value labels
  const padB = 30; // group names
  const H = height - legendH;
  const plotW = Math.max(10, W - padL - padR);
  const plotH = Math.max(10, H - padT - padB);
  const rawMax = Math.max(1, ...groups.flatMap((g) => [...g.bars.map((b) => b.value), g.tick ?? 0]));
  const step = niceStep(rawMax);
  const max = Math.ceil(rawMax / step) * step;
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const slot = plotW / Math.max(1, groups.length);
  const barsPer = Math.max(1, ...groups.map((g) => g.bars.length));
  const groupInner = slot * 0.72;
  const barW = Math.max(4, Math.min(34, groupInner / barsPer - 3));
  const groupW = barW * barsPer + 3 * (barsPer - 1);
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  const check = JSON.stringify(groups.map((g) => ({ label: g.label, values: g.bars.map((b) => b.value), tick: g.tick ?? null })));
  const tipW = 220;

  return (
    <div className="chart-wrap chart-rel anim-root" ref={wrapRef} data-check={check} onMouseLeave={() => setHover(null)}>
      <div className="chart-legend">
        {legend.map((s) => (
          <span key={s.label} className="legend">
            <span className="legend-swatch" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
        {groups.some((g) => g.tick !== null && g.tick !== undefined) ? (
          <span className="legend">
            <span className="legend-swatch legend-goal" /> goal by now (pro-rated)
          </span>
        ) : null}
      </div>
      {groups.length === 0 ? (
        <p className="note">{emptyText}</p>
      ) : (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={groups.map((g) => `${g.label}: ${g.bars.map((b) => `${b.label} ${n(b.value)}`).join(", ")}`).join("; ")}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={padL - 8} y={y(v) + 4} textAnchor="end" className="chart-tick">
                {n(v)}
              </text>
            </g>
          ))}
          {groups.map((g, i) => {
            const gx = padL + i * slot + (slot - groupW) / 2;
            return (
              <g key={g.label} onMouseMove={(e) => setHover({ i, clientX: e.clientX, clientY: e.clientY })}>
                <rect x={padL + i * slot} y={padT} width={slot} height={plotH} fill={hover?.i === i ? "rgba(22,119,255,0.08)" : "transparent"} />
                {g.bars.map((b, j) => {
                  const bx = gx + j * (barW + 3);
                  const top = y(b.value);
                  return (
                    <g key={b.label}>
                      <rect x={bx} y={top} width={barW} height={Math.max(b.value > 0 ? 2 : 0, padT + plotH - top)} rx={3} fill={b.color} opacity={hover && hover.i !== i ? 0.55 : 1} className="bar-v" style={{ "--i": i * g.bars.length + j } as React.CSSProperties} />
                      {b.value > 0 ? (
                        <text x={bx + barW / 2} y={top - 4} textAnchor="middle" className="chart-tick chart-value">
                          {n(b.value)}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
                {g.tick !== null && g.tick !== undefined ? <line x1={gx - 6} x2={gx + groupW + 6} y1={y(g.tick)} y2={y(g.tick)} stroke="var(--chart-goal)" strokeWidth={2} strokeDasharray="4 3" strokeLinecap="round" /> : null}
                <text x={padL + i * slot + slot / 2} y={H - 10} textAnchor="middle" className="chart-row-label">
                  <title>{g.label}</title>
                  {shorten(g.label, slot)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      <ChartTooltip pos={hover} width={tipW}>
        {hover ? (
          <>
          <div className="chart-tip-title">{groups[hover.i].label}</div>
          {groups[hover.i].bars.map((b) => (
            <div key={b.label}>
              <span className="legend-swatch" style={{ background: b.color }} /> {b.label}: <b>{n(b.value)}</b>
            </div>
          ))}
          <div>
            Combined: <b>{n(groups[hover.i].bars.reduce((s, b) => s + b.value, 0))}</b>
            {groups[hover.i].tick !== null && groups[hover.i].tick !== undefined ? ` · ${groups[hover.i].tickLabel ?? "goal"} ${n(Math.round(groups[hover.i].tick as number))}` : ""}
          </div>
          </>
        ) : null}
      </ChartTooltip>
    </div>
  );
}

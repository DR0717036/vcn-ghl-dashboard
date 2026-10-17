"use client";

// A small program-split donut for the appointment status cards: Army and
// Veteran as the two main segments, Both and No tag as thin gray segments
// when non-zero, the Army share in the center, a portal tooltip per segment
// with count and share. An empty ring with "—" when the total is zero.

import { useState } from "react";
import ChartTooltip, { type TipPos } from "./ChartTooltip";

export interface MiniSegment {
  label: string;
  value: number;
  color: string;
}

const n = (v: number) => v.toLocaleString("en-US");

function arc(cx: number, cy: number, r1: number, r2: number, a0: number, a1: number): string {
  // rounded so the server and the browser produce the same path text
  const p = (r: number, a: number) => [Math.round((cx + r * Math.cos(a)) * 1000) / 1000, Math.round((cy + r * Math.sin(a)) * 1000) / 1000];
  const [x0, y0] = p(r2, a0);
  const [x1, y1] = p(r2, a1);
  const [x2, y2] = p(r1, a1);
  const [x3, y3] = p(r1, a0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${x0},${y0} A${r2},${r2} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r1},${r1} 0 ${large} 0 ${x3},${y3} Z`;
}

export default function MiniDonut({ segments, centerValue, centerLabel, size = 96, ariaLabel }: { segments: MiniSegment[]; centerValue: string; centerLabel?: string; size?: number; ariaLabel: string }) {
  const [hover, setHover] = useState<({ i: number } & TipPos) | null>(null);
  const sum = segments.reduce((s, x) => s + x.value, 0);
  const shown = segments.filter((s) => s.value > 0);
  const cx = size / 2;
  const cy = size / 2;
  const r2 = size / 2 - 1;
  const r1 = r2 - 13;
  let a = -Math.PI / 2;
  const gap = shown.length > 1 ? 0.04 : 0;
  const check = JSON.stringify(segments.map((s) => ({ label: s.label, value: s.value })));

  return (
    <div className="mini-donut" style={{ width: size, height: size }} data-check={check} onMouseLeave={() => setHover(null)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="chart" role="img" aria-label={sum === 0 ? `${ariaLabel}: none` : `${ariaLabel}: ${shown.map((s) => `${s.label} ${n(s.value)}`).join(", ")}`}>
        {sum === 0 ? (
          <circle cx={cx} cy={cy} r={(r1 + r2) / 2} fill="none" stroke="var(--mini-donut-empty)" strokeWidth={r2 - r1} />
        ) : shown.length === 1 ? (
          // a single segment is a full ring; an SVG arc of 360° would collapse to nothing
          <circle cx={cx} cy={cy} r={(r1 + r2) / 2} fill="none" stroke={shown[0].color} strokeWidth={r2 - r1} onMouseMove={(e) => setHover({ i: segments.indexOf(shown[0]), clientX: e.clientX, clientY: e.clientY })} />
        ) : (
          shown.map((s) => {
            const i = segments.indexOf(s);
            const span = (s.value / sum) * Math.PI * 2;
            const a0 = a + gap / 2;
            const a1 = Math.max(a0 + 0.01, a + span - gap / 2);
            a += span;
            return <path key={s.label} d={arc(cx, cy, r1, r2, a0, a1)} fill={s.color} opacity={hover !== null && hover.i !== i ? 0.4 : 1} onMouseMove={(e) => setHover({ i, clientX: e.clientX, clientY: e.clientY })} />;
          })
        )}
      </svg>
      <div className="mini-donut-center">
        <div className="mini-donut-value">{sum === 0 ? "—" : centerValue}</div>
        {centerLabel ? <div className="mini-donut-label">{centerLabel}</div> : null}
      </div>
      <ChartTooltip pos={hover} width={200}>
        {hover ? (
          <>
            <div className="chart-tip-title">{segments[hover.i].label}</div>
            <div>
              <span className="legend-swatch" style={{ background: segments[hover.i].color }} /> <b>{n(segments[hover.i].value)}</b> · {sum > 0 ? `${Math.round((segments[hover.i].value / sum) * 100)}%` : "—"} of {n(sum)}
            </div>
          </>
        ) : null}
      </ChartTooltip>
    </div>
  );
}

// Horizontal bars for one program's milestone path. Server component: no
// interactivity beyond native tooltips on each bar. Color follows the
// program (Army = series 1, Veteran = series 2) and never changes.

import type { Funnel } from "@/lib/charts";
import { fmtUsd } from "@/lib/milestones";

export default function FunnelChart({ funnel, color }: { funnel: Funnel; color: string }) {
  const max = Math.max(1, ...funnel.steps.map((s) => s.count));
  const rowH = 44;
  const labelW = 230;
  const W = 640;
  const barMax = W - labelW - 70;
  const H = funnel.steps.length * rowH + 8;
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`${funnel.label} current counts by milestone stage`}>
        {funnel.steps.map((s, i) => {
          const y = i * rowH + 8;
          const w = Math.max(s.count > 0 ? 3 : 0, (s.count / max) * barMax);
          return (
            <g key={s.stageId}>
              <title>{`${s.stageName}: ${s.count.toLocaleString("en-US")} currently in stage · ${fmtUsd(s.value)} Opportunity Value`}</title>
              <text x={labelW - 12} y={y + 16} textAnchor="end" className={s.milestone ? "chart-row-label" : "chart-row-label muted"}>
                {s.label.length > 30 ? s.label.slice(0, 29) + "…" : s.label}
              </text>
              {!s.milestone ? (
                <text x={labelW - 12} y={y + 30} textAnchor="end" className="chart-tick">
                  funnel only
                </text>
              ) : null}
              <rect x={labelW} y={y + 4} width={barMax} height={20} fill="var(--surface-inset)" rx={4} />
              {w > 0 ? <rect x={labelW} y={y + 4} width={w} height={20} fill={color} rx={4} /> : null}
              <text x={labelW + w + 8} y={y + 18} className="chart-label-strong">
                {s.count.toLocaleString("en-US")}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

"use client";

// "Best times to call" heat map: weekday × hour grid colored by conversation
// rate, connected rate, or dial volume on a single-hue sequential scale (the
// brand blue at rising opacity: light = low, saturated = high). Slots with
// no dials are empty; slots under the configured minimum are hatched and
// left out of the top-3 ranking. Works on light and dark cards because the
// cell fill is a translucent blue over whatever surface sits beneath, and
// text uses the surface's own tokens until the fill is strong enough for
// white.

import { useState } from "react";
import { DAY_LABELS, hourLabel, hourSpan, metricValue, topSlots, type HeatBundle, type HeatData, type HeatMetric } from "@/lib/heatmap";

const n = (v: number) => v.toLocaleString("en-US");
const pct = (v: number) => `${Math.round(v * 100)}%`;

const METRICS: [HeatMetric, string][] = [
  ["conversation", "Conversation rate"],
  ["connected", "Connected rate"],
  ["dials", "Dial volume"],
];

export default function HeatMap({ bundle, title = "Best times to call", showPeriodToggle = true, defaultMetric = "conversation" }: { bundle: HeatBundle; title?: string; showPeriodToggle?: boolean; defaultMetric?: HeatMetric }) {
  const [metric, setMetric] = useState<HeatMetric>(defaultMetric);
  const [period, setPeriod] = useState<"range" | "last90">("range");
  const data: HeatData = period === "range" ? bundle.range : bundle.last90;
  const hours = Array.from({ length: bundle.endHour - bundle.startHour + 1 }, (_, i) => bundle.startHour + i);

  let max = 0;
  let shown = 0;
  for (let d = 0; d < 7; d++)
    for (const h of hours) {
      const c = data.grid[d][h];
      shown += c.dials;
      const v = metricValue(c, metric);
      if (v !== null && c.dials >= bundle.minDials && v > max) max = v;
    }
  if (max === 0) {
    // fall back to any cell so a sparse grid still shows shading
    for (let d = 0; d < 7; d++) for (const h of hours) max = Math.max(max, metricValue(data.grid[d][h], metric) ?? 0);
  }
  const outside = data.dials - shown;
  const top = topSlots(data, metric, bundle.minDials, bundle.startHour, bundle.endHour);
  const fmtMetric = (v: number) => (metric === "dials" ? n(v) : pct(v));
  const metricWord = metric === "conversation" ? "conversation rate" : metric === "connected" ? "connected rate" : "dials";

  return (
    <div className="heat">
      <div className="heat-head">
        <div>
          <div className="heat-title">{title}</div>
          <div className="note heat-sub">
            {data.label} · hours in America/New_York · color = {metricWord}
            {metric !== "dials" ? ` · cells under ${bundle.minDials} dials are hatched and not ranked` : ""}
          </div>
        </div>
        <div className="heat-controls">
          <div className="answer-filter heat-seg" role="group" aria-label="Color metric">
            {METRICS.map(([key, label]) => (
              <button key={key} type="button" className={`seg-btn${metric === key ? " active" : ""}`} onClick={() => setMetric(key)}>
                {label}
              </button>
            ))}
          </div>
          {showPeriodToggle ? (
            <div className="answer-filter heat-seg" role="group" aria-label="Period">
              <button type="button" className={`seg-btn${period === "range" ? " active" : ""}`} onClick={() => setPeriod("range")}>
                Selected range
              </button>
              <button type="button" className={`seg-btn${period === "last90" ? " active" : ""}`} onClick={() => setPeriod("last90")}>
                Last 90 days
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="heat-scroll">
        <table className="heat-grid anim-root" role="grid" aria-label={`${title}: ${metricWord} by weekday and hour`}>
          <thead>
            <tr>
              <th className="heat-corner" />
              {hours.map((h) => (
                <th key={h} className="heat-hour">
                  {hourLabel(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_LABELS.map((day, d) => (
              <tr key={day}>
                <th className="heat-day">{day}</th>
                {hours.map((h, hi) => {
                  const c = data.grid[d][h];
                  const order = { "--i": Math.min(d * hours.length + hi, 120) } as React.CSSProperties;
                  const v = metricValue(c, metric);
                  if (v === null) return <td key={h} className="heat-cell heat-empty" style={order} title={`${day} ${hourLabel(h)} · no dials`} />;
                  const strength = max > 0 ? Math.max(0.1, v / max) : 0.1;
                  const low = c.dials < bundle.minDials;
                  const tip =
                    metric === "dials"
                      ? `${day} ${hourLabel(h)} · ${n(c.dials)} dials`
                      : `${day} ${hourLabel(h)} · ${n(metric === "conversation" ? c.conversations : c.connected)} ${metric === "conversation" ? "conversations" : "connected"} / ${n(c.dials)} dials · ${pct(v)}${low ? ` · under ${bundle.minDials} dials, not ranked` : ""}`;
                  return (
                    <td
                      key={h}
                      className={`heat-cell${low ? " heat-low" : ""}${strength > 0.55 ? " heat-strong" : ""}`}
                      style={{ ...order, "--heat": strength } as React.CSSProperties}
                      title={tip}
                      aria-label={tip}
                    >
                      <span className="heat-value">{fmtMetric(v)}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="heat-foot">
        <div className="heat-legend" aria-hidden="true">
          <span className="note">low</span>
          <span className="heat-legend-bar" />
          <span className="note">high{max > 0 ? ` (${fmtMetric(max)})` : ""}</span>
          <span className="heat-legend-swatch heat-low" />
          <span className="note">under {bundle.minDials} dials</span>
          <span className="heat-legend-swatch heat-empty" />
          <span className="note">no dials</span>
        </div>
        <div className="note">
          {n(shown)} of {n(data.dials)} dials fall in the shown hours
          {outside > 0 ? `; ${n(outside)} outside ${hourLabel(bundle.startHour)}–${hourLabel(bundle.endHour + 1 > 23 ? 23 : bundle.endHour + 1)} are counted in the totals but not shown` : ""}.
        </div>
      </div>

      <div className="heat-top">
        <div className="label kpi-notes-title">Top 3 slots by {metricWord}</div>
        {top.length === 0 ? (
          <div className="note">No slot reaches {bundle.minDials} dials in this period.</div>
        ) : (
          <ol className="heat-top-list">
            {top.map((t) => (
              <li key={`${t.day}-${t.hour}`}>
                <b>
                  {DAY_LABELS[t.day]} {hourSpan(t.hour)}
                </b>{" "}
                · {fmtMetric(t.value)}
                {metric !== "dials" ? ` (${n(t.cell.dials)} dials)` : ""}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

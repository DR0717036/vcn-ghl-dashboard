// Primary-KPI layout for a single milestone stage, matching
// docs/reference/kpi-card-example.png: contact count and Opportunity Value
// side by side, each with its change vs the prior period, and a line chart
// below with count on the left axis and Opportunity Value on the right
// (dual axis at the owner's request; both axes are labeled and the legend
// names each line).

import type { TimeSeries } from "@/lib/charts";
import { chartSeries } from "@/lib/design";
import { fmtUsd, type MilestoneResult } from "@/lib/milestones";
import LineChart from "./charts/LineChart";
import { Delta } from "./KpiCard";

const n = (v: number) => v.toLocaleString("en-US");

export default function MilestoneKpiCard({ m, series, subtitle, className = "" }: { m: MilestoneResult; series: TimeSeries; subtitle?: string; className?: string }) {
  const unavailable = m.achieved === null;
  const goalText = m.goal === null ? "Goal not set" : unavailable || m.goal === 0 ? `Goal ${n(m.goal)}` : `Goal ${n(m.goal)} · ${Math.round(((m.achieved ?? 0) / m.goal) * 100)}% of goal`;
  const per = series.grouping === "hourly" ? "per hour" : series.grouping === "daily" ? "per day" : "per week";
  return (
    <div className={`stat ${className}`.trim()} data-kpi-milestone={m.key}>
      <div className="label">{m.label}</div>
      <div className="note">{subtitle ?? `${m.programLabel} · ${m.reportingGroup} · "${m.stageName}" · reached during period`}</div>
      {unavailable ? (
        <>
          <div className="stat-value unavailable">unavailable</div>
          {m.unavailableReason ? <div className="note">{m.unavailableReason}</div> : null}
        </>
      ) : (
        <div className="stat-pair">
          <div>
            <div className="note">Contacts</div>
            <div className="stat-value">{n(m.achieved ?? 0)}</div>
            <div className="stat-meta">
              <Delta value={m.achieved} prev={m.prev} reason={m.prevUnavailableReason} />
            </div>
          </div>
          <div>
            <div className="note">Opportunity Value{m.valueMissing > 0 ? ` (${n(m.valueMissing)} missing)` : ""}</div>
            <div className="stat-value">{fmtUsd(m.value)}</div>
            <div className="stat-meta">
              <Delta value={m.value} prev={m.prevValue} format="usd" reason={m.prevUnavailableReason} />
            </div>
          </div>
        </div>
      )}
      <div className="stat-meta">
        <span>{goalText}</span>
        {m.partialHistory ? <span className="pill pill-warn">partial history</span> : null}
      </div>
      {!unavailable ? (
        <LineChart
          height={190}
          leftLabel="Contacts"
          rightLabel="Opportunity Value"
          series={[
            { label: `Contacts ${per}`, color: chartSeries[0], points: series.points.map((p) => ({ label: p.label, value: p.count })), axis: "left", format: "count" },
            { label: `Opportunity Value ${per}`, color: chartSeries[3], points: series.points.map((p) => ({ label: p.label, value: p.value ?? 0 })), axis: "right", format: "usd" },
          ]}
        />
      ) : null}
      <table className="stat-breakdown">
        <tbody>
          <tr>
            <td>Currently in stage (snapshot)</td>
            <td className="num">{n(m.currentInStage)}</td>
          </tr>
          <tr>
            <td>Current Opportunity Value{m.currentValueMissing > 0 ? ` (${n(m.currentValueMissing)} missing)` : ""}</td>
            <td className="num">{fmtUsd(m.currentValue)}</td>
          </tr>
          {!unavailable ? (
            <tr>
              <td>Distinct opportunities behind the contacts</td>
              <td className="num">{n(m.achievedOpps)}</td>
            </tr>
          ) : null}
          {m.currentUnclassified > 0 ? (
            <tr>
              <td>In stage without a {m.reportingGroup} tag (not counted)</td>
              <td className="num">{n(m.currentUnclassified)}</td>
            </tr>
          ) : null}
          {m.unclassified > 0 ? (
            <tr>
              <td>Entered in period, no fiscal-year tag (not counted)</td>
              <td className="num">{n(m.unclassified)}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <details className="stat-notes">
        <summary className="note">How this is counted</summary>
        <ul className="plain note">
          {m.notes.map((t) => (
            <li key={t}>{t}</li>
          ))}
          <li>Opportunity Value is the value on the opportunity at the time of the event. It is not revenue, cash, or commission.</li>
          <li>The chart uses two scales: contacts on the left axis, Opportunity Value on the right. Read each line against its own axis.</li>
        </ul>
      </details>
    </div>
  );
}

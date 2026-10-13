// Primary-KPI card for a single milestone stage, matching
// docs/reference/kpi-card-example.png: contact count and Opportunity Value
// side by side, and a line chart with count on the left axis and
// Opportunity Value on the right (dual axis at the owner's request; both
// axes are labeled and the legend names each line). Uses the shared card
// anatomy so it lines up with every other card.

import type { TimeSeries } from "@/lib/charts";
import { chartSeries } from "@/lib/design";
import { fmtUsd, type MilestoneResult } from "@/lib/milestones";
import LineChart from "./charts/LineChart";
import KpiShell from "./KpiShell";

const n = (v: number) => v.toLocaleString("en-US");

function signed(diff: number, prev: number, f: (v: number) => string): string {
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
  const pct = prev === 0 ? (diff === 0 ? "0%" : "New") : `${diff >= 0 ? "+" : "−"}${Math.abs(Math.round((diff / prev) * 100))}%`;
  return `${sign}${f(Math.abs(diff))} (${pct})`;
}

/** "+2 contacts (New) · +$4,000 value vs prior" on one line, colored by the contact change. */
function PairDelta({ m }: { m: MilestoneResult }) {
  if (m.achieved === null || m.prev === null) return <span className="kpi-muted">Comparison unavailable</span>;
  const diff = m.achieved - m.prev;
  const cls = diff > 0 ? "delta-up" : diff < 0 ? "delta-down" : "delta-flat";
  const contacts = signed(diff, m.prev, n);
  const value = m.prevValue === null ? "" : ` · ${signed(m.value - m.prevValue, m.prevValue, fmtUsd)} value`;
  const star = m.prevUnavailableReason ? "*" : "";
  return (
    <span className={cls} title={`Previous period: ${n(m.prev)} contacts, ${fmtUsd(m.prevValue ?? 0)} Opportunity Value.${m.prevUnavailableReason ? ` ${m.prevUnavailableReason}` : ""}`}>
      {contacts} contacts{value} vs prior{star}
    </span>
  );
}

export default function MilestoneKpiCard({ m, series, title, subtitle, className = "" }: { m: MilestoneResult; series: TimeSeries; title?: string; subtitle?: string; className?: string }) {
  const unavailable = m.achieved === null;
  const per = series.grouping === "hourly" ? "per hour" : series.grouping === "daily" ? "per day" : "per week";
  const breakdown = [
    { label: "Currently in stage (snapshot)", value: n(m.currentInStage) },
    { label: `Current Opportunity Value${m.currentValueMissing > 0 ? ` (${n(m.currentValueMissing)} missing)` : ""}`, value: fmtUsd(m.currentValue) },
    ...(!unavailable ? [{ label: "Distinct opportunities behind the contacts", value: n(m.achievedOpps) }] : []),
    ...(m.currentUnclassified > 0 ? [{ label: `In stage without a ${m.reportingGroup} tag (not counted)`, value: n(m.currentUnclassified) }] : []),
    ...(m.unclassified > 0 ? [{ label: "Entered in period, no fiscal-year tag (not counted)", value: n(m.unclassified) }] : []),
  ];
  return (
    <KpiShell
      id={m.key}
      className={className}
      title={title ?? m.label}
      subtitle={subtitle ?? `${m.programLabel} · ${m.reportingGroup} · "${m.stageName}" · reached during period`}
      value={
        unavailable ? (
          <>
            <div className="stat-value unavailable">unavailable</div>
            {m.unavailableReason ? <div className="note kpi-reason">{m.unavailableReason}</div> : null}
          </>
        ) : (
          <div className="stat-pair">
            <div>
              <div className="stat-value">{n(m.achieved ?? 0)}</div>
              <div className="note">Contacts</div>
            </div>
            <div>
              <div className="stat-value">{fmtUsd(m.value)}</div>
              <div className="note">Opportunity Value{m.valueMissing > 0 ? ` (${n(m.valueMissing)} missing)` : ""}</div>
            </div>
          </div>
        )
      }
      pill={<span className="pill pill-neutral">Goal not set</span>}
      goalLine={<span className="kpi-muted">Goal not set</span>}
      badges={m.partialHistory ? <span className="pill pill-warn">partial history</span> : null}
      deltaLine={<PairDelta m={m} />}
      chart={
        !unavailable ? (
          <LineChart
            height={200}
            leftLabel="Contacts"
            rightLabel="Opp. Value"
            series={[
              { label: `Contacts ${per}`, color: chartSeries[0], points: series.points.map((p) => ({ label: p.label, value: p.count })), axis: "left", format: "count" },
              { label: `Opportunity Value ${per}`, color: chartSeries[3], points: series.points.map((p) => ({ label: p.label, value: p.value ?? 0 })), axis: "right", format: "usd" },
            ]}
          />
        ) : (
          <div className="note">No chart: milestone events are unavailable.</div>
        )
      }
      breakdown={breakdown}
      notes={[
        ...m.notes,
        "Opportunity Value is the value on the opportunity at the time of the event. It is not revenue, cash, or commission.",
        "The chart uses two scales: contacts on the left axis, Opportunity Value on the right. Read each line against its own axis.",
      ]}
    />
  );
}

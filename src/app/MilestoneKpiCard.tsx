// Primary-KPI card for a single milestone stage, matching
// docs/reference/kpi-card-example.png: contact count and Opportunity Value
// side by side, and a line chart with count on the left axis and
// Opportunity Value on the right (dual axis at the owner's request; both
// axes are labeled and the legend names each line). Uses the shared card
// anatomy so it lines up with every other card.
//
// Round 5: clicking the card (or its Details button) opens a drilldown
// modal with the same chart at full width and the contacts counted. The
// inline Details expander is gone, so the card never changes height.

import type { ReactNode } from "react";
import type { TimeSeries } from "@/lib/charts";
import { chartSeries } from "@/lib/design";
import { fmtUsd, type MilestoneResult } from "@/lib/milestones";
import type { LineSeries } from "./charts/LineChart";
import LineChart from "./charts/LineChart";
import { KPI_COLUMNS, MilestoneDrilldown } from "./Drilldown";
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

export default function MilestoneKpiCard({
  m,
  series,
  title,
  subtitle,
  rangeQuery,
  rangeLabel,
  headRight,
  className = "",
}: {
  m: MilestoneResult;
  series: TimeSeries;
  title?: string;
  subtitle?: string;
  /** Query string naming the selected range, e.g. "range=this_month" or "range=custom&from=…&to=…". */
  rangeQuery: string;
  rangeLabel: string;
  /** Control shown at the right end of the title row (the semester dropdown on the Veteran submissions card). */
  headRight?: ReactNode;
  className?: string;
}) {
  const unavailable = m.achieved === null;
  const per = series.grouping === "hourly" ? "per hour" : series.grouping === "daily" ? "per day" : "per week";
  const cardTitle = title ?? m.label;
  const cardSubtitle = subtitle ?? `${m.programLabel} · ${m.reportingGroup} · "${m.stageName}" · reached during period`;
  const facts = [
    { label: "Currently in stage (snapshot)", value: n(m.currentInStage) },
    { label: `Current Opportunity Value${m.currentValueMissing > 0 ? ` (${n(m.currentValueMissing)} missing)` : ""}`, value: fmtUsd(m.currentValue) },
    ...(!unavailable ? [{ label: "Distinct opportunities behind the contacts", value: n(m.achievedOpps) }] : []),
    ...(m.currentUnclassified > 0 ? [{ label: `In stage without a ${m.reportingGroup} tag (not counted)`, value: n(m.currentUnclassified) }] : []),
    ...(m.unclassified > 0 ? [{ label: "Entered in period, no fiscal-year tag (not counted)", value: n(m.unclassified) }] : []),
  ];
  const notes = [
    ...m.notes,
    "Opportunity Value — the value on the opportunity at the time of the event; not revenue, cash, or commission.",
    "Chart — two scales: contacts on the left axis, Opportunity Value on the right; read each line against its own axis.",
    "Assigned user — the opportunity owner at the time of the event, the user the submission is credited to.",
    "Stage — where the opportunity sits now.",
    "Goal — none on this card; the only submissions goal is on Program Submissions (combined): 5 per rep per week, scaled per rep.",
  ];
  const chart: LineSeries[] = [
    { label: `Contacts ${per}`, color: chartSeries[0], points: series.points.map((p) => ({ label: p.label, value: p.count })), axis: "left", format: "count" },
    { label: `Opportunity Value ${per}`, color: chartSeries[3], points: series.points.map((p) => ({ label: p.label, value: p.value ?? 0 })), axis: "right", format: "usd" },
  ];

  const headline = unavailable ? (
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
  );
  const pill = <span className="pill pill-neutral">Goal not set</span>;

  return (
    <MilestoneDrilldown
      spec={{
        query: `kind=milestone&key=${encodeURIComponent(m.key)}&${rangeQuery}`,
        title: cardTitle,
        subtitle: `${cardSubtitle} · ${rangeLabel}`,
        header: (
          <div className="kpi-value-row modal-value-row">
            <div className="kpi-value">{headline}</div>
            <div className="kpi-pill">{pill}</div>
          </div>
        ),
        expected: m.achieved,
        facts,
        chart: unavailable ? undefined : { series: chart, leftLabel: "Contacts", rightLabel: "Opp. Value" },
        columns: KPI_COLUMNS,
        notes,
        csvName: `${cardTitle} ${rangeLabel}`,
      }}
    >
      <KpiShell
        id={m.key}
        className={`kpi-clickable kpi-tall ${className}`.trim()}
        title={cardTitle}
        subtitle={cardSubtitle}
        headRight={headRight}
        value={headline}
        pill={pill}
        goalLine={<span className="kpi-muted">Goal not set</span>}
        badges={m.partialHistory ? <span className="pill pill-warn">partial history</span> : null}
        deltaLine={<PairDelta m={m} />}
        chart={unavailable ? <div className="note">No chart: milestone events are unavailable.</div> : <LineChart height={260} leftLabel="Contacts" rightLabel="Opp. Value" series={chart} />}
        footer={
          <button type="button" className="kpi-details-btn">
            Details
          </button>
        }
      />
    </MilestoneDrilldown>
  );
}

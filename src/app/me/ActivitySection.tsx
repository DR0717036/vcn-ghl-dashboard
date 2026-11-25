// "My activity" on the rep dashboard (owner request 2026-11-24): the admin
// Activity band filtered to the rep. Row 1: Calls Made and Talk Time (the
// admin cards' anatomy and charts, your calls only, against your own goal).
// Row 2: your row of Rep Call Activity, clickable for the call list (no
// recordings). Row 3: your best-times-to-call heat map. Server component;
// the charts, the clickable row, and the heat map are the existing client
// pieces the admin page uses.

import { chartSeries } from "@/lib/design";
import type { RepActivityData } from "@/lib/me/activity";
import { fmtMinutes } from "@/lib/metrics";
import { fmtDuration, outcomeRows, type RepCallRow } from "@/lib/repCalls";
import BarChart from "../charts/BarChart";
import HeatMap from "../charts/HeatMap";
import LineChart from "../charts/LineChart";
import { MY_CALL_COLUMNS, RepDrilldownRow, type DrilldownSpec } from "../Drilldown";
import { GoalPill, GoalText, StatusPill } from "../GoalLine";
import KpiCard from "../KpiCard";
import KpiShell from "../KpiShell";
import Notes from "../Notes";

const ENDPOINT = "/api/me/drilldown";
const n = (v: number) => v.toLocaleString("en-US");
const DASH = "—";
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : DASH);
const mins = (sec: number) => fmtMinutes(Math.round(sec / 60));

function callSpec(row: RepCallRow, d: RepActivityData, rangeQuery: string, rangeLabel: string, name: string): DrilldownSpec {
  return {
    endpoint: ENDPOINT,
    query: `kind=calls&${rangeQuery}`,
    title: `${name} · ${n(row.dials)} ${row.dials === 1 ? "dial" : "dials"}`,
    subtitle: `Your calls in the selected range · ${rangeLabel}`,
    facts: [
      { label: "Conversations / connected / dials", value: `${n(row.conversations)} / ${n(row.outcomes.conversation + row.outcomes.short)} / ${n(row.dials)}`, title: `Conversation = completed and at least ${d.conversationMinSeconds}s (estimated by duration); connected = every completed call.` },
      { label: "Conversation rate", value: pct(row.conversations, row.dials), title: "Conversations ÷ dials." },
      { label: "Answer rate", value: pct(row.outcomes.conversation + row.outcomes.short, row.dials), title: "Connected (conversations + short pickups) ÷ dials." },
      ...outcomeRows(row.outcomes).map((o) => ({ label: o.label, value: o.value })),
      { label: "Total talk time", value: mins(row.talkSeconds), title: "Recorded duration of your connected calls in the range." },
      { label: "Avg talk time per call", value: row.avgSeconds === null ? DASH : fmtDuration(row.avgSeconds), title: `${n(row.connected)} connected calls counted.` },
      { label: "First call (avg)", value: row.firstCallAvg ?? DASH, title: `Average of your first outbound attempt on each of the ${n(row.firstCallDays)} days with any outbound call.` },
    ],
    columns: MY_CALL_COLUMNS,
    perDayTable: { title: "Per day: dials, talk time, and first outbound call" },
    heatmap: true,
    outcomeFilter: true,
    expectedConversations: row.conversations,
    notes: d.notes,
    csvName: `${name} calls ${rangeLabel}`,
  };
}

export default function ActivitySection({ d, rangeQuery, rangeLabel, name }: { d: RepActivityData; rangeQuery: string; rangeLabel: string; name: string }) {
  const per = d.callsChart.grouping === "hourly" ? "per hour" : d.callsChart.grouping === "daily" ? "per day" : "per week";
  const alignedBy = d.callsChart.grouping === "hourly" ? "hour" : "day";
  const priorLabel = `prior period (aligned by ${alignedBy})`;
  const row = d.row;
  const talkMin = row ? Math.round(row.talkSeconds / 60) : null;

  const table = row ? (
    <div className="scroll kpi-body">
      <table className="stat-breakdown rep-table rep-table-calls me-activity-table">
        <colgroup>
          <col className="col-name" />
          <col className="col-num" />
          <col className="col-status" />
          <col className="col-talk" />
          <col className="col-talk" />
          <col className="col-status" />
          <col className="col-first" />
        </colgroup>
        <thead>
          <tr>
            <th>You</th>
            <th className="num" title={`Conversation = completed and at least ${d.conversationMinSeconds}s, estimated by duration.`}>
              Conversations / Connected / Dials
            </th>
            <th className="status">Call goal</th>
            <th className="num">Total talk time</th>
            <th className="num">Avg talk / call</th>
            <th className="status">Talk time goal</th>
            <th className="num">First call (avg)</th>
          </tr>
        </thead>
        <tbody>
          <RepDrilldownRow spec={callSpec(row, d, rangeQuery, rangeLabel, name)}>
            <td className="rep-name">{name}</td>
            <td
              className="num dials"
              title={`Conversations / connected / outbound dials. ${outcomeRows(row.outcomes)
                .map((o) => `${o.label}: ${o.value}`)
                .join(" · ")}`}
            >
              {`${n(row.conversations)} / ${n(row.outcomes.conversation + row.outcomes.short)} / ${n(row.dials)}`}
              <span className="plan-label">{`${pct(row.conversations, row.dials)} conversations · ${pct(row.outcomes.conversation + row.outcomes.short, row.dials)} connected`}</span>
            </td>
            <td className="status">{row.callStatus ? <StatusPill status={row.callStatus} title={row.callGoal ? `Your goal ${n(Math.round(row.callGoal.full))} dials${row.callGoal.scaled !== row.callGoal.full ? ` (${n(Math.round(row.callGoal.scaled))} by now)` : ""}` : undefined} /> : <span className="note">no goal</span>}</td>
            <td className="num talk">{row.talkSeconds > 0 ? mins(row.talkSeconds) : DASH}</td>
            <td className="num" title={`${n(row.connected)} connected calls`}>
              {row.avgSeconds === null ? DASH : fmtDuration(row.avgSeconds)}
            </td>
            <td className="status">{row.talkStatus ? <StatusPill status={row.talkStatus} title={row.talkGoalMinutes ? `Your goal ${fmtMinutes(Math.round(row.talkGoalMinutes.full))}${row.talkGoalMinutes.scaled !== row.talkGoalMinutes.full ? ` (${fmtMinutes(Math.round(row.talkGoalMinutes.scaled))} by now)` : ""}` : undefined} /> : <span className="note">no goal</span>}</td>
            <td className="num first" title={row.firstCallDays > 0 ? `Average over ${n(row.firstCallDays)} ${row.firstCallDays === 1 ? "day" : "days"} with outbound calls` : "No outbound calls in the range"}>
              {row.firstCallAvg ?? DASH}
            </td>
          </RepDrilldownRow>
        </tbody>
      </table>
    </div>
  ) : (
    <p className="note">You are not on the team roster for this range, so there is no call row to show.</p>
  );

  return (
    <>
      <div className="kpi-row cols-2">
        <KpiCard
          k={d.calls}
          className="me-card"
          chart={
            <LineChart
              height={200}
              series={[
                { label: `Calls ${per}`, color: chartSeries[0], points: d.callsChart.points.map((p) => ({ label: p.label, value: p.count })), format: "count" },
                ...(d.callsChart.prior ? [{ label: priorLabel, color: "var(--series-prior)", points: d.callsChart.prior.map((p) => ({ label: p.label, value: p.count })), format: "count" as const, muted: true }] : []),
              ]}
            />
          }
        />
        <KpiCard k={d.talk} className="me-card" chart={<BarChart height={200} points={d.talkChart.points} prior={d.talkChart.prior} priorLabel={priorLabel} color={chartSeries[0]} unit={`recorded minutes ${per}`} format="minutes" />} />
      </div>
      <div className="kpi-row cols-1">
        <KpiShell
          id="me-call-activity"
          className="kpi-title-xl me-card"
          title="My call activity"
          subtitle="Your outbound human dials, recorded talk time, and first-call time · selected range · click the row for every call"
          value={
            <div className="stat-pair">
              <div>
                <div className="stat-value">{row ? n(row.dials) : DASH}</div>
                <div className="note">Dials</div>
              </div>
              <div>
                <div className="stat-value">{row ? mins(row.talkSeconds) : DASH}</div>
                <div className="note">Talk time</div>
              </div>
            </div>
          }
          pill={<GoalPill goal={d.callsGoal} value={row ? row.dials : null} />}
          goalLine={
            <span>
              Calls: <GoalText goal={d.callsGoal} value={row ? row.dials : null} />
            </span>
          }
          deltaLine={
            <span>
              Talk time: <GoalText goal={d.talkGoal} value={talkMin} format="minutes" />
              <GoalPill goal={d.talkGoal} value={talkMin} />
            </span>
          }
          body={table}
          sections={row ? [{ title: `Your dials by outcome (Conversation = completed and at least ${d.conversationMinSeconds}s, estimated)`, rows: outcomeRows(row.outcomes) }] : []}
          notes={d.notes}
        />
      </div>
      <div className="kpi-row cols-1">
        <div className="stat kpi reveal me-card" data-kpi="me-heat">
          <div className="kpi-head">
            <div className="label">Best times to call</div>
            <div className="kpi-sub note">Your outbound dials by weekday and hour · colored by conversation rate, connected rate, or dial volume · the selected range or the last 90 days</div>
          </div>
          <div className="me-heat">
            <HeatMap bundle={d.heat} title="Your best times to call" />
          </div>
          <details className="kpi-details">
            <summary>How this is counted</summary>
            <div className="kpi-details-body">
              <Notes notes={d.notes.filter((x) => x.startsWith("Best times") || x.startsWith("Dials") || x.startsWith("Conversation —") || x.startsWith("Limitation"))} />
            </div>
          </details>
        </div>
      </div>
    </>
  );
}

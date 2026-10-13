// Executive scorecard (brief section 3). Reads the local cache only.
//
// Layout (owner edits round 2): the page alternates full-width light and
// dark bands like intelagentmedia.com. Sync bar, range picker, and the Leads
// row sit on a light band; Activity on a dark band with gradient cards;
// Appointments light; Submissions dark. Every KPI card shares one anatomy
// (src/app/KpiShell.tsx) so cards in a row line up exactly.

import { callsSeries, milestoneSeries, newLeadsSeries, programFunnels, talkTimeSeries } from "@/lib/charts";
import { latestSyncRuns } from "@/lib/db";
import { fmtDateTime, fmtRange, isRangeKey, REPORTING_TZ, resolveRange, type RangeKey } from "@/lib/dates";
import { chartSeries } from "@/lib/design";
import { mappingConfig } from "@/lib/mapping-config";
import { computePrimaryKpis, coverage, kpiAppointmentsCancelled, kpiAppointmentsConfirmed, kpiNewLeads } from "@/lib/metrics";
import { computeMilestoneByKey, computeMilestones } from "@/lib/milestones";
import { computeSubmissions } from "@/lib/submissions";
import { CORE_SYNC_KIND } from "@/lib/sync/core";
import { computeWon } from "@/lib/won";
import BarChart from "./charts/BarChart";
import FunnelChart from "./charts/FunnelChart";
import LineChart from "./charts/LineChart";
import KpiCard from "./KpiCard";
import MilestoneCard from "./MilestoneCard";
import MilestoneKpiCard from "./MilestoneKpiCard";
import RangePicker from "./RangePicker";
import SubmissionsCard from "./SubmissionsCard";
import WonSection from "./WonSection";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ScorecardPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const rangeParam = first(sp.range);
  const key: RangeKey = isRangeKey(rangeParam) ? rangeParam : "this_month";
  const from = first(sp.from);
  const to = first(sp.to);
  const now = new Date();
  const range = resolveRange(key, now, { from, to });
  // The New Leads card defaults to Today (brief 3.2) unless a range was chosen explicitly.
  const newLeadsRange = rangeParam ? range : resolveRange("today", now);

  const cov = coverage();
  const lastRun = latestSyncRuns(CORE_SYNC_KIND, 1)[0];
  const kpis = computePrimaryKpis(range).map((k) => (k.key === "newLeads" ? kpiNewLeads(newLeadsRange) : k));
  const kpi = (key: string) => kpis.find((k) => k.key === key)!;
  const calls = callsSeries(range);
  const talk = talkTimeSeries(range);
  const confirmed = kpiAppointmentsConfirmed(range);
  const cancelled = kpiAppointmentsCancelled(range);
  // KPI-row milestone cards, in the owner's order: CA 101, Supervisor Approval, then the historical FS1 stage.
  const kpiMilestoneKeys = ["army_ca101", "army_supervisor_approval", ...mappingConfig.kpiMilestones.map((m) => m.key)];
  const kpiMilestones = kpiMilestoneKeys
    .map((key) => {
      const m = computeMilestoneByKey(key, range);
      const mapping = [...mappingConfig.kpiMilestones, ...mappingConfig.milestones].find((x) => x.key === key);
      return m && mapping ? { m, series: milestoneSeries(mapping, range) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const submissions = computeSubmissions(range);
  const milestones = computeMilestones(range);
  const won = computeWon(range);
  const leadsSeries = newLeadsSeries(range);
  const funnels = programFunnels();
  const hasData = Boolean(cov.lastCoreSyncOkAt);
  const per = calls.grouping === "hourly" ? "per hour" : calls.grouping === "daily" ? "per day" : "per week";
  const priorLabel = range.key === "this_week" || range.key === "last_week" ? "prior week" : "prior period";
  const alignedBy = calls.grouping === "hourly" ? "hour" : "day";

  const milestoneTitle: Record<string, string> = { army_ca101: "Army CA 101 Submissions", army_supervisor_approval: "Awaiting Supervisor Approval" };
  const milestoneSubtitle = (k: string, m: { reportingGroup: string; stageName: string }) =>
    k === "army_ca101"
      ? `Army CA · ${m.reportingGroup} · "${m.stageName}" · reached in period`
      : k === "army_supervisor_approval"
        ? `Army CA · ${m.reportingGroup} · awaiting approval · entered in period`
        : `Veteran G.I. Bill · ${m.reportingGroup}, historical semester · reached in period`;

  return (
    <>
      <div className="page hero">
        <h1>Executive Scorecard</h1>
        <p className="lead">Veteran Careers Network sales performance from Go High Level. Opportunity values are shown as Opportunity Value, never revenue.</p>
      </div>

      <section className="band band-light">
        <div className="band-inner">
          <div className="status-bar">
            <span>
              <b>Last successful sync:</b> {hasData ? fmtDateTime(cov.lastCoreSyncOkAt) : "never"}
            </span>
            {lastRun && lastRun.ok === 0 ? (
              <span>
                <span className="pill pill-warn">last attempt partial</span> <span className="note">{lastRun.summary}</span>
              </span>
            ) : null}
            {lastRun && lastRun.ok === null ? <span className="pill pill-info">sync running</span> : null}
            <span>
              <b>Date range:</b> {range.label}, {fmtRange(range.start, range.end, range.partial)}
            </span>
            <span>
              <b>Compared with:</b> {fmtRange(range.prevStart, range.prevEnd, range.partial)}
              {range.partial ? <span className="note"> (same elapsed portion)</span> : null}
            </span>
            <span>
              <b>Timezone:</b> {REPORTING_TZ}
            </span>
            <span>
              <b>Tracking since:</b> {cov.firstCoreSyncAt ? fmtDateTime(cov.firstCoreSyncAt) : "not started"}
            </span>
          </div>

          <RangePicker active={key} from={from} to={to} />

          {!hasData ? (
            <div className="callout callout-info on-light">
              No completed sync yet. The first sync starts a few seconds after the server boots and takes a couple of minutes. Refresh this page
              once &quot;Last successful sync&quot; shows a time.
            </div>
          ) : null}

          <h2 className="band-title">Primary KPIs</h2>
          <div className="eyebrow">Leads</div>
          <div className="kpi-row cols-2">
            <KpiCard k={kpi("leadsAssigned")} />
            <KpiCard k={kpi("newLeads")} />
          </div>
        </div>
      </section>

      <section className="band band-dark">
        <div className="band-inner">
          <div className="eyebrow">Activity</div>
          <div className="kpi-row cols-2">
            <KpiCard
              k={kpi("callsMade")}
              chart={
                <LineChart
                  height={200}
                  series={[
                    { label: `Calls ${per}`, color: chartSeries[0], points: calls.points.map((p) => ({ label: p.label, value: p.count })), format: "count" },
                    ...(calls.prior
                      ? [{ label: `${priorLabel} (aligned by ${alignedBy})`, color: "var(--series-prior)", points: calls.prior.map((p) => ({ label: p.label, value: p.count })), format: "count" as const, muted: true }]
                      : []),
                  ]}
                />
              }
            />
            <KpiCard
              k={kpi("talkTime")}
              chart={
                <BarChart
                  height={200}
                  points={talk.points}
                  prior={talk.prior}
                  priorLabel={`${priorLabel} (aligned by ${alignedBy})`}
                  color={chartSeries[0]}
                  unit={`recorded minutes ${per}`}
                  format="minutes"
                />
              }
            />
          </div>
        </div>
      </section>

      <section className="band band-light">
        <div className="band-inner">
          <div className="eyebrow">Appointments</div>
          <div className="kpi-row cols-4">
            <KpiCard k={kpi("appointmentsBooked")} />
            <KpiCard k={kpi("appointmentsCompleted")} />
            <KpiCard k={confirmed} />
            <KpiCard k={cancelled} />
          </div>
        </div>
      </section>

      <section className="band band-dark">
        <div className="band-inner">
          <div className="eyebrow">Submissions</div>
          <div className="kpi-row cols-3">
            {kpiMilestones.map(({ m, series }) => (
              <MilestoneKpiCard key={m.key} m={m} series={series} title={milestoneTitle[m.key]} subtitle={milestoneSubtitle(m.key, m)} />
            ))}
          </div>
          <div className="kpi-row cols-1">
            <SubmissionsCard s={submissions} />
          </div>
        </div>
      </section>

      <div className="page">
        <section>
          <h2>Program milestones</h2>
          <p className="note">
            Each card counts contacts reaching the milestone during the selected range (an event), with the current number sitting in the
            stage shown separately (a snapshot). Never add the three cards of a program together: one opportunity can pass through all three.
          </p>
          <h3>Army CA · FY27</h3>
          <div className="grid grid-3">
            {milestones
              .filter((m) => m.program === "army")
              .map((m) => (
                <MilestoneCard key={m.key} m={m} />
              ))}
          </div>
          <h3>Veteran G.I. Bill · FS2</h3>
          <div className="grid grid-3">
            {milestones
              .filter((m) => m.program === "veteran")
              .map((m) => (
                <MilestoneCard key={m.key} m={m} />
              ))}
          </div>
        </section>

        <WonSection report={won} />

        <section>
          <h2>Charts</h2>
          <div className="grid grid-2">
            <div className="card">
              <div className="chart-head">
                <div>
                  <div className="label">New Leads over time</div>
                  <div className="note">
                    {range.label}, {leadsSeries.grouping === "daily" ? "per day" : leadsSeries.grouping === "hourly" ? "per hour" : "per week (range longer than 92 days)"} ·
                    contact creation date
                  </div>
                </div>
                <div className="stat-value">{leadsSeries.total.toLocaleString("en-US")}</div>
              </div>
              <BarChart points={leadsSeries.points} color={chartSeries[0]} unit="new leads" height={220} />
            </div>
            <div className="card">
              <div className="chart-head">
                <div>
                  <div className="label">Program funnels · currently in stage</div>
                  <div className="note">Snapshot of opportunities sitting in each milestone stage now, all statuses and fiscal years. Not achievements.</div>
                </div>
                <div>
                  <span className="legend">
                    <span className="legend-swatch" style={{ background: chartSeries[0] }} /> {funnels[0]?.label}
                  </span>
                  {"  "}
                  <span className="legend">
                    <span className="legend-swatch" style={{ background: chartSeries[1] }} /> {funnels[1]?.label}
                  </span>
                </div>
              </div>
              <div className="grid grid-2">
                {funnels.map((f, i) => (
                  <div key={f.program}>
                    <h3 style={{ marginTop: 4 }}>{f.label}</h3>
                    <FunnelChart funnel={f} color={chartSeries[i] ?? chartSeries[0]} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

// Executive scorecard (brief section 3). Reads the local cache only.

import { latestSyncRuns } from "@/lib/db";
import { fmtDateTime, fmtRange, isRangeKey, REPORTING_TZ, resolveRange, type RangeKey } from "@/lib/dates";
import { computePrimaryKpis, coverage, kpiNewLeads } from "@/lib/metrics";
import { computeMilestones } from "@/lib/milestones";
import { CORE_SYNC_KIND } from "@/lib/sync/core";
import KpiCard from "./KpiCard";
import MilestoneCard from "./MilestoneCard";
import RangePicker from "./RangePicker";

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
  const milestones = computeMilestones(range);
  const hasData = Boolean(cov.lastCoreSyncOkAt);

  return (
    <>
      <h1>Executive Scorecard</h1>
      <p className="lead">Veteran Careers Network sales performance from Go High Level. Opportunity values are shown as Opportunity Value, never revenue.</p>

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
        <div className="callout callout-info">
          No completed sync yet. The first sync starts a few seconds after the server boots and takes a couple of minutes. Refresh this page
          once &quot;Last successful sync&quot; shows a time.
        </div>
      ) : null}

      <section>
        <h2>Primary KPIs</h2>
        <div className="grid grid-3">
          {kpis.map((k) => (
            <KpiCard key={k.key} k={k} />
          ))}
        </div>
      </section>

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
    </>
  );
}

// Executive scorecard (brief section 3). Reads the local cache only.

import { latestSyncRuns } from "@/lib/db";
import { fmtDateTime, fmtRange, isRangeKey, REPORTING_TZ, resolveRange, type RangeKey } from "@/lib/dates";
import { computePrimaryKpis, coverage, kpiNewLeads } from "@/lib/metrics";
import { CORE_SYNC_KIND } from "@/lib/sync/core";
import KpiCard from "./KpiCard";
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
    </>
  );
}

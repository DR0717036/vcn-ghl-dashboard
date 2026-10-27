// Rep dashboard (owner request 2026-10-26): what one sales rep sees after
// signing in. A rep only ever gets their own figures; an admin opens the
// same page for any rep with ?as=<GHL user id> ("View as rep" on the Rep
// Performance section). Same design system as the scorecard: sticky control
// bar, alternating bands, dock. Every number comes from the functions the
// team scorecard uses, filtered to this rep. Reads the local cache only.

import { getState, latestSyncRuns } from "@/lib/db";
import { fmtDateTime, fmtRange, isRangeKey, resolveRange, type RangeKey } from "@/lib/dates";
import { requireRepView } from "@/lib/me/context";
import { computeRepScorecard } from "@/lib/me/scorecard";
import { coverage } from "@/lib/metrics";
import { CORE_SYNC_KIND } from "@/lib/sync/core";
import { explainSyncSummary, runningTooLong } from "@/lib/syncStatus";
import BandHeading from "../BandHeading";
import ControlBar from "../ControlBar";
import Dock from "../Dock";
import Motion from "../Motion";
import RangePicker from "../RangePicker";
import Reveal from "../Reveal";
import RepHeader from "./RepHeader";
import ScorecardCard from "./ScorecardCard";
import { ME_SECTIONS_LIVE } from "./sections";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function MePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const asParam = first(sp.as);
  const view = await requireRepView(asParam ? `/me?as=${encodeURIComponent(asParam)}` : "/me", asParam);
  const rangeParam = first(sp.range);
  const key: RangeKey = isRangeKey(rangeParam) ? rangeParam : "this_week";
  const from = first(sp.from);
  const to = first(sp.to);
  const now = new Date();
  const range = resolveRange(key, now, { from, to });

  const cov = coverage();
  const lastRun = latestSyncRuns(CORE_SYNC_KIND, 1)[0];
  const diskWarning = getState("disk_warning");
  const hasData = Boolean(cov.lastCoreSyncOkAt);
  const scorecard = computeRepScorecard(view.rep, now, range, (r) => fmtRange(r.start, r.end, r.partial));
  const sections = ME_SECTIONS_LIVE;

  return (
    <>
      <Reveal />
      <Motion />
      <Dock sections={sections} />
      <ControlBar>
        <div className="control-sync">
          <span>
            <b>Last successful sync:</b> {hasData ? fmtDateTime(cov.lastCoreSyncOkAt) : "never"}
          </span>
          {lastRun && lastRun.ok === 0 ? (
            <span>
              <span className="pill pill-warn">last attempt partial</span> <span title={lastRun.summary ?? undefined}>{explainSyncSummary(lastRun.summary)}</span>
            </span>
          ) : null}
          {lastRun && lastRun.ok === null ? <span className="pill pill-info">{runningTooLong(lastRun.started_at, lastRun.ok) ? "sync running over 30 min" : "sync running"}</span> : null}
          {diskWarning ? <span className="pill pill-warn">low disk space</span> : null}
          <span>
            <b>Date range:</b> {range.label}, {fmtRange(range.start, range.end, range.partial)}
          </span>
        </div>
        <RangePicker active={key} from={from} to={to} basePath="/me" />
      </ControlBar>

      {!hasData ? (
        <div className="band-inner">
          <div className="callout callout-info">No completed sync yet. Refresh this page once &quot;Last successful sync&quot; shows a time.</div>
        </div>
      ) : null}

      <section className="band band-dark" id={sections[0].id}>
        <div className="band-inner">
          <RepHeader view={view} />
          <BandHeading s={sections[0]} />
          <div className="kpi-row cols-1">
            <ScorecardCard s={scorecard} name={view.name} />
          </div>
        </div>
      </section>
    </>
  );
}

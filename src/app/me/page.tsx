// Rep dashboard (owner request 2026-10-26): what one sales rep sees after
// signing in. A rep only ever gets their own figures; an admin opens the
// same page for any rep with ?as=<GHL user id> ("View as rep" on the Rep
// Performance section). Same design system as the scorecard: sticky control
// bar, alternating bands, dock. Every number comes from the functions the
// team scorecard uses, filtered to this rep. Reads the local cache only.

import { getState, latestSyncRuns } from "@/lib/db";
import { fmtDateTime, fmtRange, isRangeKey, resolveRange, type RangeKey } from "@/lib/dates";
import { semesterFor, semesters } from "@/lib/mapping-config";
import { computeMyAppointments } from "@/lib/me/appointments";
import { computeRepCommission } from "@/lib/me/commission";
import { requireRepView } from "@/lib/me/context";
import { computeRepLeads } from "@/lib/me/leads";
import { computeRepOverview } from "@/lib/me/overview";
import { computeRepPace } from "@/lib/me/pace";
import { computeRepPipeline } from "@/lib/me/pipeline";
import { computeRepScorecard } from "@/lib/me/scorecard";
import { computeTeamLeaderboard } from "@/lib/me/team";
import { coverage } from "@/lib/metrics";
import { heatBundle } from "@/lib/repCalls";
import { CORE_SYNC_KIND } from "@/lib/sync/core";
import { explainSyncSummary, runningTooLong } from "@/lib/syncStatus";
import BandHeading from "../BandHeading";
import ControlBar from "../ControlBar";
import Dock from "../Dock";
import Motion from "../Motion";
import RangePicker from "../RangePicker";
import Reveal from "../Reveal";
import HeatMap from "../charts/HeatMap";
import Leaderboard from "../Leaderboard";
import SemesterPicker from "../SemesterPicker";
import AppointmentsCards from "./AppointmentsCards";
import CommissionCard from "./CommissionCard";
import LeadsCards from "./LeadsCards";
import OverviewCard from "./OverviewCard";
import PaceCard from "./PaceCard";
import PipelineCard from "./PipelineCard";
import RepHeader from "./RepHeader";
import ScorecardCard from "./ScorecardCard";
import { ME_SECTIONS } from "./sections";

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
  const scorecard = computeRepScorecard(view.rep, range);
  const overview = computeRepOverview(view.rep, now);
  const pace = computeRepPace(view.rep, now);
  const commission = computeRepCommission(view.rep, now);
  const leads = computeRepLeads(view.rep, now);
  const appts = computeMyAppointments(view.rep, now);
  const pipeline = computeRepPipeline(view.rep);
  // The leaderboard shows the IAU column for the chosen semester, like the admin's (?semester=KEY; the default otherwise).
  const semester = semesterFor(first(sp.semester));
  const team = computeTeamLeaderboard(range, now, semester);
  const heat = heatBundle(range, (u) => u === view.userId);
  const sections = ME_SECTIONS;
  const semesterOptions = semesters().map((s) => ({ key: s.key, label: s.label, isDefault: Boolean(s.default) }));

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
          <span>
            <b>Compared with:</b> {fmtRange(range.prevStart, range.prevEnd, range.partial)}
            {range.partial ? " (same elapsed portion)" : ""}
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
            <OverviewCard o={overview} />
          </div>
        </div>
      </section>

      <section className="band band-light" id={sections[1].id}>
        <div className="band-inner">
          <BandHeading s={sections[1]} />
          <div className="kpi-row cols-1">
            <PaceCard p={pace} />
          </div>
        </div>
      </section>

      <section className="band band-dark" id={sections[2].id}>
        <div className="band-inner">
          <BandHeading s={sections[2]} />
          <div className="kpi-row cols-1">
            <ScorecardCard s={scorecard} name={view.name} rangeText={fmtRange(range.start, range.end, range.partial)} prevText={fmtRange(range.prevStart, range.prevEnd, range.partial)} />
          </div>
        </div>
      </section>

      <section className="band band-light" id={sections[3].id}>
        <div className="band-inner">
          <BandHeading s={sections[3]} />
          <div className="kpi-row cols-1">
            <CommissionCard c={commission} invoicesHref={view.viewingAs ? `/invoices?as=${encodeURIComponent(view.userId)}` : "/invoices"} />
          </div>
        </div>
      </section>

      <section className="band band-dark" id={sections[4].id}>
        <div className="band-inner">
          <BandHeading s={sections[4]} />
          <LeadsCards d={leads} />
        </div>
      </section>

      <section className="band band-light" id={sections[5].id}>
        <div className="band-inner">
          <BandHeading s={sections[5]} />
          <AppointmentsCards d={appts} />
        </div>
      </section>

      <section className="band band-dark" id={sections[6].id}>
        <div className="band-inner">
          <BandHeading s={sections[6]} />
          <PipelineCard d={pipeline} />
        </div>
      </section>

      <section className="band band-light" id={sections[7].id}>
        <div className="band-inner">
          <BandHeading s={sections[7]} />
          <div className="me-toolbar">
            <SemesterPicker options={semesterOptions} active={semester.key} hint="Switches the IAU App column of the leaderboard to the chosen semester." basePath="/me" anchor="me-leaderboard" />
          </div>
          <Leaderboard data={team} rangeLabel={range.label} highlight={view.userId} viewAs={view.viewer.role === "admin"} />
        </div>
      </section>

      <section className="band band-dark" id={sections[8].id}>
        <div className="band-inner">
          <BandHeading s={sections[8]} />
          <div className="kpi-row cols-1">
            <div className="stat kpi kpi-title-xl reveal me-card" data-kpi="me-calltimes">
              <div className="kpi-head">
                <div className="label">Best times to call</div>
                <div className="kpi-sub note">Your own outbound dials by weekday and hour · colored by the share that connected · {range.label} or the last 90 days</div>
              </div>
              <HeatMap bundle={heat} title="When your calls get answered" defaultMetric="connected" />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

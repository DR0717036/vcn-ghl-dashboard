// Rep dashboard (owner request 2026-10-26): what one sales rep sees after
// signing in. A rep only ever gets their own figures; an admin opens the
// same page for any rep with ?as=<GHL user id> ("View as rep" on the Rep
// Performance section). Same design system as the scorecard: sticky control
// bar, alternating bands, dock. Every number comes from the functions the
// team scorecard uses, filtered to this rep. Reads the local cache only.
// Section order (owner requests 2026-11-24, rounds 4 and 5): My overview, My
// submissions, My pace, My activity, My appointments, My pipeline, Team
// leaderboard. My commission and My leads were removed in round 5 (commission
// is covered by My overview, My pace, and Invoices). A rep never sees
// Opportunity Value anywhere.

import { getState, latestSyncRuns } from "@/lib/db";
import { fmtDateTime, fmtRange, isRangeKey, resolveRange, type RangeKey } from "@/lib/dates";
import { semesterFor, semesterQuery, semesters } from "@/lib/mapping-config";
import { computeRepActivity } from "@/lib/me/activity";
import { computeRepAppointmentSection } from "@/lib/me/appointments";
import { requireRepView } from "@/lib/me/context";
import { computeRepOverview } from "@/lib/me/overview";
import { computeRepPace } from "@/lib/me/pace";
import { computeRepPipeline } from "@/lib/me/pipeline";
import { computeMySubmissions } from "@/lib/me/submissions";
import { computeNeedsCall } from "@/lib/needsCall";
import { attendanceForNow } from "@/lib/payroll/attendance";
import { repInvoices } from "@/lib/payroll/invoices";
import { coverage } from "@/lib/metrics";
import { CORE_SYNC_KIND } from "@/lib/sync/core";
import { explainSyncSummary, runningTooLong } from "@/lib/syncStatus";
import BandHeading from "../BandHeading";
import ControlBar from "../ControlBar";
import Dock from "../Dock";
import Motion from "../Motion";
import RangePicker from "../RangePicker";
import Reveal from "../Reveal";
import SemesterPicker from "../SemesterPicker";
import ActivitySection from "./ActivitySection";
import AttendanceCard from "./AttendanceCard";
import InvoicesSection from "./InvoicesSection";
import AppointmentsSection from "./AppointmentsSection";
import NeedsCallCard from "./NeedsCallCard";
import OverviewCard from "./OverviewCard";
import PaceCard from "./PaceCard";
import PipelineCard from "./PipelineCard";
import RepHeader from "./RepHeader";
import SubmissionsSection from "./SubmissionsSection";
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
  // The Veteran cards of My submissions and the IAU column of the leaderboard show the chosen semester, like the admin's (?semester=KEY; the default otherwise).
  const semester = semesterFor(first(sp.semester));
  // Names the selected range (and rep, for an admin viewing as) for the rep's drilldown requests.
  const asQuery = view.viewingAs ? `&as=${encodeURIComponent(view.userId)}` : "";
  const rangeQuery = new URLSearchParams({ range: key, ...(key === "custom" && from ? { from } : {}), ...(key === "custom" && to ? { to } : {}) }).toString() + semesterQuery(semester) + asQuery;
  const mySubmissions = computeMySubmissions(view.rep, range, semester);
  const activity = computeRepActivity(view.rep, range);
  const overview = computeRepOverview(view.rep, now);
  const pace = computeRepPace(view.rep, now);
  const appts = computeRepAppointmentSection(view.rep, range, now);
  const pipeline = computeRepPipeline(view.rep);
  const needsCall = computeNeedsCall(view.rep, now);
  const attendance = attendanceForNow(view.rep, now);
  const invoices = repInvoices(view.rep, now);
  const sections = ME_SECTIONS;
  const sec = (id: string) => sections.find((s) => s.id === id)!;
  const semesterOptions = semesters().map((s) => ({ key: s.key, label: s.label, isDefault: Boolean(s.default) }));
  const semesterHint = "Switches the three Veteran cards of My submissions and the IAU App tiles of the leaderboard to the chosen semester; combined submissions always count every semester.";

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

      <section className="band band-dark" id={sec("me-overview").id}>
        <div className="band-inner">
          <RepHeader view={view} />
          <BandHeading s={sec("me-overview")} />
          <div className="kpi-row cols-1">
            <OverviewCard o={overview} asQuery={asQuery} />
          </div>
        </div>
      </section>

      <section className="band band-dark" id={sec("me-submissions").id}>
        <div className="band-inner">
          <BandHeading s={sec("me-submissions")} />
          <SubmissionsSection d={mySubmissions} rangeQuery={rangeQuery} rangeLabel={range.label} semesterOptions={semesterOptions} semesterHint={semesterHint} />
        </div>
      </section>

      <section className="band band-light" id={sec("me-pace").id}>
        <div className="band-inner">
          <BandHeading s={sec("me-pace")} />
          <div className="kpi-row cols-1">
            <PaceCard p={pace} />
          </div>
        </div>
      </section>

      <section className="band band-dark" id={sec("me-activity").id}>
        <div className="band-inner">
          <BandHeading s={sec("me-activity")} />
          <ActivitySection d={activity} rangeQuery={rangeQuery} rangeLabel={range.label} name={view.name} />
        </div>
      </section>

      <section className="band band-light" id={sec("me-appointments").id}>
        <div className="band-inner">
          <BandHeading s={sec("me-appointments")} />
          <AppointmentsSection d={appts} rangeQuery={rangeQuery} rangeLabel={range.label} />
        </div>
      </section>

      <section className="band band-dark" id={sec("me-pipeline").id}>
        <div className="band-inner">
          <BandHeading s={sec("me-pipeline")} />
          <div className="kpi-row cols-1">
            <NeedsCallCard r={needsCall} asQuery={asQuery} />
          </div>
          <PipelineCard d={pipeline} />
        </div>
      </section>

      <section className="band band-light" id={sec("me-invoices").id}>
        <div className="band-inner">
          <BandHeading s={sec("me-invoices")} />
          <div className="kpi-row cols-1">
            <AttendanceCard a={attendance} />
          </div>
          <InvoicesSection inv={invoices} asQuery={view.viewingAs ? `?as=${encodeURIComponent(view.userId)}` : ""} canSend={!view.viewingAs} name={view.name} />
        </div>
      </section>

    </>
  );
}

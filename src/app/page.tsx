// Executive scorecard (brief section 3). Reads the local cache only.
//
// Layout (owner edits rounds 2-4): a sticky glass control bar under the
// header, then full-width bands that alternate dark and light like
// intelagentmedia.com: Submissions (dark), Activity (light), Appointments
// (dark), Leads (light). Every KPI card shares one anatomy
// (src/app/KpiShell.tsx) so cards in a row line up exactly; cards fade in on
// scroll (src/app/Reveal.tsx) and lift on hover (CSS only).

import { callsSeries, milestoneSeries, talkTimeSeries } from "@/lib/charts";
import { getState, latestSyncRuns } from "@/lib/db";
import { explainSyncSummary, runningTooLong } from "@/lib/syncStatus";
import { fmtDateTime, fmtRange, isRangeKey, resolveRange, type RangeKey } from "@/lib/dates";
import { chartSeries } from "@/lib/design";
import { defaultSemester, mappingConfig, semesterFor, semesterQuery, semesters } from "@/lib/mapping-config";
import { computePrimaryKpis, coverage, kpiNewLeads } from "@/lib/metrics";
import { computeMilestoneByKey } from "@/lib/milestones";
import { computeCommission } from "@/lib/commission";
import { computeResponseTimes, computeStale } from "@/lib/conversations";
import { analyzeMessaging, inboundChannelCard, keywordCard, replyRateCard } from "@/lib/messaging";
import { computeRepCalls } from "@/lib/repCalls";
import { bookedShowedSeries, computeRates, computeRepAppointments, computeStatusCards } from "@/lib/appointments";
import { computeComparison, computeLosses, computeOutcome } from "@/lib/appointmentOutcomes";
import { buildLeads, computeAssignedByUser, computeLeadHeadlines, computeMatrix, computeOutcomes, computeSourceReport, computeStaleLeads } from "@/lib/leads";
import { computeSubmissions } from "@/lib/submissions";
import { CORE_SYNC_KIND } from "@/lib/sync/core";
import { computeCloseRates, computeCurrentPrograms, computeHeadline, computeMonthly, computePastSemesters, computeWonByCampaign, wonOpps } from "@/lib/wonRow";
import BarChart from "./charts/BarChart";
import ControlBar from "./ControlBar";
import LineChart from "./charts/LineChart";
import KpiCard from "./KpiCard";
import MilestoneKpiCard from "./MilestoneKpiCard";
import RangePicker from "./RangePicker";
import SemesterPicker from "./SemesterPicker";
import RepCallsCard from "./RepCallsCard";
import { AppointmentRatesCard, AppointmentStatusCard, BookedVsShowedCard, RepAppointmentsCard } from "./AppointmentCards";
import { AppointmentOutcomeCard, ArmyVsVeteranCard, PostAppointmentLossesCard } from "./AppointmentOutcomeCards";
import { LeadHeadlineCard, LeadMatrixCard, LeadOutcomesCard, LeadsByUserCard, LeadSourceCard, StaleLeadsCard } from "./LeadsCards";
import ResponseTimeCard from "./ResponseTimeCard";
import StaleCard from "./StaleCard";
import { InboundChannelCard, KeywordCard, ReplyRateCard } from "./MessagingCards";
import Reveal from "./Reveal";
import BandHeading from "./BandHeading";
import Motion from "./Motion";
import Dock from "./Dock";
import { SECTIONS } from "./sections";
import SubmissionsCard from "./SubmissionsCard";
import RepCards from "./RepCards";
import Leaderboard from "./Leaderboard";
import { computeRepPerformance } from "@/lib/repPerformance";
import { CloseRateCard, CurrentProgramsCard, PastSemestersCard, WonByCampaignCard, WonHeadlineCard, WonMonthlyCard } from "./WonCards";
import WonModeSwitch from "./WonModeSwitch";
import { requireAdminPage } from "@/lib/guard";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ScorecardPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  await requireAdminPage("/");
  const rangeParam = first(sp.range);
  const key: RangeKey = isRangeKey(rangeParam) ? rangeParam : "this_month";
  const from = first(sp.from);
  const to = first(sp.to);
  // Veteran semester shown on the two Veteran cards and in Program Submissions (?semester=KEY; Fall Session 2 by default).
  const semester = semesterFor(first(sp.semester));
  const now = new Date();
  const range = resolveRange(key, now, { from, to });
  // The New Leads card defaults to Today (brief 3.2) unless a range was chosen explicitly.
  const newLeadsRange = rangeParam ? range : resolveRange("today", now);

  const cov = coverage();
  const lastRun = latestSyncRuns(CORE_SYNC_KIND, 1)[0];
  const diskWarning = getState("disk_warning");
  const kpis = computePrimaryKpis(range).map((k) => (k.key === "newLeads" ? kpiNewLeads(newLeadsRange) : k));
  const kpi = (key: string) => kpis.find((k) => k.key === key)!;
  const calls = callsSeries(range);
  const talk = talkTimeSeries(range);
  const apptCards = computeStatusCards(range);
  const apptRates = computeRates(range);
  const repAppts = computeRepAppointments(range);
  const apptOutcome = computeOutcome(range);
  const apptLosses = computeLosses(range, apptOutcome);
  const apptCompare = computeComparison(range, apptRates, apptOutcome);
  const apptSeries = bookedShowedSeries(range);
  const leads = buildLeads(range);
  const leadHeadlines = computeLeadHeadlines(range);
  const leadMatrix = computeMatrix(leads);
  const leadOutcomes = computeOutcomes(leads);
  const leadsByUser = computeAssignedByUser(leads);
  const staleLeads = computeStaleLeads(leads);
  const leadsBySource = computeSourceReport(leads, "source");
  const leadsByCampaign = computeSourceReport(leads, "campaign");
  // KPI-row milestone cards, in the owner's order: CA 101, Supervisor Approval, then IAU App Submitted and Accepted
  // for the selected semester (FS2 by default, Spring Session 1 via the dropdown). FS1 stays tracked in config
  // (kpiMilestones) as a historical group but has no card (round 3).
  const kpiMilestoneRows = [
    ["army_ca101", "army_supervisor_approval"],
    [semester.submittedKey, semester.acceptedKey],
  ];
  const kpiMilestoneKeys = kpiMilestoneRows.flat();
  const kpiMilestones = kpiMilestoneKeys
    .map((key) => {
      const m = computeMilestoneByKey(key, range);
      const mapping = [...mappingConfig.kpiMilestones, ...mappingConfig.milestones].find((x) => x.key === key);
      return m && mapping ? { m, series: milestoneSeries(mapping, range) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const submissions = computeSubmissions(range, semester);
  const repCalls = computeRepCalls(range);
  const stale = computeStale(now);
  const responseTimes = computeResponseTimes(range);
  const messaging = analyzeMessaging(range);
  const optOuts = keywordCard(messaging, "optout");
  const interest = keywordCard(messaging, "interest");
  const replyRateSms = replyRateCard(messaging, "sms");
  const replyRateEmail = replyRateCard(messaging, "email");
  const inboundChannel = inboundChannelCard(messaging);
  // Commission on the events inside the selected range (quota and Won (MTD) stay month-to-date).
  const commission = computeCommission(range, now);
  // Won row: both modes are computed so the client toggle can switch without a request.
  const wonMonthly = computeMonthly(now);
  const wonModes = (["current", "period"] as const).map((mode) => {
    const opps = wonOpps(mode, range);
    return { mode, headline: computeHeadline(opps, mode, range), programs: computeCurrentPrograms(opps, mode), past: computePastSemesters(opps, mode), campaign: computeWonByCampaign(opps, mode) };
  });
  const wonCloseRates = computeCloseRates();
  const wonBlock = (mode: "current" | "period") => {
    const w = wonModes.find((x) => x.mode === mode)!;
    return (
      <>
        <div className="kpi-row cols-1">
          <WonHeadlineCard h={w.headline} mode={mode} rangeQuery={rangeQuery} rangeLabel={range.label} />
        </div>
        <div className="kpi-row cols-1">
          <WonMonthlyCard m={wonMonthly} />
        </div>
        <div className="kpi-row cols-2 kpi-row-top">
          <CurrentProgramsCard c={w.programs} mode={mode} rangeQuery={rangeQuery} rangeLabel={range.label} />
          <PastSemestersCard p={w.past} mode={mode} rangeQuery={rangeQuery} rangeLabel={range.label} />
        </div>
        <div className="kpi-row cols-1">
          <WonByCampaignCard w={w.campaign} mode={mode} rangeQuery={rangeQuery} rangeLabel={range.label} />
        </div>
      </>
    );
  };
  const hasData = Boolean(cov.lastCoreSyncOkAt);
  const per = calls.grouping === "hourly" ? "per hour" : calls.grouping === "daily" ? "per day" : "per week";
  const priorLabel = range.key === "this_week" || range.key === "last_week" ? "prior week" : "prior period";
  const alignedBy = calls.grouping === "hourly" ? "hour" : "day";
  // Names the selected range for drilldown requests (same keys the page itself reads).
  const rangeQuery = new URLSearchParams({ range: key, ...(key === "custom" && from ? { from } : {}), ...(key === "custom" && to ? { to } : {}) }).toString() + semesterQuery(semester);
  const repPerf = computeRepPerformance({ range, now, repCalls, repAppts, submissions, commission, responseTimes, leadsByUser, rangeQuery, rangeLabel: range.label });

  const milestoneTitle: Record<string, string> = {
    army_ca101: "Army CA 101 Submissions",
    army_supervisor_approval: "Awaiting Supervisor Approval",
    [semester.submittedKey]: `${semester.short} Application Submissions`,
    [semester.acceptedKey]: `${semester.short} Accepted`,
  };
  const milestoneSubtitle = (k: string, m: { reportingGroup: string; stageName: string }) =>
    k === "army_ca101"
      ? `Army CA · ${m.reportingGroup} · "${m.stageName}" · reached in period`
      : k === "army_supervisor_approval"
        ? `Army CA · ${m.reportingGroup} · awaiting approval · entered in period`
        : k === semester.acceptedKey
          ? `Veteran G.I. Bill · ${semester.label} (${m.reportingGroup}) · accepted in period`
          : `Veteran G.I. Bill · ${semester.label} (${m.reportingGroup}) · "${m.stageName}" · reached in period`;
  const semesterOptions = semesters().map((s) => ({ key: s.key, label: s.label, isDefault: Boolean(s.default) }));
  const semesterHint =
    "Switches both Veteran G.I. Bill cards, the IAU column of Program Submissions, and their drilldowns to the chosen semester. " +
    defaultSemester().label +
    " is the default; the choice is kept in the page address, so a shared link opens on the same semester.";

  return (
    <>
      <Reveal />
      <Motion />
      <Dock />
      <ControlBar>
        <div className="control-sync">
          <span>
            <b>Last successful sync:</b> {hasData ? fmtDateTime(cov.lastCoreSyncOkAt) : "never"}
          </span>
          {lastRun && lastRun.ok === 0 ? (
            <span>
              <span className="pill pill-warn">last attempt partial</span>{" "}
              <span title={lastRun.summary ?? undefined}>{explainSyncSummary(lastRun.summary)} Details on the Mapping page.</span>
            </span>
          ) : null}
          {lastRun && lastRun.ok === null ? (
            runningTooLong(lastRun.started_at, lastRun.ok) ? (
              <span>
                <span className="pill pill-warn">sync running over 30 min</span>{" "}
                <span title="A run normally finishes in a few minutes and self-stops at 20. Still running past 30 minutes means the server is wedged; it clears on the next deploy or within the hour. See the Mapping page.">taking longer than expected</span>
              </span>
            ) : (
              <span className="pill pill-info">sync running</span>
            )
          ) : null}
          {diskWarning ? (
            <span>
              <span className="pill pill-warn">low disk space</span> <span title={diskWarning}>see mapping page</span>
            </span>
          ) : null}
          <span>
            <b>Date range:</b> {range.label}, {fmtRange(range.start, range.end, range.partial)}
          </span>
          <span>
            <b>Compared with:</b> {fmtRange(range.prevStart, range.prevEnd, range.partial)}
            {range.partial ? " (same elapsed portion)" : ""}
          </span>
        </div>
        <RangePicker active={key} from={from} to={to} />
      </ControlBar>

      {!hasData ? (
        <div className="band-inner">
          <div className="callout callout-info">
            No completed sync yet. The first sync starts a few seconds after the server boots; on a fresh cache it can take 30 to 60 minutes
            because it loads the full history from GHL. Refresh this page once &quot;Last successful sync&quot; shows a time.
            {lastRun && lastRun.ok === 0 ? <> The last attempt did not finish: {explainSyncSummary(lastRun.summary)}</> : null}
          </div>
        </div>
      ) : null}

      <section className="band band-dark" id={SECTIONS[0].id}>
        <div className="band-inner">
          <h1 className="page-title">Primary KPIs Overall</h1>
          <BandHeading s={SECTIONS[0]} />
          {kpiMilestoneRows.map((keys) => (
            <div key={keys.join("+")} className="kpi-row cols-2">
              {kpiMilestones
                .filter(({ m }) => keys.includes(m.key))
                .map(({ m, series }) => (
                  <MilestoneKpiCard
                    key={m.key}
                    m={m}
                    series={series}
                    title={milestoneTitle[m.key]}
                    subtitle={milestoneSubtitle(m.key, m)}
                    rangeQuery={rangeQuery}
                    rangeLabel={range.label}
                    headRight={m.key === semester.submittedKey ? <SemesterPicker options={semesterOptions} active={semester.key} hint={semesterHint} /> : undefined}
                  />
                ))}
            </div>
          ))}
          <div className="kpi-row cols-1">
            <SubmissionsCard s={submissions} c={commission} rangeQuery={rangeQuery} rangeLabel={range.label} />
          </div>
        </div>
      </section>

      <section className="band band-light" id={SECTIONS[1].id}>
        <div className="band-inner">
          <BandHeading s={SECTIONS[1]} />
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
          <div className="kpi-row cols-1">
            <RepCallsCard r={repCalls} rangeQuery={rangeQuery} rangeLabel={range.label} />
          </div>
        </div>
      </section>

      <section className="band band-dark" id={SECTIONS[2].id}>
        <div className="band-inner">
          <BandHeading s={SECTIONS[2]} />
          <div className="kpi-row cols-1">
            <StaleCard s={stale} />
          </div>
          <div className="kpi-row cols-1">
            <ResponseTimeCard r={responseTimes} rangeQuery={rangeQuery} rangeLabel={range.label} />
          </div>
          <div className="kpi-row cols-2">
            <KeywordCard k={optOuts} rangeQuery={rangeQuery} rangeLabel={range.label} />
            <KeywordCard k={interest} rangeQuery={rangeQuery} rangeLabel={range.label} />
          </div>
          <div className="kpi-row cols-1">
            <ReplyRateCard r={replyRateSms} rangeQuery={rangeQuery} rangeLabel={range.label} />
          </div>
          <div className="kpi-row cols-1">
            <ReplyRateCard r={replyRateEmail} rangeQuery={rangeQuery} rangeLabel={range.label} />
          </div>
          <div className="kpi-row cols-1">
            <InboundChannelCard c={inboundChannel} rangeLabel={range.label} />
          </div>
        </div>
      </section>

      <section className="band band-light" id={SECTIONS[3].id}>
        <div className="band-inner">
          <BandHeading s={SECTIONS[3]} />
          <div className="kpi-row cols-4">
            <AppointmentStatusCard c={apptCards.booked} rangeQuery={rangeQuery} rangeLabel={range.label} />
            <AppointmentStatusCard c={apptCards.completed} rangeQuery={rangeQuery} rangeLabel={range.label} />
            <AppointmentStatusCard c={apptCards.confirmed} rangeQuery={rangeQuery} rangeLabel={range.label} />
            <AppointmentStatusCard c={apptCards.cancelled} rangeQuery={rangeQuery} rangeLabel={range.label} />
          </div>
          <div className="kpi-row cols-1">
            <AppointmentRatesCard r={apptRates} rangeLabel={range.label} />
          </div>
          <div className="kpi-row cols-1">
            <RepAppointmentsCard r={repAppts} rangeQuery={rangeQuery} rangeLabel={range.label} />
          </div>
          <div className="kpi-row cols-2">
            <AppointmentOutcomeCard o={apptOutcome} rangeQuery={rangeQuery} rangeLabel={range.label} />
            <PostAppointmentLossesCard l={apptLosses} rangeQuery={rangeQuery} rangeLabel={range.label} />
          </div>
          <div className="kpi-row cols-2">
            <ArmyVsVeteranCard c={apptCompare} rangeLabel={range.label} />
            <BookedVsShowedCard s={apptSeries} rangeLabel={range.label} />
          </div>
        </div>
      </section>

      <section className="band band-dark" id={SECTIONS[4].id}>
        <div className="band-inner">
          <BandHeading s={SECTIONS[4]} />
          <div className="kpi-row cols-2">
            <LeadHeadlineCard k={leadHeadlines.newLeads} s={leadHeadlines.newSeries} title="New Leads Created" subtitle={`Contacts created in period · ${range.label}`} priorLabel={priorLabel} rangeQuery={rangeQuery} rangeLabel={range.label} />
            <LeadHeadlineCard k={leadHeadlines.assigned} s={leadHeadlines.assignedSeries} title="Leads Assigned" subtitle={`Contacts assigned to a user in period · ${range.label}`} priorLabel={priorLabel} />
          </div>
          <div className="kpi-row cols-1">
            <LeadMatrixCard m={leadMatrix} rangeQuery={rangeQuery} rangeLabel={range.label} />
          </div>
          <div className="kpi-row cols-1">
            <LeadOutcomesCard o={leadOutcomes} rangeQuery={rangeQuery} rangeLabel={range.label} />
          </div>
          <div className="kpi-row cols-1">
            <LeadsByUserCard a={leadsByUser} rangeQuery={rangeQuery} rangeLabel={range.label} />
          </div>
          <div className="kpi-row cols-1">
            <StaleLeadsCard s={staleLeads} rangeQuery={rangeQuery} rangeLabel={range.label} />
          </div>
          <div className="kpi-row cols-1">
            <LeadSourceCard bySource={leadsBySource} byCampaign={leadsByCampaign} rangeQuery={rangeQuery} rangeLabel={range.label} />
          </div>
        </div>
      </section>

      <section className="band band-light" id={SECTIONS[5].id}>
        <div className="band-inner">
          <BandHeading s={SECTIONS[5]} />
          <p className="note">Won means opportunity status = won, once per opportunity ID. Dollar figures are Opportunity Value, never cash collected or commission.</p>
          <WonModeSwitch current={wonBlock("current")} period={wonBlock("period")} periodLabel={range.label} />
          <div className="kpi-row cols-1">
            <CloseRateCard c={wonCloseRates} rangeQuery={rangeQuery} />
          </div>
        </div>
      </section>

      <section className="band band-dark" id={SECTIONS[6].id}>
        <div className="band-inner">
          <BandHeading s={SECTIONS[6]} />
          <RepCards data={repPerf} rangeLabel={range.label} />
          <Leaderboard data={repPerf} rangeLabel={range.label} />
        </div>
      </section>
    </>
  );
}

// "My appointments" on the rep dashboard (owner request 2026-11-24, round
// 5): the admin Appointments band filtered to the rep. Row 1: the two lists
// with fixed windows (upcoming this week; past appointments from the last 30
// days still unmarked, oldest first). Row 2: Appointments Booked (own goal,
// calls per booking), Booking rate, Show rate (own completed goal), each
// with the prior-period change. Row 3: Appointment outcomes as a donut with
// counts; NGT entries and post-appointment losses. Row 4: Army vs Veteran
// and Booked vs Showed. Clicks open the rep's own rows from
// /api/me/drilldown. Server component; charts and modals are the existing
// client pieces the admin page uses. No Opportunity Value anywhere.

import { chartSeries, programColors } from "@/lib/design";
import { fmtDateTime } from "@/lib/dates";
import type { Split } from "@/lib/appointments";
import type { ApptRow, RepApptSection } from "@/lib/me/appointments";
import { ProgramSplit } from "../AppointmentCards";
import LineChart from "../charts/LineChart";
import PairedHBarChart from "../charts/PairedHBarChart";
import { APPT_COLUMNS, DrilldownButton, LOST_COLUMNS, MilestoneDrilldown, NGT_COLUMNS, OUTCOME_COLUMNS, type DrilldownSpec } from "../Drilldown";
import { GoalPill, GoalText } from "../GoalLine";
import KpiShell, { Delta } from "../KpiShell";
import Notes from "../Notes";
import OutcomesDonut from "./OutcomesDonut";

const ENDPOINT = "/api/me/drilldown";
const n = (v: number) => v.toLocaleString("en-US");
const DASH = "—";
const pctOf = (num: number, den: number) => (den > 0 ? `${Math.round((num / den) * 100)}%` : DASH);
const pctOrDash = (v: number | null) => (v === null ? DASH : `${Math.round(v * 100)}%`);
/** Outcome colors: fixed order from the shared palette, never the program hues (same as the admin by-rep chart). */
const OUTCOME_COLORS = { showed: chartSeries[3], noshow: chartSeries[4], cancelled: chartSeries[2], unmarked: "var(--mini-donut-gray)", upcoming: chartSeries[0] } as const;

/** Change in percentage points vs the prior period, for rate cards. */
function PointsDelta({ value, prev, reason, higherIsBetter = true }: { value: number | null; prev: number | null; reason?: string; higherIsBetter?: boolean }) {
  if (value === null || prev === null) return <span className="kpi-muted" title={reason}>Comparison unavailable</span>;
  const pts = Math.round((value - prev) * 100);
  const good = pts === 0 ? null : (pts > 0) === higherIsBetter;
  const cls = good === null ? "delta-flat" : good ? "delta-up" : "delta-down";
  return (
    <span className={cls} title={`Previous period: ${Math.round(prev * 100)}%${reason ? `. ${reason}` : ""}`}>
      {pts > 0 ? "+" : pts < 0 ? "−" : "±"}
      {Math.abs(pts)} pts vs prior{reason ? "*" : ""}
    </span>
  );
}

function ListTable({ rows, past }: { rows: ApptRow[]; past: boolean }) {
  if (rows.length === 0) return null;
  return (
    <div className="scroll kpi-body">
      <table className="stat-breakdown me-list">
        <thead>
          <tr>
            <th>Contact</th>
            <th>{past ? "Was scheduled" : "Date / time"}</th>
            <th>Program</th>
            <th>Calendar</th>
            <th>Status</th>
            {past ? <th className="num">Overdue</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                {r.ghlUrl ? (
                  <a className="me-link" href={r.ghlUrl} target="_blank" rel="noreferrer" title="Open the contact in GHL">
                    {r.name}
                  </a>
                ) : (
                  r.name
                )}
              </td>
              <td>
                {fmtDateTime(r.startTime)}
                {r.rescheduled ? <span className="plan-label">rescheduled</span> : null}
              </td>
              <td>{r.program}</td>
              <td>{r.calendar}</td>
              <td>{r.status}</td>
              {past ? <td className="num">{r.overdueDays < 1 ? `${Math.round(r.overdueDays * 24)}h` : `${n(Math.round(r.overdueDays))} day${Math.round(r.overdueDays) === 1 ? "" : "s"}`}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One row of an Army / Veteran / Total count table, with optional % of a base split. */
function SplitRow({ label, s, base, strong = false, muted = false }: { label: string; s: Split; base?: Split; strong?: boolean; muted?: boolean }) {
  const cell = (v: number, b?: number, combined = false) => (
    <td className={`num${combined ? " combined" : ""}${muted ? " note" : ""}`}>
      {n(v)}
      {base && b !== undefined ? <span className="plan-label">{pctOf(v, b)}</span> : null}
    </td>
  );
  return (
    <tr className={strong ? "row-strong" : undefined}>
      <td className={muted ? "note" : "rep-name"}>{label}</td>
      {cell(s.army, base?.army)}
      {cell(s.veteran, base?.veteran)}
      {cell(s.total, base?.total, true)}
    </tr>
  );
}

function SplitHead({ first }: { first: string }) {
  return (
    <thead>
      <tr>
        <th>{first}</th>
        <th className="num">
          <span className="stat-split-dot" style={{ background: programColors.army }} /> Army
        </th>
        <th className="num">
          <span className="stat-split-dot" style={{ background: programColors.veteran }} /> Veteran
        </th>
        <th className="num combined">Total</th>
      </tr>
    </thead>
  );
}

export default function AppointmentsSection({ d, rangeQuery, rangeLabel }: { d: RepApptSection; rangeQuery: string; rangeLabel: string }) {
  const o = d.outcomes;
  const scheduledSpec: DrilldownSpec = {
    endpoint: ENDPOINT,
    query: `kind=appt&which=scheduled&${rangeQuery}`,
    title: `Appointments scheduled in the range · ${n(o.total)}`,
    subtitle: `Appointments you host, by what happened · ${rangeLabel}`,
    expected: o.total,
    facts: [
      { label: "Showed", value: n(o.showed) },
      { label: "No-show", value: n(o.noshow) },
      { label: "Cancelled", value: n(o.cancelled) },
      { label: "Unmarked (past start)", value: n(o.unmarked) },
      { label: "Upcoming", value: n(o.upcoming) },
      { label: "Rescheduled at least once", value: n(o.rescheduled) },
    ],
    columns: APPT_COLUMNS,
    segments: [
      { key: "scheduled", label: "All scheduled", expected: o.total },
      { key: "showed", label: "Showed", expected: o.showed },
      { key: "noshow", label: "No-show", expected: o.noshow },
      { key: "cancelled", label: "Cancelled", expected: o.cancelled },
      { key: "unmarked", label: "Unmarked", expected: o.unmarked },
      { key: "upcoming", label: "Upcoming", expected: o.upcoming },
      { key: "rescheduled", label: "Rescheduled", expected: o.rescheduled },
    ],
    notes: d.notes,
    csvName: `My appointments scheduled ${rangeLabel}`,
  };
  const bookedSpec: DrilldownSpec = {
    endpoint: ENDPOINT,
    query: `kind=appt&which=booked&${rangeQuery}`,
    title: `Appointments Booked · ${n(d.booked.count)}`,
    subtitle: `Bookings created in the range with you as host · ${rangeLabel}`,
    expected: d.booked.count,
    facts: [
      { label: "Army / Veteran / Both / No tag", value: `${n(d.booked.split.army)} / ${n(d.booked.split.veteran)} / ${n(d.booked.split.both)} / ${n(d.booked.split.untagged)}` },
      { label: `Calls per booking (${d.booked.windowDays}-day window)`, value: d.booked.callsPerBooking === null ? DASH : d.booked.callsPerBooking.toFixed(1), title: `${n(d.booked.callsBefore)} of your dials across ${n(d.booked.count)} bookings.` },
    ],
    columns: APPT_COLUMNS,
    notes: d.notes,
    csvName: `My appointments booked ${rangeLabel}`,
  };
  const cohortSpec: DrilldownSpec = {
    endpoint: ENDPOINT,
    query: `kind=appt&which=cohort&${rangeQuery}`,
    title: `Appointment → Outcome · ${n(d.cohort.total.total)} contacts`,
    subtitle: `Contacts with an appointment you hosted in the range, judged as of ${fmtDateTime(d.cohort.asOf)} · ${rangeLabel}`,
    expected: d.cohort.total.total,
    columns: OUTCOME_COLUMNS,
    segments: [
      { key: "cohort", label: "Cohort", expected: d.cohort.total.total },
      { key: "showed", label: "Showed", expected: d.cohort.showed.total },
      { key: "converted", label: "Converted", expected: d.cohort.converted.total },
      { key: "won", label: "Won", expected: d.cohort.won.total },
      { key: "lost", label: "Lost", expected: d.cohort.lost.total },
    ],
    notes: d.notes,
    csvName: `My appointment outcomes ${rangeLabel}`,
  };
  const lostSpec: DrilldownSpec = {
    endpoint: ENDPOINT,
    query: `kind=appt&which=lost&${rangeQuery}`,
    title: `Lost after showing · ${n(d.losses.lostAfterShowed.total)} contacts`,
    subtitle: `Showed with you in the range, opportunity lost afterwards · ${rangeLabel}`,
    expected: d.losses.lostAfterShowed.total,
    facts: d.losses.byStage.map((s) => ({ label: `Lost from ${s.stage} (${s.pipeline})`, value: n(s.count) })),
    columns: LOST_COLUMNS,
    notes: d.notes,
    csvName: `My post-appointment losses ${rangeLabel}`,
  };
  const ngtSpec: DrilldownSpec = {
    endpoint: ENDPOINT,
    query: `kind=appt&which=ngt&${rangeQuery}`,
    title: `${d.ngt.stageName} · ${n(d.ngt.entered.total)} entries`,
    subtitle: `Your opportunities that entered the stage in the range, with what they became since · ${rangeLabel}`,
    expected: d.ngt.entered.total,
    columns: NGT_COLUMNS,
    segments: [
      { key: "entered", label: "Entered NGT", expected: d.ngt.entered.total },
      { key: "fs2", label: "IAU App (any semester)", expected: d.ngt.fs2.total },
      { key: "won", label: "Won", expected: d.ngt.won.total },
      { key: "lost", label: "Lost", expected: d.ngt.lost.total },
      { key: "open", label: "Still open", expected: d.ngt.open.total },
    ],
    notes: d.notes,
    csvName: `My NGT entries ${rangeLabel}`,
  };

  const donutSegments = [
    { key: "showed", label: "Showed", value: o.showed, color: OUTCOME_COLORS.showed },
    { key: "noshow", label: "No-show", value: o.noshow, color: OUTCOME_COLORS.noshow },
    { key: "cancelled", label: "Cancelled", value: o.cancelled, color: OUTCOME_COLORS.cancelled },
    { key: "unmarked", label: "Unmarked", value: o.unmarked, color: OUTCOME_COLORS.unmarked, tip: `${n(o.unmarked)} past start, status still open` },
    { key: "upcoming", label: "Upcoming", value: o.upcoming, color: OUTCOME_COLORS.upcoming },
    { key: "rescheduled", label: "Rescheduled (also counted above)", value: o.rescheduled, color: "currentColor", legendOnly: true, tip: `${n(o.rescheduled)} rescheduled at least once; each is also in one of the slices` },
  ].map((s) => ({ ...s, extra: pctOf(s.value, o.total) }));
  const outcomeRows: { key: keyof typeof o.byProgram; label: string }[] = [
    { key: "showed", label: "Showed" },
    { key: "noshow", label: "No-show" },
    { key: "cancelled", label: "Cancelled" },
    { key: "unmarked", label: "Unmarked (past start)" },
    { key: "upcoming", label: "Upcoming" },
    { key: "rescheduled", label: "Rescheduled at least once" },
  ];
  const per = d.series.grouping === "hourly" ? "per hour" : d.series.grouping === "daily" ? "per day" : "per week";
  const detailsBtn = (
    <button type="button" className="kpi-details-btn">
      Details
    </button>
  );

  return (
    <>
      <div className="kpi-row cols-2 kpi-row-top">
        <div className="stat kpi reveal me-card" data-kpi="me-appts-upcoming">
          <div className="kpi-head">
            <div className="label">Upcoming this week</div>
            <div className="kpi-sub note">Appointments you host from now {d.weekLabel} · fixed window</div>
          </div>
          <div className="kpi-value-row">
            <div className="kpi-value">
              <div className="stat-value">{n(d.upcoming.length)}</div>
            </div>
            <div className="kpi-pill">{d.upcoming.length === 0 ? <span className="pill pill-neutral">None scheduled</span> : <span className="pill pill-info">Scheduled</span>}</div>
          </div>
          <ListTable rows={d.upcoming} past={false} />
        </div>
        <div className="stat kpi reveal me-card" data-kpi="me-appts-mark">
          <div className="kpi-head">
            <div className="label">Mark the outcome</div>
            <div className="kpi-sub note">Past appointments still Confirmed · last {d.lookbackDays} days, oldest first · set Showed or No-show in GHL</div>
          </div>
          <div className="kpi-value-row">
            <div className="kpi-value">
              <div className="stat-value">{n(d.toMark.length)}</div>
            </div>
            <div className="kpi-pill">{d.toMark.length === 0 ? <span className="pill pill-ok">All marked</span> : <span className="pill pill-warn">Needs marking</span>}</div>
          </div>
          <ListTable rows={d.toMark} past />
        </div>
      </div>

      <div className="kpi-row cols-3">
        <MilestoneDrilldown spec={bookedSpec}>
          <KpiShell
            id="me-appts-booked"
            className="kpi-clickable me-card"
            title="Appointments Booked"
            subtitle={`Bookings created in period with you as host · ${rangeLabel}`}
            value={
              <>
                <div className="stat-value">{n(d.booked.count)}</div>
                <ProgramSplit army={d.booked.split.army} veteran={d.booked.split.veteran} />
              </>
            }
            pill={<GoalPill goal={d.booked.goal} value={d.booked.count} />}
            goalLine={<GoalText goal={d.booked.goal} value={d.booked.count} />}
            deltaLine={<Delta value={d.booked.count} prev={d.booked.prev} reason={d.booked.prevReason} />}
            body={
              <div className="kpi-line">
                <span className="kpi-muted" title={`${n(d.booked.callsBefore)} of your outbound dials to the booked contacts in the ${d.booked.windowDays} days before each booking`}>
                  Calls per booking: <b>{d.booked.callsPerBooking === null ? DASH : d.booked.callsPerBooking.toFixed(1)}</b>
                  {d.booked.prevCallsPerBooking !== null ? ` · prior ${d.booked.prevCallsPerBooking.toFixed(1)}` : ""} · {d.booked.windowDays}-day window
                </span>
              </div>
            }
            footer={detailsBtn}
          />
        </MilestoneDrilldown>
        <MilestoneDrilldown spec={bookedSpec}>
          <KpiShell
            id="me-appts-booking-rate"
            className="kpi-clickable me-card"
            title="Booking rate"
            subtitle={`Bookings as host ÷ your outbound dials · ${rangeLabel}`}
            value={<div className="stat-value">{pctOrDash(d.bookingRate.value)}</div>}
            pill={<span className="pill pill-neutral">Goal not set</span>}
            goalLine={
              <span className="kpi-muted">
                {n(d.bookingRate.bookings)} booking{d.bookingRate.bookings === 1 ? "" : "s"} ÷ {n(d.bookingRate.dials)} dials
              </span>
            }
            deltaLine={<PointsDelta value={d.bookingRate.value} prev={d.bookingRate.prev} reason={d.bookingRate.prevReason} />}
            footer={detailsBtn}
          />
        </MilestoneDrilldown>
        <MilestoneDrilldown spec={scheduledSpec}>
          <KpiShell
            id="me-appts-show-rate"
            className="kpi-clickable me-card"
            title="Show rate"
            subtitle={`Showed ÷ (Showed + No-show), scheduled in period, you as host · ${rangeLabel}`}
            value={<div className="stat-value">{pctOrDash(d.showRate.value)}</div>}
            pill={<GoalPill goal={d.showRate.goal} value={d.showRate.showed} />}
            goalLine={
              <span>
                Showed goal: <GoalText goal={d.showRate.goal} value={d.showRate.showed} />
              </span>
            }
            deltaLine={<PointsDelta value={d.showRate.value} prev={d.showRate.prev} reason={d.showRate.prevReason} />}
            body={
              <div className="kpi-line">
                <span className="kpi-muted">
                  {n(d.showRate.showed)} showed · {n(d.showRate.noshow)} no-show · goal applies to Showed
                </span>
              </div>
            }
            footer={detailsBtn}
          />
        </MilestoneDrilldown>
      </div>

      <div className="kpi-row cols-2">
        <KpiShell
          id="me-appts-outcomes"
          className="kpi-title-xl me-card"
          title="Appointment outcomes"
          subtitle={`Appointments you host, scheduled in period, by what happened · ${rangeLabel}`}
          value={
            <div className="stat-pair">
              <div>
                <div className="stat-value">{n(o.total)}</div>
                <div className="note">Scheduled</div>
              </div>
              <div>
                <div className="stat-value">{n(o.showed)}</div>
                <div className="note">Showed</div>
              </div>
            </div>
          }
          pill={o.unmarked > 0 ? <span className="pill pill-warn">{n(o.unmarked)} unmarked</span> : <span className="pill pill-ok">All marked</span>}
          goalLine={
            <span className="kpi-muted">
              Showed {n(o.showed)} · No-show {n(o.noshow)} · Cancelled {n(o.cancelled)} · Unmarked {n(o.unmarked)} · Upcoming {n(o.upcoming)}
            </span>
          }
          deltaLine={
            <span className="kpi-muted" title="GHL stamps rescheduledAt when an appointment's time is changed; these appointments are also in one of the buckets above.">
              Rescheduled at least once: <b>{n(o.rescheduled)}</b> of {n(o.total)}
            </span>
          }
          chart={
            <div className="me-donut-wrap">
              <OutcomesDonut segments={donutSegments} total={o.total} spec={scheduledSpec} />
            </div>
          }
          body={
            <div className="kpi-body">
              <table className="stat-breakdown rep-table rep-table-cohort">
                <colgroup>
                  <col className="col-name" />
                  <col className="col-num" />
                  <col className="col-num" />
                  <col className="col-num" />
                </colgroup>
                <SplitHead first="Outcome by program" />
                <tbody>
                  {outcomeRows.map((row) => (
                    <SplitRow key={row.key} label={row.label} s={o.byProgram[row.key]} base={{ army: o.byProgram.showed.army + o.byProgram.noshow.army + o.byProgram.cancelled.army + o.byProgram.unmarked.army + o.byProgram.upcoming.army, veteran: o.byProgram.showed.veteran + o.byProgram.noshow.veteran + o.byProgram.cancelled.veteran + o.byProgram.unmarked.veteran + o.byProgram.upcoming.veteran, both: 0, untagged: 0, total: o.total }} muted={row.key === "rescheduled"} />
                  ))}
                </tbody>
              </table>
            </div>
          }
          footer={<DrilldownButton spec={scheduledSpec} label="View appointments" />}
        />
        <KpiShell
          id="me-appts-losses"
          className="kpi-title-xl me-card"
          title="NGT and post-appointment losses"
          subtitle={`Direct bookings into ${d.ngt.stageName} and contacts lost after showing with you · ${rangeLabel}`}
          value={
            <div className="stat-pair">
              <div>
                <div className="stat-value">{n(d.ngt.entered.total)}</div>
                <div className="note">NGT direct-booked</div>
              </div>
              <div>
                <div className="stat-value">{n(d.losses.lostAfterShowed.total)}</div>
                <div className="note">Lost after showing</div>
              </div>
            </div>
          }
          pill={<span className="pill pill-neutral">Goal not set</span>}
          goalLine={
            <span>
              Lost after showing: <b>{pctOf(d.losses.lostAfterShowed.total, d.losses.showedContacts.total)}</b> of {n(d.losses.showedContacts.total)} who showed with you
            </span>
          }
          deltaLine={
            <span className="kpi-muted">
              NGT: {n(d.ngt.entered.total)} entered · IAU App {n(d.ngt.fs2.total)} · won {n(d.ngt.won.total)} · lost {n(d.ngt.lost.total)} · open {n(d.ngt.open.total)}
            </span>
          }
          body={
            <div className="kpi-body">
              <table className="stat-breakdown rep-table rep-table-cohort">
                <colgroup>
                  <col className="col-name" />
                  <col className="col-num" />
                  <col className="col-num" />
                  <col className="col-num" />
                </colgroup>
                <SplitHead first="After showing with you" />
                <tbody>
                  <SplitRow label="Contacts who showed (scheduled in period)" s={d.losses.showedContacts} />
                  <SplitRow label="…lost after the appointment" s={d.losses.lostAfterShowed} base={d.losses.showedContacts} strong />
                </tbody>
              </table>
              {d.losses.byStage.length > 0 ? <div className="note cohort-stages">Lost from: {d.losses.byStage.map((s) => `${s.stage} ${n(s.count)}`).join(" · ")}</div> : null}
              <div className="cohort-sub-actions">
                <DrilldownButton spec={lostSpec} label="View lost contacts" />
                <DrilldownButton spec={cohortSpec} label="View the cohort" />
              </div>
              <div className="label kpi-notes-title">{d.ngt.stageName} · your opportunities, entered in period</div>
              <table className="stat-breakdown rep-table rep-table-cohort">
                <colgroup>
                  <col className="col-name" />
                  <col className="col-num" />
                  <col className="col-num" />
                  <col className="col-num" />
                </colgroup>
                <SplitHead first="Since entering NGT" />
                <tbody>
                  <SplitRow label="Entered the stage in period" s={d.ngt.entered} strong />
                  <SplitRow label="→ IAU App Submitted (any semester)" s={d.ngt.fs2} base={d.ngt.entered} />
                  <SplitRow label="→ Won" s={d.ngt.won} base={d.ngt.entered} />
                  <SplitRow label="→ Lost" s={d.ngt.lost} base={d.ngt.entered} />
                  <SplitRow label="Still open (none of the three)" s={d.ngt.open} base={d.ngt.entered} muted />
                </tbody>
              </table>
              <div className="cohort-sub-actions">
                <DrilldownButton spec={ngtSpec} label="View NGT entries" />
              </div>
            </div>
          }
        />
      </div>

      <div className="kpi-row cols-2">
        <KpiShell
          id="me-appts-compare"
          className="kpi-title-xl me-card"
          title="Army vs Veteran"
          subtitle={`Your appointments by the contact's program · ${rangeLabel}`}
          value={
            <div className="stat-pair">
              <div>
                <div className="stat-value" style={{ color: programColors.army }}>
                  {n(d.booked.split.army)}
                </div>
                <div className="note">Army booked</div>
              </div>
              <div>
                <div className="stat-value" style={{ color: programColors.veteran }}>
                  {n(d.booked.split.veteran)}
                </div>
                <div className="note">Veteran booked</div>
              </div>
            </div>
          }
          pill={<span className="pill pill-neutral">Goal not set</span>}
          goalLine={<span className="kpi-muted">Converted: {pctOrDash(d.cohort.conversionRate)} of {n(d.cohort.withHistory.total)} cohort contacts with history · Won: {n(d.cohort.won.total)} of {n(d.cohort.total.total)}</span>}
          deltaLine={<span className="kpi-muted">Both / No tag contacts count in the totals only; hover a bar for the detail.</span>}
          chart={<PairedHBarChart height={250} seriesA={{ label: "Army", color: programColors.army }} seriesB={{ label: "Veteran", color: programColors.veteran }} rows={d.compare.map((r) => ({ label: r.label, a: r.army, b: r.veteran, aDetail: r.aDetail, bDetail: r.bDetail, muted: r.muted }))} />}
          footer={<DrilldownButton spec={cohortSpec} label="View the cohort" />}
        />
        <KpiShell
          id="me-appts-booked-showed"
          className="kpi-title-xl me-card"
          title="Booked vs Showed"
          subtitle={`Bookings created and appointments showed ${per}, you as host · ${rangeLabel}`}
          value={
            <div className="stat-pair">
              <div>
                <div className="stat-value">{n(d.series.bookedTotal)}</div>
                <div className="note">Booked</div>
              </div>
              <div>
                <div className="stat-value">{n(d.series.showedTotal)}</div>
                <div className="note">Showed</div>
              </div>
            </div>
          }
          pill={<span className="pill pill-neutral">Goal not set</span>}
          goalLine={<span className="kpi-muted">Booked by booking time · Showed by scheduled time</span>}
          deltaLine={<span className="kpi-muted">Totals equal the Appointments Booked card and the Showed count above.</span>}
          chart={
            <LineChart
              height={250}
              leftLabel="Appointments"
              series={[
                { label: `Booked ${per}`, color: OUTCOME_COLORS.upcoming, points: d.series.booked.map((p) => ({ label: p.label, value: p.count })), format: "count" },
                { label: `Showed ${per}`, color: OUTCOME_COLORS.showed, points: d.series.showed.map((p) => ({ label: p.label, value: p.count })), format: "count" },
              ]}
            />
          }
        />
      </div>

      <details className="kpi-details rep-notes">
        <summary>How this is counted</summary>
        <div className="kpi-details-body">
          <Notes notes={d.notes} />
        </div>
      </details>
    </>
  );
}

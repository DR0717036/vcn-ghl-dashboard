// The Appointments row (owner request 2026-10-17): four status cards split
// by program, the rates card, and the rep appointments table. Same card
// anatomy, drilldown modal, and CSV pattern as the Submissions row.

import { chartSeries, programColors } from "@/lib/design";
import { pct, TAG_CLASS_LABEL, type BookedShowedSeries, type RateLine, type RatesResult, type RepApptRow, type RepApptsResult, type StatusCardResult } from "@/lib/appointments";
import GroupedBarChart from "./charts/GroupedBarChart";
import LineChart from "./charts/LineChart";
import MiniDonut from "./charts/MiniDonut";
import { APPT_COLUMNS, CONFIRMED_COLUMNS, MilestoneDrilldown, RepDrilldownRow, type DrilldownSpec } from "./Drilldown";
import { GoalPill, GoalText, StatusPill } from "./GoalLine";
import KpiShell, { Delta } from "./KpiShell";

const n = (v: number) => v.toLocaleString("en-US");
const DASH = "—";

/** Army and Veteran side by side under the total, colored by program. */
export function ProgramSplit({ army, veteran, armyTitle, veteranTitle }: { army: number; veteran: number; armyTitle?: string; veteranTitle?: string }) {
  return (
    <div className="stat-split">
      <div title={armyTitle}>
        <span className="stat-split-dot" style={{ background: programColors.army }} />
        <span className="stat-split-value">{n(army)}</span>
        <span className="stat-split-label">Army</span>
      </div>
      <div title={veteranTitle}>
        <span className="stat-split-dot" style={{ background: programColors.veteran }} />
        <span className="stat-split-value">{n(veteran)}</span>
        <span className="stat-split-label">Veteran</span>
      </div>
    </div>
  );
}

// ---- 1. status cards --------------------------------------------------------------------------

export function AppointmentStatusCard({ c, rangeQuery, rangeLabel, className = "" }: { c: StatusCardResult; rangeQuery: string; rangeLabel: string; className?: string }) {
  const army = c.byPipeline ? c.byPipeline.army : c.split.army;
  const veteran = c.byPipeline ? c.byPipeline.veteran : c.split.veteran;
  const splitTitle = c.byPipeline ? "pipeline" : "contact tag";
  // donut: Army and Veteran as on the headline (pipeline for the snapshot, tag otherwise), Both and No tag as thin gray slices
  const other = c.byPipeline ? Math.max(0, c.split.total - army - veteran) : 0;
  const donutSegments = [
    { label: "Army", value: army, color: programColors.army },
    { label: "Veteran", value: veteran, color: programColors.veteran },
    ...(c.byPipeline ? [{ label: "Neither pipeline", value: other, color: "var(--mini-donut-gray)" }] : [{ label: "Both (army + veteran)", value: c.split.both, color: "var(--mini-donut-gray)" }, { label: "No tag", value: c.split.untagged, color: "var(--mini-donut-gray-2)" }]),
  ];
  const donutSum = donutSegments.reduce((s, x) => s + x.value, 0);
  const armyShare = donutSum > 0 ? `${Math.round((army / donutSum) * 100)}%` : "—";
  const headline = (
    <div className="stat-with-donut">
      <div className="stat-with-donut-text">
        <div className="stat-value">{n(c.split.total)}</div>
        <ProgramSplit army={army} veteran={veteran} armyTitle={`Army by ${splitTitle}`} veteranTitle={`Veteran by ${splitTitle}`} />
      </div>
      <MiniDonut segments={donutSegments} centerValue={armyShare} centerLabel="Army" ariaLabel={`${c.title} by ${splitTitle}`} />
    </div>
  );
  const notes = [...c.notes, `Donut — Army and Veteran shares by ${splitTitle}, with ${c.byPipeline ? "contacts counted in neither program pipeline" : "Both and No tag"} as thin gray slices; the center is the Army share of the headline.`];
  if (c.goal) notes.push(`Goal basis — ${c.goal.basis}.`);
  const pill = <GoalPill goal={c.goal} value={c.split.total} />;
  const facts = [
    { label: c.byPipeline ? "Army (pipeline)" : "Army", value: n(army) },
    { label: c.byPipeline ? "Veteran (pipeline)" : "Veteran", value: n(veteran) },
    ...c.breakdown.map((b) => ({ label: b.label, value: b.value })),
  ];
  const spec: DrilldownSpec = {
    query: `kind=appt&which=${c.drill.which}&${rangeQuery}`,
    title: c.title,
    subtitle: `${c.subtitle} · ${c.snapshot ? "as of the last sync" : rangeLabel}`,
    header: (
      <div className="kpi-value-row modal-value-row">
        <div className="kpi-value">{headline}</div>
        <div className="kpi-pill">{pill}</div>
      </div>
    ),
    expected: c.drill.expected,
    facts,
    columns: c.snapshot ? CONFIRMED_COLUMNS : APPT_COLUMNS,
    notes,
    csvName: `${c.title} ${c.snapshot ? "snapshot" : rangeLabel}`,
  };
  return (
    <MilestoneDrilldown spec={spec}>
      <KpiShell
        id={c.key}
        className={`kpi-clickable kpi-donut ${className}`.trim()}
        title={c.title}
        subtitle={c.subtitle}
        value={headline}
        pill={pill}
        goalLine={<GoalText goal={c.goal} value={c.split.total} />}
        deltaLine={<Delta value={c.split.total} prev={c.prev} reason={c.prevUnavailableReason} />}
        footer={
          <button type="button" className="kpi-details-btn">
            Details
          </button>
        }
      />
    </MilestoneDrilldown>
  );
}

// ---- 2. rates --------------------------------------------------------------------------------

function RateCell({ line, which }: { line: RateLine; which: "army" | "veteran" | "total" }) {
  const r = line[which];
  if (line.unavailableReason) return <td className="num note">{DASH}</td>;
  if (line.kind === "count") {
    return (
      <td className={`num${which === "total" ? " combined" : ""}`} title={`${n(r.num)} of ${n(r.den)} past-start appointments`}>
        {n(r.num)}
        <span className="plan-label">of {n(r.den)} past start</span>
      </td>
    );
  }
  return (
    <td className={`num${which === "total" ? " combined" : ""}`} title={`${n(r.num)} ÷ ${n(r.den)}`}>
      {pct(r.num, r.den)}
      <span className="plan-label">
        {n(r.num)} / {n(r.den)}
      </span>
    </td>
  );
}

export function AppointmentRatesCard({ r, rangeLabel, className = "" }: { r: RatesResult; rangeLabel: string; className?: string }) {
  const table = (
    <div className="scroll kpi-body">
      <table className="stat-breakdown rep-table rep-table-rates">
        <colgroup>
          <col className="col-name" />
          <col className="col-num" />
          <col className="col-num" />
          <col className="col-num" />
          <col className="col-basis" />
        </colgroup>
        <thead>
          <tr>
            <th>Rate</th>
            <th className="num">
              <span className="stat-split-dot" style={{ background: programColors.army }} /> Army
            </th>
            <th className="num">
              <span className="stat-split-dot" style={{ background: programColors.veteran }} /> Veteran
            </th>
            <th className="num combined">Total</th>
            <th className="basis">How it is computed</th>
          </tr>
        </thead>
        <tbody>
          {r.lines.map((line) => (
            <tr key={line.key}>
              <td className="rep-name">
                {line.label}
                {line.unavailableReason ? <span className="plan-label">unavailable: {line.unavailableReason}</span> : null}
              </td>
              <RateCell line={line} which="army" />
              <RateCell line={line} which="veteran" />
              <RateCell line={line} which="total" />
              <td className="basis note">{line.basis}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const resched = r.rescheduledInPeriod;
  return (
    <KpiShell
      id="appointmentRates"
      className={`kpi-title-xl ${className}`.trim()}
      title="Appointment Rates"
      subtitle={`Show, no-show, cancel, confirm, and reschedule rates by program · ${rangeLabel}`}
      value={
        <div className="stat-pair">
          <div>
            <div className="stat-value">{pct(r.showRate.num, r.showRate.den)}</div>
            <div className="note">Show rate (team)</div>
          </div>
          <div>
            <div className="stat-value">{pct(r.cancelRate.num, r.cancelRate.den)}</div>
            <div className="note">Cancel rate (team)</div>
          </div>
        </div>
      }
      pill={<span className="pill pill-neutral">Goal not set</span>}
      goalLine={<span className="kpi-muted">Goal not set</span>}
      deltaLine={
        <span title="Appointments whose GHL rescheduledAt stamp falls inside the period, by the contact's tag.">
          Rescheduled in period: <b>{n(resched.total)}</b> · Army {n(resched.army)} · Veteran {n(resched.veteran)}
          {resched.both + resched.untagged > 0 ? ` · ${TAG_CLASS_LABEL.both} / ${TAG_CLASS_LABEL.untagged} ${n(resched.both + resched.untagged)}` : ""}
        </span>
      }
      body={table}
      notes={r.notes}
    />
  );
}

// ---- 7c. booked vs showed over time ------------------------------------------------------------------

export function BookedVsShowedCard({ s, rangeLabel, className = "" }: { s: BookedShowedSeries; rangeLabel: string; className?: string }) {
  const per = s.grouping === "hourly" ? "per hour" : s.grouping === "daily" ? "per day" : "per week";
  return (
    <KpiShell
      id="bookedVsShowed"
      className={`kpi-title-xl ${className}`.trim()}
      title="Booked vs Showed"
      subtitle={`Bookings created and appointments showed ${per} · ${rangeLabel}`}
      value={
        <div className="stat-pair">
          <div>
            <div className="stat-value">{n(s.bookedTotal)}</div>
            <div className="note">Booked</div>
          </div>
          <div>
            <div className="stat-value">{n(s.showedTotal)}</div>
            <div className="note">Showed</div>
          </div>
        </div>
      }
      pill={<span className="pill pill-neutral">Goal not set</span>}
      goalLine={<span className="kpi-muted">Booked by booking time · Showed by scheduled time</span>}
      deltaLine={<span className="kpi-muted">Totals equal the Appointments Booked and Appointments Completed cards.</span>}
      chart={
        <LineChart
          height={260}
          leftLabel="Appointments"
          series={[
            { label: `Booked ${per}`, color: APPT_STATUS_COLORS.booked, points: s.booked.map((p) => ({ label: p.label, value: p.count })), format: "count" },
            { label: `Showed ${per}`, color: APPT_STATUS_COLORS.showed, points: s.showed.map((p) => ({ label: p.label, value: p.count })), format: "count" },
          ]}
        />
      }
      notes={[
        "Booked — bookings created in each bucket (booking creation time), the same count as the Appointments Booked card.",
        "Showed — appointments scheduled to start in each bucket and marked Showed, the same count as the Appointments Completed card; a booking made on one day usually shows on a later day, so the two lines are not the same appointments.",
        "Buckets — hourly for a single day, daily up to 92 days, weekly beyond; America/New_York.",
      ]}
    />
  );
}

// ---- 3. rep appointments ---------------------------------------------------------------------------

function Leader({ what }: { what: string }) {
  return (
    <span className="pill pill-gold leader-badge" title={what}>
      Leader
    </span>
  );
}

/** Status colors for the by-rep chart: fixed order from the shared palette, never the program hues. */
export const APPT_STATUS_COLORS = { booked: chartSeries[0], showed: chartSeries[3], noshow: chartSeries[4], cancelled: chartSeries[2] } as const;

export function RepAppointmentsCard({ r, rangeQuery, rangeLabel, className = "" }: { r: RepApptsResult; rangeQuery: string; rangeLabel: string; className?: string }) {
  const notes = [...r.notes, "Chart — Booked (as host), Showed, No-show, and Cancelled per rep, the same figures as the table; the dashed tick is the rep's booking goal pro-rated to now."];
  if (r.unmatchedReps.length > 0) notes.push(`Unmatched reps — not found among GHL users (check the userId in config/sales-reps.json): ${r.unmatchedReps.map((x) => x.name).join(", ")}.`);

  const spec = (row: RepApptRow, user: string): DrilldownSpec => ({
    query: `kind=apptRep&user=${encodeURIComponent(user)}&${rangeQuery}`,
    title: `${row.name} · ${n(row.booked)} ${row.booked === 1 ? "booking" : "bookings"} as host`,
    subtitle: `Appointments counted on this row · ${rangeLabel}`,
    facts: [
      { label: "Booked (as host)", value: n(row.booked), title: "Bookings created in the period with this user as the assigned host." },
      { label: "Booked by them", value: n(row.bookedBy), title: "Bookings created in the period that GHL records this user as having created." },
      { label: "Showed", value: n(row.showed), title: "Scheduled in the period and marked Showed." },
      { label: "No-show", value: n(row.noshow), title: "Scheduled in the period and marked No-show." },
      { label: "Cancelled", value: n(row.cancelled), title: "Status cancelled, last changed in the period." },
      { label: "Show rate", value: row.showRate === null ? DASH : `${Math.round(row.showRate * 100)}%` },
      { label: `Calls per booking (${r.windowDays}-day window)`, value: row.callsPerBooking === null ? DASH : row.callsPerBooking.toFixed(1), title: `${n(row.callsBefore)} host dials across ${n(row.booked)} bookings.` },
      { label: "Army / Veteran / Both / No tag", value: `${n(row.bookedSplit.army)} / ${n(row.bookedSplit.veteran)} / ${n(row.bookedSplit.both)} / ${n(row.bookedSplit.untagged)}`, title: "Booked (as host) by the contact's tags." },
    ],
    columns: APPT_COLUMNS,
    segments: [
      { key: "booked", label: "Booked (as host)", expected: row.booked },
      { key: "bookedBy", label: "Booked by them", expected: row.bookedBy },
      { key: "showed", label: "Showed", expected: row.showed },
      { key: "noshow", label: "No-show", expected: row.noshow },
      { key: "cancelled", label: "Cancelled", expected: row.cancelled },
    ],
    notes,
    csvName: `${row.name} appointments ${rangeLabel}`,
  });

  const cells = (row: RepApptRow, total = false) => (
    <>
      <td className={`num${total ? "" : " combined"}`} title={row.bookedGoal ? `Own goal ${Math.round(row.bookedGoal.full)}${row.bookedGoal.scaled !== row.bookedGoal.full ? ` (${Math.round(row.bookedGoal.scaled)} by now)` : ""}` : undefined}>
        {n(row.booked)}
        {row.leaderBooked ? <Leader what="Most bookings as host in the period" /> : null}
        {row.bookedStatus ? (
          <span className="plan-label">
            <StatusPill status={row.bookedStatus} title={row.bookedGoal ? `Own goal ${Math.round(row.bookedGoal.full)}` : undefined} />
          </span>
        ) : null}
      </td>
      <td className="num">{n(row.bookedBy)}</td>
      <td className="num">{n(row.showed)}</td>
      <td className="num">{n(row.noshow)}</td>
      <td className="num">{n(row.cancelled)}</td>
      <td className="num" title={`${n(row.showed)} showed ÷ ${n(row.showed + row.noshow)} marked`}>
        {row.showRate === null ? DASH : `${Math.round(row.showRate * 100)}%`}
        {row.leaderShow ? <Leader what={`Best show rate among reps with at least ${r.minMarked} marked appointments`} /> : null}
      </td>
      <td className="num" title={`${n(row.callsBefore)} host dials in the ${r.windowDays} days before each booking ÷ ${n(row.booked)} bookings`}>
        {row.callsPerBooking === null ? DASH : row.callsPerBooking.toFixed(1)}
      </td>
      <td className="num split" title={`Booked (as host) by the contact's tags · Both ${n(row.bookedSplit.both)} · No tag ${n(row.bookedSplit.untagged)}`}>
        <span style={{ color: programColors.army }}>{n(row.bookedSplit.army)}</span>
        <span className="split-sep">/</span>
        <span style={{ color: programColors.veteran }}>{n(row.bookedSplit.veteran)}</span>
        {row.bookedSplit.both + row.bookedSplit.untagged > 0 ? <span className="plan-label">+{n(row.bookedSplit.both + row.bookedSplit.untagged)} both / no tag</span> : null}
      </td>
    </>
  );

  const table = (
    <div className="scroll kpi-body">
      <table className="stat-breakdown rep-table rep-table-appts">
        <colgroup>
          <col className="col-name" />
          <col className="col-num" />
          <col className="col-num" />
          <col className="col-num" />
          <col className="col-num" />
          <col className="col-num" />
          <col className="col-num" />
          <col className="col-num" />
          <col className="col-split" />
        </colgroup>
        <thead>
          <tr>
            <th>Sales rep</th>
            <th className="num combined">Booked (as host)</th>
            <th className="num" title="Bookings this user created in GHL, whoever hosts them.">
              Booked by them
            </th>
            <th className="num">Showed</th>
            <th className="num">No-show</th>
            <th className="num">Cancelled</th>
            <th className="num">Show rate</th>
            <th className="num" title={`Host dials to the contact in the ${r.windowDays} days before the booking, averaged over bookings.`}>
              Calls per booking
            </th>
            <th className="num">Army / Veteran</th>
          </tr>
        </thead>
        <tbody>
          {r.rows.map((row) => (
            <RepDrilldownRow key={row.userId ?? row.name} spec={spec(row, row.userId ?? "others")}>
              <td className="rep-name">{row.name}</td>
              {cells(row)}
            </RepDrilldownRow>
          ))}
          {r.others ? (
            <RepDrilldownRow spec={spec(r.others, "others")}>
              <td className="note">{r.others.name}</td>
              {cells(r.others)}
            </RepDrilldownRow>
          ) : null}
          <tr className="rep-total">
            <td className="rep-name">Team total</td>
            {cells(r.total, true)}
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <KpiShell
      id="repAppointments"
      className={`kpi-title-xl ${className}`.trim()}
      title="Rep Appointments"
      subtitle="Bookings, attendance, cancellations, and calls per booking per sales rep · selected range"
      value={
        <div className="stat-pair">
          <div>
            <div className="stat-value">{n(r.total.booked)}</div>
            <div className="note">Booked (team)</div>
          </div>
          <div>
            <div className="stat-value">{r.total.showRate === null ? DASH : `${Math.round(r.total.showRate * 100)}%`}</div>
            <div className="note">Show rate (team)</div>
          </div>
          <div>
            <div className="stat-value">{r.total.callsPerBooking === null ? DASH : r.total.callsPerBooking.toFixed(1)}</div>
            <div className="note">Calls per booking (team)</div>
          </div>
        </div>
      }
      pill={<GoalPill goal={r.bookedGoal} value={r.total.booked} />}
      goalLine={
        <span>
          Bookings: <GoalText goal={r.bookedGoal} value={r.total.booked} />
        </span>
      }
      deltaLine={<span className="kpi-muted">Team calls per booking = all host dials in the window ÷ all bookings, not an average of rep averages.</span>}
      chart={
        <GroupedBarChart
          height={240}
          legend={[
            { label: "Booked (as host)", color: APPT_STATUS_COLORS.booked },
            { label: "Showed", color: APPT_STATUS_COLORS.showed },
            { label: "No-show", color: APPT_STATUS_COLORS.noshow },
            { label: "Cancelled", color: APPT_STATUS_COLORS.cancelled },
          ]}
          groups={r.rows.map((row) => ({
            label: row.name,
            bars: [
              { label: "Booked", value: row.booked, color: APPT_STATUS_COLORS.booked },
              { label: "Showed", value: row.showed, color: APPT_STATUS_COLORS.showed },
              { label: "No-show", value: row.noshow, color: APPT_STATUS_COLORS.noshow },
              { label: "Cancelled", value: row.cancelled, color: APPT_STATUS_COLORS.cancelled },
            ],
            tick: row.bookedGoal ? row.bookedGoal.scaled : null,
            tickLabel: "booking goal by now",
          }))}
        />
      }
      body={table}
      notes={notes}
    />
  );
}

// "My attendance" on the rep dashboard (owner request 2026-11-24): the
// current pay period's calendar, each working day marked worked, Non-paid
// day off, Holiday (unpaid), or an admin override with its note, with the
// dial count, the running deduction, any extra pay for an optional holiday
// worked, and the period's expected base pay. Server component.

import type { Attendance, AttendanceDay } from "@/lib/payroll/attendance";
import { DAY_STATUS_LABEL, OVERRIDE_LABEL } from "@/lib/payroll/attendance";
import Notes from "../Notes";

const n = (v: number) => v.toLocaleString("en-US");
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const usd0 = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function DayCell({ d, minDials }: { d: AttendanceDay; minDials: number }) {
  const tag = d.status === "excused" && d.override ? OVERRIDE_LABEL[d.override.kind] : d.status === "holiday" ? "Holiday · unpaid" : d.holiday?.optional && d.status === "worked" ? "Worked · optional day, paid" : DAY_STATUS_LABEL[d.status];
  const title = d.override ? `${OVERRIDE_LABEL[d.override.kind]} · set by ${d.override.createdBy}${d.override.note ? ` · ${d.override.note}` : ""}` : d.holiday ? `${d.holiday.name}${d.holiday.optional ? ` · optional work day: paid at the daily rate from ${n(minDials)} dials` : " · unpaid, no deduction"}` : `${n(d.dials)} outbound dials · ${d.dials >= minDials ? "at or above" : "under"} the ${n(minDials)} needed`;
  const cls = d.holiday?.optional && d.status === "worked" ? "is-worked is-optional" : `is-${d.status}`;
  return (
    <div className={`me-att-day ${cls}`} title={title}>
      <div className="me-att-date">
        <b>{d.weekday}</b> {d.short}
      </div>
      <div className="me-att-dials">
        {d.status === "upcoming" || (d.status === "holiday" && d.dials === 0) ? "—" : n(d.dials)} <span>dials</span>
      </div>
      <div className="me-att-tag">{tag}</div>
      {d.holiday ? (
        <div className="me-att-note">
          {d.holiday.name}
          {d.holiday.optional ? " · optional" : ""}
        </div>
      ) : null}
      {d.deduction > 0 ? <div className="me-att-ded">−{usd(d.deduction)}</div> : null}
      {d.extra > 0 ? <div className="me-att-extra">+{usd(d.extra)}</div> : null}
      {d.override?.note ? <div className="me-att-note">{d.override.note}</div> : null}
    </div>
  );
}

export default function AttendanceCard({ a, visible = false }: { a: Attendance; /** Render visible at once (pages without the scroll-reveal observer). */ visible?: boolean }) {
  const base = a.monthly !== null;
  const pill = a.unpaid > 0 ? <span className="pill pill-warn">{n(a.unpaid)} non-paid day{a.unpaid === 1 ? "" : "s"} off</span> : a.worked > 0 ? <span className="pill pill-ok">All days worked</span> : <span className="pill pill-neutral">Not started</span>;
  return (
    <div className={`stat kpi kpi-title-xl reveal me-card${visible ? " is-visible" : ""}`} data-kpi="me-attendance">
      <div className="kpi-head">
        <div className="label">My attendance</div>
        <div className="kpi-sub note">
          {a.preview ? `Preview · the two weeks before the first pay period (${a.period.label}) under the same rule · nothing is invoiced for these days` : `Pay period ${n(a.period.index)} · ${a.period.label} · a working day counts as worked at ${n(a.minDials)}+ outbound dials`}
        </div>
      </div>
      <div className="kpi-value-row">
        <div className="kpi-value">
          <div className="stat-pair">
            <div>
              <div className="stat-value">
                {n(a.worked)} <span className="me-hero-of">of {n(a.payableDays)}</span>
              </div>
              <div className="note">
                days worked{a.holidays > 0 ? ` · ${n(a.holidays)} holiday${a.holidays === 1 ? "" : "s"} (unpaid)` : ""}
                {a.optionalWorked > 0 ? ` · ${n(a.optionalWorked)} optional day${a.optionalWorked === 1 ? "" : "s"} worked` : ""}
                {a.remaining > 0 ? ` · ${n(a.remaining)} to go` : ""}
              </div>
            </div>
            {base ? (
              <div>
                <div className="stat-value">{usd0(a.expected as number)}</div>
                <div className="note">expected base this period</div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="kpi-pill">{pill}</div>
      </div>
      <div className="kpi-line">
        <span className="kpi-muted">
          {base ? (
            <>
              Base {usd0(a.monthly as number)} a month · {usd0(a.halfBase as number)} per period · daily rate {a.rateText} · deduction so far <b>{usd(a.deduction)}</b>
              {a.extras > 0 ? (
                <>
                  {" "}
                  · extra for optional days worked <b>+{usd(a.extras)}</b>
                </>
              ) : null}
            </>
          ) : (
            "Commission only: no base pay, so the days are informational and nothing is deducted."
          )}
        </span>
      </div>
      <div className="kpi-line">
        <span className="kpi-muted">
          Worked {n(a.worked)} · non-paid {n(a.unpaid)}
          {a.excused > 0 ? ` · excused ${n(a.excused)}` : ""}
          {a.holidays > 0 ? ` · holidays ${n(a.holidays)}` : ""} · {a.remaining > 0 ? `${n(a.remaining)} remaining` : "period complete"}
        </span>
      </div>
      <div className="me-att-weeks">
        {a.weeks.map((w, i) => (
          <div key={i} className="me-att-week">
            <div className="me-att-weeklabel">Week {i + 1}</div>
            <div className="me-att-grid">
              {w.map((d) => (
                <DayCell key={d.day} d={d} minDials={a.minDials} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="note me-att-legend">
        <span className="me-att-key is-worked">Worked</span>
        <span className="me-att-key is-unpaid">Non-paid day off</span>
        <span className="me-att-key is-excused">Excused by an admin (paid)</span>
        <span className="me-att-key is-holiday">Holiday (unpaid, no deduction)</span>
        <span className="me-att-key is-today">Today</span>
        <span className="me-att-key is-upcoming">Upcoming</span>
      </div>
      <details className="kpi-details">
        <summary>How this is counted</summary>
        <div className="kpi-details-body">
          <Notes notes={a.notes} />
        </div>
      </details>
    </div>
  );
}

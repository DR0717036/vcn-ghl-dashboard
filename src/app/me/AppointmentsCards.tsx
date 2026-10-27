// "My appointments": upcoming this week and the past appointments still
// without an outcome, two cards whose names link to the contact in GHL.
// Server component.

import { fmtDateTime } from "@/lib/dates";
import type { ApptRow, RepAppointmentsData } from "@/lib/me/appointments";
import Notes from "../Notes";

const n = (v: number) => v.toLocaleString("en-US");

function Table({ rows, past }: { rows: ApptRow[]; past: boolean }) {
  if (rows.length === 0) return null;
  return (
    <div className="scroll kpi-body">
      <table className="stat-breakdown me-list">
        <thead>
          <tr>
            <th>Contact</th>
            <th>Program</th>
            <th>Calendar</th>
            <th>{past ? "Was scheduled" : "Scheduled"}</th>
            <th>Status</th>
            {past ? <th className="num">Overdue</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                {r.ghlUrl ? (
                  <a className="me-link" href={r.ghlUrl} target="_blank" rel="noreferrer" title="Open in GHL">
                    {r.name}
                  </a>
                ) : (
                  r.name
                )}
              </td>
              <td>{r.program}</td>
              <td>{r.calendar}</td>
              <td>
                {fmtDateTime(r.startTime)}
                {r.rescheduled ? <span className="plan-label">rescheduled</span> : null}
              </td>
              <td>{r.status}</td>
              {past ? <td className="num">{r.overdueDays < 1 ? `${Math.round(r.overdueDays * 24)}h` : `${n(Math.round(r.overdueDays))} day${Math.round(r.overdueDays) === 1 ? "" : "s"}`}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AppointmentsCards({ d }: { d: RepAppointmentsData }) {
  return (
    <>
      <div className="kpi-row cols-2 kpi-row-top">
        <div className="stat kpi reveal me-card" data-kpi="me-appts-upcoming">
          <div className="kpi-head">
            <div className="label">Upcoming this week</div>
            <div className="kpi-sub note">Appointments you host from now {d.weekLabel}</div>
          </div>
          <div className="kpi-value-row">
            <div className="kpi-value">
              <div className="stat-value">{n(d.upcoming.length)}</div>
            </div>
            <div className="kpi-pill">{d.upcoming.length === 0 ? <span className="pill pill-neutral">None scheduled</span> : <span className="pill pill-info">Scheduled</span>}</div>
          </div>
          <Table rows={d.upcoming} past={false} />
        </div>
        <div className="stat kpi reveal me-card" data-kpi="me-appts-mark">
          <div className="kpi-head">
            <div className="label">Mark the outcome</div>
            <div className="kpi-sub note">Past appointments still Confirmed or New · last {d.lookbackDays} days · set Showed or No-show in GHL</div>
          </div>
          <div className="kpi-value-row">
            <div className="kpi-value">
              <div className="stat-value">{n(d.toMark.length)}</div>
            </div>
            <div className="kpi-pill">{d.toMark.length === 0 ? <span className="pill pill-ok">All marked</span> : <span className="pill pill-warn">Needs marking</span>}</div>
          </div>
          <Table rows={d.toMark} past />
        </div>
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

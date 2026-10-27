// "My leads": four action lists (replies waiting, untouched, stale, awaiting
// supervisor approval), each a card with a count and a table whose names
// link to the contact in GHL. Server component.

import type { LeadList, RepLeadsData } from "@/lib/me/leads";
import Notes from "../Notes";

const n = (v: number) => v.toLocaleString("en-US");

function ListCard({ l }: { l: LeadList }) {
  return (
    <div className="stat kpi reveal me-card" data-kpi={`me-leads-${l.key}`}>
      <div className="kpi-head">
        <div className="label">{l.title}</div>
        <div className="kpi-sub note">{l.desc}</div>
      </div>
      <div className="kpi-value-row">
        <div className="kpi-value">
          <div className="stat-value">{n(l.count)}</div>
        </div>
        <div className="kpi-pill">{l.count === 0 ? <span className="pill pill-ok">Nothing waiting</span> : <span className="pill pill-warn">Needs action</span>}</div>
      </div>
      {l.rows.length > 0 ? (
        <div className="scroll kpi-body">
          <table className="stat-breakdown me-list">
            <thead>
              <tr>
                <th>Contact</th>
                <th>Program</th>
                <th>Stage</th>
                <th className="num">{l.key === "replies" ? "Waiting" : "Age"}</th>
              </tr>
            </thead>
            <tbody>
              {l.rows.map((r) => (
                <tr key={r.contactId}>
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
                  <td title={r.pipeline ?? undefined}>{r.stage ?? "—"}</td>
                  <td className="num" title={r.detail}>
                    {r.age}
                    {r.estimated ? <span className="plan-label">est.</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {l.more > 0 ? <div className="note">…and {n(l.more)} more, newer than these.</div> : null}
        </div>
      ) : null}
    </div>
  );
}

export default function LeadsCards({ d }: { d: RepLeadsData }) {
  return (
    <>
      <p className="note">
        {n(d.assigned)} contacts are assigned to you in GHL. The lists below are the ones that need action, oldest first; click a name to open it in GHL.
      </p>
      <div className="kpi-row cols-2 kpi-row-top">
        {d.lists.slice(0, 2).map((l) => (
          <ListCard key={l.key} l={l} />
        ))}
      </div>
      <div className="kpi-row cols-2 kpi-row-top">
        {d.lists.slice(2).map((l) => (
          <ListCard key={l.key} l={l} />
        ))}
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

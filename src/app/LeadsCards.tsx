// The Leads row (owner request 2026-10-17): headline cards with daily lines,
// the program × campaign matrix with a donut, new-lead outcomes with a
// horizontal bar chart, new leads by assigned user, stale new leads, and the
// source report. Same card anatomy, drilldown modal, and CSV pattern as the
// other rows. These cards sit on the dark band.

import { chartSeries, programColors, statusColors } from "@/lib/design";
import type { KpiResult } from "@/lib/metrics";
import { n, NO_CAMPAIGN, pct, type AssignedResult, type ComparedSeries, type MatrixResult, type OutcomesResult, type SourceReport, type SourceRow, type StaleResult, type UserRow } from "@/lib/leads";
import DonutChart from "./charts/DonutChart";
import GroupedBarChart from "./charts/GroupedBarChart";
import HBarChart from "./charts/HBarChart";
import LineChart from "./charts/LineChart";
import { DrilldownButton, LEAD_COLUMNS, RepDrilldownRow, STALE_LEAD_COLUMNS, type DrilldownSpec } from "./Drilldown";
import { GoalPill, GoalText } from "./GoalLine";
import KpiShell, { Delta } from "./KpiShell";
import { ProgramSplit } from "./AppointmentCards";

const DASH = "—";
const grayA = "#8a97a8";
const grayB = "#b9c3d0";

function leadSpec(query: string, title: string, subtitle: string, expected: number | null, notes: string[], csvName: string, extra?: Partial<DrilldownSpec>): DrilldownSpec {
  return { query, title, subtitle, expected, columns: LEAD_COLUMNS, notes, csvName, ...extra };
}

// ---- 1. headline cards ---------------------------------------------------------------------------

export function LeadHeadlineCard({ k, s, title, subtitle, priorLabel, rangeQuery, rangeLabel, className = "" }: { k: KpiResult; s: ComparedSeries; title: string; subtitle: string; priorLabel: string; rangeQuery?: string; rangeLabel?: string; className?: string }) {
  const unavailable = k.value === null;
  const per = s.grouping === "hourly" ? "per hour" : s.grouping === "daily" ? "per day" : "per week";
  const alignedBy = s.grouping === "hourly" ? "hour" : "day";
  const notes = [...k.notes];
  if (k.goal) notes.push(`Goal basis — ${k.goal.basis}.`);
  notes.push(`Chart — ${per}, ${s.prior ? `with the ${priorLabel} as a muted line aligned by ${alignedBy}` : `comparison line unavailable: ${s.priorReason ?? "no history"}`}.`);
  return (
    <KpiShell
      id={k.key}
      className={className}
      title={title}
      subtitle={subtitle}
      value={
        <>
          <div className={`stat-value${unavailable ? " unavailable" : ""}`}>{unavailable ? "unavailable" : n(k.value as number)}</div>
          {unavailable && k.unavailableReason ? <div className="note kpi-reason">{k.unavailableReason}</div> : null}
        </>
      }
      pill={<GoalPill goal={k.goal} value={k.value} />}
      goalLine={<GoalText goal={k.goal} value={k.value} />}
      deltaLine={<Delta value={k.value} prev={k.prev} reason={k.prevUnavailableReason} />}
      chart={
        unavailable ? null : (
          <LineChart
            height={180}
            series={[
              { label: `${title} ${per}`, color: chartSeries[0], points: s.points.map((p) => ({ label: p.label, value: p.count })), format: "count" },
              ...(s.prior ? [{ label: `${priorLabel} (aligned by ${alignedBy})`, color: "var(--series-prior)", points: s.prior.map((p) => ({ label: p.label, value: p.count })), format: "count" as const, muted: true }] : []),
            ]}
          />
        )
      }
      breakdown={k.breakdown}
      sections={k.sections ?? []}
      footer={rangeQuery && !unavailable ? <DrilldownButton spec={leadSpec(`kind=leads&which=all&${rangeQuery}`, `${title} · ${n(k.value as number)}`, `Contacts created in period · ${rangeLabel ?? ""}`, k.value, notes, `${title} ${rangeLabel ?? ""}`)} label="View contacts" /> : undefined}
      notes={notes}
    />
  );
}

// ---- 2. program × campaign matrix ----------------------------------------------------------------------

export function LeadMatrixCard({ m, rangeQuery, rangeLabel, className = "" }: { m: MatrixResult; rangeQuery: string; rangeLabel: string; className?: string }) {
  const donut = [
    { label: "Army", value: m.split.army, color: programColors.army, extra: pct(m.split.army, m.total) },
    { label: "Veteran", value: m.split.veteran, color: programColors.veteran, extra: pct(m.split.veteran, m.total) },
    { label: "Both (army + veteran)", value: m.split.both, color: grayA, extra: pct(m.split.both, m.total) },
    { label: "No tag", value: m.split.untagged, color: grayB, extra: pct(m.split.untagged, m.total) },
  ];
  const colSpec = (col: string) =>
    leadSpec(`kind=leads&which=campaign&arg=${encodeURIComponent(col.toLowerCase())}&${rangeQuery}`, `New leads · ${col}`, `Contacts created in period carrying this campaign tag · ${rangeLabel}`, null, m.notes, `New leads ${col} ${rangeLabel}`);
  const table = (
    <div className="scroll kpi-body">
      <table className="stat-breakdown rep-table rep-table-matrix">
        <thead>
          <tr>
            <th>Program</th>
            {m.columns.map((c) => (
              <th key={c} className="num" title={c === NO_CAMPAIGN ? "None of the configured campaign tags" : `Contact tag "${c}"`}>
                {c}
              </th>
            ))}
            <th className="num combined" title="Each lead once, whatever its campaign tags">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {m.rows.map((r) => (
            <tr key={r.key} className={r.key === "total" ? "rep-total" : undefined}>
              <td className="rep-name">
                {r.key === "army" || r.key === "veteran" ? <span className="stat-split-dot" style={{ background: programColors[r.key], marginRight: 6 }} /> : null}
                {r.label}
              </td>
              {r.cells.map((v, i) => (
                <td key={m.columns[i]} className="num">
                  {n(v)}
                </td>
              ))}
              <td className="num combined">{n(r.total)}</td>
            </tr>
          ))}
          <tr className="matrix-actions">
            <td className="note">Contacts behind a column</td>
            {m.columns.map((c) => (
              <td key={c} className="num">
                <DrilldownButton spec={colSpec(c)} label="View" />
              </td>
            ))}
            <td className="num">
              <DrilldownButton spec={leadSpec(`kind=leads&which=all&${rangeQuery}`, `New leads created · ${n(m.total)}`, `Contacts created in period · ${rangeLabel}`, m.total, m.notes, `New leads ${rangeLabel}`)} label="View all" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
  return (
    <KpiShell
      id="leadMatrix"
      className={`kpi-title-xl ${className}`.trim()}
      title="New Leads by Program × Campaign"
      subtitle={`Contacts created in period by program tag and campaign tag · ${rangeLabel}`}
      value={
        <>
          <div className="stat-value">{n(m.total)}</div>
          <ProgramSplit army={m.split.army} veteran={m.split.veteran} />
        </>
      }
      pill={<span className="pill pill-neutral">Goal not set</span>}
      goalLine={
        <span>
          {n(m.multiCampaign)} with more than one campaign tag · {n(m.noCampaign)} with none
        </span>
      }
      deltaLine={<span className="kpi-muted">A lead with several campaign tags counts in each column but once in Total.</span>}
      chart={
        <div className="lead-donut">
          <DonutChart segments={donut} total={m.total} centerLabel="new leads" size={150} emptyText="No new leads in this period." />
        </div>
      }
      body={table}
      notes={m.notes}
    />
  );
}

// ---- 3. outcomes ---------------------------------------------------------------------------------------

const OUTCOME_COLORS: Record<string, string> = {
  created: chartSeries[0],
  working: chartSeries[3],
  touched: chartSeries[5],
  appointment: chartSeries[1],
  submitted: statusColors.good,
  won: "#1f9d55",
  lost: statusColors.bad,
  newLead: "#8a97a8",
};

export function LeadOutcomesCard({ o, rangeQuery, rangeLabel, className = "" }: { o: OutcomesResult; rangeQuery: string; rangeLabel: string; className?: string }) {
  const basis = (r: { key: string; historyBasis?: number }) => (r.key === "submitted" && r.historyBasis !== undefined ? r.historyBasis : o.cohort);
  const spec = leadSpec(`kind=leads&which=outcomes&${rangeQuery}`, `New lead outcomes · ${n(o.cohort)} contacts`, `Contacts created in period, outcomes as of the last sync · ${rangeLabel}`, o.cohort, o.notes, `New lead outcomes ${rangeLabel}`, {
    segments: [
      { key: "created", label: "Created", expected: o.cohort },
      ...o.rows.filter((r) => r.key !== "created").map((r) => ({ key: r.key, label: r.label, expected: r.count })),
      { key: "historyUnavailable", label: "History unavailable", expected: o.historyUnavailable },
    ],
  });
  const chartRows = o.rows.map((r) => ({
    label: ({ created: "Created", working: "Working stage", touched: `Touched (${o.touchWindowDays}d)`, appointment: "Appt booked", submitted: "Submitted", won: "Won", lost: "Lost", newLead: "Still New Lead" } as Record<string, string>)[r.key] ?? r.label,
    value: r.count,
    color: OUTCOME_COLORS[r.key] ?? chartSeries[0],
    text: `${n(r.count)} · ${pct(r.count, basis(r))}`,
    detail: r.key === "submitted" && r.historyBasis !== undefined && r.historyBasis < o.cohort ? `of ${n(r.historyBasis)} with history` : `of ${n(o.cohort)} created`,
  }));
  const table = (
    <div className="scroll kpi-body">
      <table className="stat-breakdown rep-table rep-table-outcomes">
        <thead>
          <tr>
            <th>Outcome (as of last sync)</th>
            <th className="num combined">Leads</th>
            <th className="num">% of cohort</th>
            <th className="campaigns">By campaign tag</th>
          </tr>
        </thead>
        <tbody>
          {o.rows.map((r) => (
            <tr key={r.key}>
              <td className="rep-name">
                <span className="stat-split-dot" style={{ background: OUTCOME_COLORS[r.key] ?? chartSeries[0], marginRight: 6 }} />
                {r.label}
                {r.detail ? <span className="plan-label">{r.detail}</span> : null}
              </td>
              <td className="num combined">{n(r.count)}</td>
              <td className="num" title={r.key === "submitted" && r.historyBasis !== undefined && r.historyBasis < o.cohort ? `Of the ${n(r.historyBasis)} leads created after milestone tracking began` : `Of ${n(o.cohort)} leads created`}>
                {r.key === "submitted" && r.historyBasis === 0 && o.cohort > 0 ? "history unavailable" : pct(r.count, basis(r))}
                {r.key === "submitted" && r.historyBasis !== undefined && r.historyBasis > 0 && r.historyBasis < o.cohort ? <span className="plan-label">of {n(r.historyBasis)} with history</span> : null}
              </td>
              <td className="campaigns">
                <span className="chips">
                  {r.byCampaign.map((v, i) =>
                    v > 0 ? (
                      <span key={o.columns[i]} className="chip" title={`${o.columns[i]}: ${n(v)}`}>
                        {o.columns[i]} <b>{n(v)}</b>
                      </span>
                    ) : null,
                  )}
                  {r.byCampaign.every((v) => v === 0) ? <span className="note">{DASH}</span> : null}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const created = o.rows[0]?.count ?? 0;
  const working = o.rows.find((r) => r.key === "working")?.count ?? 0;
  const touched = o.rows.find((r) => r.key === "touched")?.count ?? 0;
  return (
    <KpiShell
      id="leadOutcomes"
      className={`kpi-title-xl ${className}`.trim()}
      title="New Lead Outcomes"
      subtitle={`Cohort: contacts created in period · outcomes as of the last sync · ${rangeLabel}`}
      value={
        <div className="stat-pair">
          <div>
            <div className="stat-value">{n(created)}</div>
            <div className="note">Created</div>
          </div>
          <div>
            <div className="stat-value">{pct(working, created)}</div>
            <div className="note">In a working stage</div>
          </div>
          <div>
            <div className="stat-value">{pct(touched, created)}</div>
            <div className="note">Touched in last {o.touchWindowDays} days</div>
          </div>
        </div>
      }
      pill={<span className="pill pill-neutral">Goal not set</span>}
      goalLine={<span className="kpi-muted">Each row counts cohort contacts on its own; rows overlap.</span>}
      deltaLine={
        o.historyUnavailable > 0 ? (
          <span className="kpi-muted">Submitted uses the {n(o.withHistory)} leads created after milestone tracking began; history unavailable for {n(o.historyUnavailable)}.</span>
        ) : (
          <span className="kpi-muted">Milestone history covers the whole cohort.</span>
        )
      }
      chart={<HBarChart rows={chartRows} height={250} emptyText="No new leads in this period." />}
      body={table}
      footer={<DrilldownButton spec={spec} label="View cohort" />}
      notes={o.notes}
    />
  );
}

// ---- 4. assigned by user --------------------------------------------------------------------------------

export function LeadsByUserCard({ a, rangeQuery, rangeLabel, className = "" }: { a: AssignedResult; rangeQuery: string; rangeLabel: string; className?: string }) {
  const spec = (r: UserRow): DrilldownSpec =>
    leadSpec(`kind=leads&which=user&arg=${encodeURIComponent(r.userId ?? "unassigned")}&${rangeQuery}`, `${r.name} · ${n(r.count)} new ${r.count === 1 ? "lead" : "leads"}`, `Contacts created in period currently assigned to this user · ${rangeLabel}`, r.count, a.notes, `${r.name} new leads ${rangeLabel}`);
  const cells = (r: UserRow) => (
    <>
      <td className="num combined">{n(r.count)}</td>
      <td className="num" style={{ color: programColors.army }}>
        {n(r.split.army)}
      </td>
      <td className="num" style={{ color: programColors.veteran }}>
        {n(r.split.veteran)}
      </td>
      <td className="num">{n(r.split.both)}</td>
      <td className="num">{n(r.split.untagged)}</td>
      {r.byCampaign.map((v, i) => (
        <td key={a.columns[i]} className="num">
          {n(v)}
        </td>
      ))}
    </>
  );
  const table = (
    <div className="scroll kpi-body">
      <table className="stat-breakdown rep-table rep-table-users">
        <thead>
          <tr>
            <th>Assigned user (current)</th>
            <th className="num combined">New leads</th>
            <th className="num">Army</th>
            <th className="num">Veteran</th>
            <th className="num">Both</th>
            <th className="num">No tag</th>
            {a.columns.map((c) => (
              <th key={c} className="num">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {a.rows.map((r) => (
            <RepDrilldownRow key={r.userId ?? r.kind} spec={spec(r)}>
              <td className={r.kind === "rep" ? "rep-name" : "note"}>
                {r.name}
                {r.kind === "user" ? <span className="plan-label">not a sales rep</span> : null}
              </td>
              {cells(r)}
            </RepDrilldownRow>
          ))}
          <tr className="rep-total">
            <td className="rep-name">Team total</td>
            {cells(a.total)}
          </tr>
        </tbody>
      </table>
    </div>
  );
  const charted = a.rows.filter((r) => r.count > 0);
  return (
    <KpiShell
      id="leadsByUser"
      className={`kpi-title-xl ${className}`.trim()}
      title="New Leads Assigned by User"
      subtitle={`Contacts created in period by their current assigned user · ${rangeLabel}`}
      value={
        <>
          <div className="stat-value">{n(a.total.count)}</div>
          <ProgramSplit army={a.total.split.army} veteran={a.total.split.veteran} />
        </>
      }
      pill={<span className="pill pill-neutral">Goal not set</span>}
      goalLine={
        <span>
          Unassigned: <b>{n(a.rows.find((r) => r.kind === "unassigned")?.count ?? 0)}</b> · reps {n(a.rows.filter((r) => r.kind === "rep").reduce((s, r) => s + r.count, 0))} · other users {n(a.rows.filter((r) => r.kind === "user").reduce((s, r) => s + r.count, 0))}
        </span>
      }
      deltaLine={<span className="kpi-muted">Assigned user is the contact's current owner, a snapshot as of the last sync.</span>}
      chart={
        <GroupedBarChart
          height={230}
          legend={[
            { label: "Army", color: programColors.army },
            { label: "Veteran", color: programColors.veteran },
            { label: "Both / No tag", color: grayA },
          ]}
          groups={charted.map((r) => ({
            label: r.name,
            bars: [
              { label: "Army", value: r.split.army, color: programColors.army },
              { label: "Veteran", value: r.split.veteran, color: programColors.veteran },
              { label: "Both / No tag", value: r.split.both + r.split.untagged, color: grayA },
            ],
          }))}
          emptyText="No new leads in this period."
        />
      }
      body={table}
      notes={a.notes}
    />
  );
}

// ---- 5. stale new leads ---------------------------------------------------------------------------------

export function StaleLeadsCard({ s, rangeQuery, rangeLabel, className = "" }: { s: StaleResult; rangeQuery: string; rangeLabel: string; className?: string }) {
  const spec: DrilldownSpec = {
    query: `kind=leads&which=stale&${rangeQuery}`,
    title: `Stale new leads · ${n(s.count)}`,
    subtitle: `Created in period, still in New Lead for more than ${s.staleAfterDays} days · ${rangeLabel}`,
    expected: s.count,
    facts: s.byUser.map((u) => ({ label: u.name, value: `${n(u.count)} · oldest ${u.oldestDays.toFixed(1)} d` })),
    columns: STALE_LEAD_COLUMNS,
    notes: s.notes,
    csvName: `Stale new leads ${rangeLabel}`,
  };
  return (
    <KpiShell
      id="staleLeads"
      className={`kpi-title-xl ${className}`.trim()}
      title="Stale New Leads"
      subtitle={`Created in period, still in New Lead for more than ${s.staleAfterDays} days · as of the last sync`}
      value={
        <>
          <div className="stat-value">{n(s.count)}</div>
          <ProgramSplit army={s.split.army} veteran={s.split.veteran} />
        </>
      }
      pill={<span className="pill pill-neutral">Goal not set</span>}
      goalLine={
        <span>
          {n(s.stillNewLead)} still in New Lead in all · {n(s.count)} past {s.staleAfterDays} days
          {s.estimated > 0 ? ` · ${n(s.estimated)} timed from creation (estimated)` : ""}
        </span>
      }
      deltaLine={<span className="kpi-muted">Days waiting from GHL&apos;s stage-entry time, else from creation.</span>}
      body={
        <div className="kpi-body">
          <table className="stat-breakdown rep-table rep-table-cohort">
            <thead>
              <tr>
                <th>Assigned user</th>
                <th className="num combined">Stale</th>
                <th className="num">Oldest (days)</th>
              </tr>
            </thead>
            <tbody>
              {s.byUser.length === 0 ? (
                <tr>
                  <td colSpan={3} className="note">
                    No stale new leads.
                  </td>
                </tr>
              ) : null}
              {s.byUser.map((u) => (
                <tr key={u.userId ?? "unassigned"}>
                  <td className="rep-name">{u.name}</td>
                  <td className="num combined">{n(u.count)}</td>
                  <td className="num">{u.oldestDays.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
      footer={<DrilldownButton spec={spec} label="View stale leads" />}
      notes={s.notes}
    />
  );
}

// ---- 6. source report -----------------------------------------------------------------------------------

function SourceTable({ r, rangeQuery, rangeLabel }: { r: SourceReport; rangeQuery: string; rangeLabel: string }) {
  const spec = (row: SourceRow): DrilldownSpec =>
    leadSpec(
      r.by === "source" ? `kind=leads&which=source&arg=${encodeURIComponent(row.key)}&${rangeQuery}` : `kind=leads&which=campaign&arg=${encodeURIComponent(row.key)}&${rangeQuery}`,
      `${row.label} · ${n(row.leads)} new ${row.leads === 1 ? "lead" : "leads"}`,
      `Contacts created in period · ${rangeLabel}`,
      row.leads,
      r.notes,
      `${row.label} new leads ${rangeLabel}`,
    );
  const cells = (row: SourceRow) => (
    <>
      <td className="num combined">{n(row.leads)}</td>
      <td className="num">{pct(row.leads, r.total.leads)}</td>
      <td className="num" style={{ color: programColors.army }}>
        {n(row.split.army)}
      </td>
      <td className="num" style={{ color: programColors.veteran }}>
        {n(row.split.veteran)}
      </td>
      <td className="num" title={`Both ${n(row.split.both)} · No tag ${n(row.split.untagged)}`}>
        {n(row.split.both + row.split.untagged)}
      </td>
      <td className="num">{n(row.appointment)}</td>
      <td className="num" title={row.withHistory < row.leads ? `Of ${n(row.withHistory)} with milestone history` : undefined}>
        {n(row.submitted)}
        {row.withHistory < row.leads ? <span className="plan-label">of {n(row.withHistory)} w/ history</span> : null}
      </td>
      <td className="num">{n(row.won)}</td>
      <td className="num">{n(row.lost)}</td>
      <td className="num combined">{row.conversion === null ? DASH : `${Math.round(row.conversion * 100)}%`}</td>
    </>
  );
  return (
    <div className="scroll kpi-body">
      <table className="stat-breakdown rep-table rep-table-sources">
        <thead>
          <tr>
            <th>{r.by === "source" ? "Source" : "Campaign tag"}</th>
            <th className="num combined">Leads</th>
            <th className="num">% of total</th>
            <th className="num">Army</th>
            <th className="num">Veteran</th>
            <th className="num">None / Both</th>
            <th className="num">Appt booked</th>
            <th className="num">Submitted</th>
            <th className="num">Won</th>
            <th className="num">Lost</th>
            <th className="num combined" title="Submitted ÷ leads with milestone history">
              Conversion
            </th>
          </tr>
        </thead>
        <tbody>
          {r.rows.map((row) => (
            <RepDrilldownRow key={row.key} spec={spec(row)}>
              <td className="rep-name" title={row.label}>
                {row.label}
              </td>
              {cells(row)}
            </RepDrilldownRow>
          ))}
          <tr className="rep-total">
            <td className="rep-name">{r.total.label}</td>
            {cells(r.total)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const SOURCE_COLORS = [chartSeries[0], chartSeries[3], chartSeries[2], chartSeries[4], chartSeries[5], chartSeries[1]];

export function LeadSourceCard({ bySource, byCampaign, rangeQuery, rangeLabel, className = "" }: { bySource: SourceReport; byCampaign: SourceReport; rangeQuery: string; rangeLabel: string; className?: string }) {
  const top = bySource.rows.slice(0, bySource.topSources);
  const rest = bySource.rows.slice(bySource.topSources);
  const donut = [
    ...top.map((r, i) => ({ label: r.label, value: r.leads, color: SOURCE_COLORS[i % SOURCE_COLORS.length], extra: pct(r.leads, bySource.total.leads) })),
    ...(rest.length > 0 ? [{ label: `Other (${n(rest.length)} sources)`, value: rest.reduce((s, r) => s + r.leads, 0), color: grayA, extra: pct(rest.reduce((s, r) => s + r.leads, 0), bySource.total.leads) }] : []),
  ];
  const conv = bySource.rows
    .filter((r) => r.conversion !== null)
    .map((r, i) => ({ label: r.label.length > 18 ? r.label.slice(0, 17) + "…" : r.label, value: Math.round((r.conversion as number) * 1000) / 10, color: SOURCE_COLORS[bySource.rows.indexOf(r) % SOURCE_COLORS.length] ?? chartSeries[i % 6], text: `${Math.round((r.conversion as number) * 100)}%`, detail: `${n(r.submitted)} submitted of ${n(r.withHistory)} with history` }));
  return (
    <KpiShell
      id="leadSources"
      className={`kpi-title-xl ${className}`.trim()}
      title="Lead Source Report"
      subtitle={`New leads in period by GHL contact source, then by campaign tag · outcomes as of the last sync · ${rangeLabel}`}
      value={
        <div className="stat-pair">
          <div>
            <div className="stat-value">{n(bySource.rows.length)}</div>
            <div className="note">Sources</div>
          </div>
          <div>
            <div className="stat-value">{bySource.total.conversion === null ? DASH : `${Math.round(bySource.total.conversion * 100)}%`}</div>
            <div className="note">Conversion (all new leads)</div>
          </div>
        </div>
      }
      pill={<span className="pill pill-neutral">Goal not set</span>}
      goalLine={
        <span>
          Top source: <b>{bySource.rows[0]?.label ?? DASH}</b> {bySource.rows[0] ? `(${pct(bySource.rows[0].leads, bySource.total.leads)} of new leads)` : ""}
        </span>
      }
      deltaLine={<span className="kpi-muted">Conversion = submitted ÷ leads created after milestone tracking began.</span>}
      chart={
        <div className="source-charts">
          <div>
            <div className="label kpi-notes-title">Leads by source</div>
            <DonutChart segments={donut} total={bySource.total.leads} centerLabel="new leads" size={150} emptyText="No new leads in this period." />
          </div>
          <div>
            <div className="label kpi-notes-title">Conversion % by source</div>
            <HBarChart rows={conv} height={Math.max(120, 30 * conv.length + 20)} maxValue={100} emptyText="No lead with milestone history yet." />
          </div>
        </div>
      }
      body={
        <>
          <SourceTable r={bySource} rangeQuery={rangeQuery} rangeLabel={rangeLabel} />
          <div className="label kpi-notes-title">By campaign tag</div>
          <SourceTable r={byCampaign} rangeQuery={rangeQuery} rangeLabel={rangeLabel} />
        </>
      }
      notes={[...bySource.notes, ...byCampaign.notes]}
    />
  );
}

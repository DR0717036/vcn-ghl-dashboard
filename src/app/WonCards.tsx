// The Won Opportunities row (owner request 2026-10-17): headline with the
// pipeline split and donut, current programs, past semesters, won by
// campaign, application → close rate, and the monthly won line. Same card
// anatomy, drilldown modal, and CSV pattern as the other rows. Cards that
// depend on the snapshot / period toggle are rendered twice and switched on
// the client.

import { chartSeries, programColors, statusColors } from "@/lib/design";
import { MODE_LABEL, n, pct, PROGRAM_KIND_LABEL, usd, type CloseRateResult, type CurrentProgramsResult, type HeadlineResult, type MonthlyResult, type PastSemestersResult, type Totals, type WonByCampaignResult, type WonMode } from "@/lib/wonRow";
import DonutChart from "./charts/DonutChart";
import HBarChart from "./charts/HBarChart";
import LineChart from "./charts/LineChart";
import StackedBarChart from "./charts/StackedBarChart";
import { DrilldownButton, RepDrilldownRow, WON_ROW_COLUMNS, type DrilldownSpec } from "./Drilldown";
import KpiShell from "./KpiShell";

const DASH = "—";
const BEST_GOLD = "#e0b400";
const KIND_COLOR = { army: programColors.army, veteran: programColors.veteran, partner: chartSeries[2], other: "#8a97a8" } as const;

/** "$12,345 · 3 at $0 · 2 missing a value" */
export function valueText(t: Totals): string {
  const parts = [usd(t.value)];
  if (t.zeroValue > 0) parts.push(`${n(t.zeroValue)} at $0`);
  if (t.valueMissing > 0) parts.push(`${n(t.valueMissing)} missing a value`);
  return parts.join(" · ");
}

function spec(query: string, title: string, subtitle: string, expected: number | null, notes: string[], csvName: string, extra?: Partial<DrilldownSpec>): DrilldownSpec {
  return { query, title, subtitle, expected, columns: WON_ROW_COLUMNS, notes, csvName, ...extra };
}

function modeSub(mode: WonMode, rangeLabel: string): string {
  return mode === "current" ? "snapshot as of the last sync" : `won during ${rangeLabel}`;
}

// ---- 1. headline ---------------------------------------------------------------------------

export function WonHeadlineCard({ h, mode, rangeQuery, rangeLabel, className = "" }: { h: HeadlineResult; mode: WonMode; rangeQuery: string; rangeLabel: string; className?: string }) {
  const q = `kind=won&mode=${mode}&${rangeQuery}`;
  const programPipes = h.byPipeline.filter((p) => p.kind === "army" || p.kind === "veteran");
  const donut = programPipes
    .filter((p) => p.totals.count > 0)
    .map((p) => ({ label: p.name, value: p.totals.count, color: KIND_COLOR[p.kind], extra: `${usd(p.totals.value)} · ${pct(p.totals.count, h.total.count)}` }));
  const allSpec = spec(`${q}&which=all`, `Won opportunities · ${n(h.total.count)}`, `${MODE_LABEL[mode]} · Army CA + Veteran G.I. Bill pipelines · ${modeSub(mode, rangeLabel)}`, h.total.count, h.notes, `Won opportunities ${mode} ${rangeLabel}`, {
    segments: [
      { key: "army", label: "Army CA", expected: h.byPipeline.find((p) => p.kind === "army")?.totals.count ?? 0 },
      { key: "veteran", label: "Veteran G.I. Bill", expected: h.byPipeline.find((p) => p.kind === "veteran")?.totals.count ?? 0 },
    ],
  });
  const crmSpec = spec(`${q}&which=crm`, `Won opportunities · entire CRM · ${n(h.entireCrm.count)}`, `${MODE_LABEL[mode]} · every pipeline in the connected sub-account · ${modeSub(mode, rangeLabel)}`, h.entireCrm.count, h.notes, `Won opportunities entire CRM ${mode} ${rangeLabel}`);
  const table = (
    <div className="kpi-body">
      <table className="stat-breakdown rep-table rep-table-cohort">
        <thead>
          <tr>
            <th>Pipeline</th>
            <th className="num combined">Won</th>
            <th className="num">Share</th>
            <th className="num combined">Opportunity Value</th>
            <th className="num">Avg value</th>
          </tr>
        </thead>
        <tbody>
          {programPipes.map((p) => (
            <RepDrilldownRow key={p.pipelineId} spec={spec(`${q}&which=pipeline&arg=${encodeURIComponent(p.pipelineId)}`, `${p.name} · ${n(p.totals.count)} won`, `${MODE_LABEL[mode]} · ${modeSub(mode, rangeLabel)}`, p.totals.count, h.notes, `${p.name} won ${mode} ${rangeLabel}`)}>
              <td className="rep-name">
                <span className="stat-split-dot" style={{ background: KIND_COLOR[p.kind], marginRight: 6 }} />
                {p.name}
                <span className="plan-label">{PROGRAM_KIND_LABEL[p.kind]}</span>
              </td>
              <td className="num combined">{n(p.totals.count)}</td>
              <td className="num">{pct(p.totals.count, h.total.count)}</td>
              <td className="num combined" title={valueText(p.totals)}>
                {usd(p.totals.value)}
                {p.totals.valueMissing > 0 || p.totals.zeroValue > 0 ? <span className="plan-label">{valueText(p.totals).split(" · ").slice(1).join(" · ")}</span> : null}
              </td>
              <td className="num">{p.totals.count - p.totals.valueMissing > 0 ? usd(p.totals.value / (p.totals.count - p.totals.valueMissing)) : DASH}</td>
            </RepDrilldownRow>
          ))}
          <tr className="rep-total">
            <td className="rep-name">Army CA + Veteran G.I. Bill</td>
            <td className="num combined">{n(h.total.count)}</td>
            <td className="num">{h.total.count > 0 ? "100%" : DASH}</td>
            <td className="num combined">{usd(h.total.value)}</td>
            <td className="num">{h.total.count - h.total.valueMissing > 0 ? usd(h.total.value / (h.total.count - h.total.valueMissing)) : DASH}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
  const army = h.byPipeline.find((p) => p.kind === "army");
  const vet = h.byPipeline.find((p) => p.kind === "veteran");
  return (
    <KpiShell
      id={`wonHeadline-${mode}`}
      className={`kpi-title-xl ${className}`.trim()}
      title="Total Won Opportunity Value"
      subtitle={`sum of won opportunity values · not cash collected · ${MODE_LABEL[mode]} · Army CA + Veteran G.I. Bill pipelines`}
      value={
        <div className="stat-pair">
          <div>
            <div className="stat-value">{usd(h.total.value)}</div>
            <div className="note">Won Opportunity Value{h.total.valueMissing > 0 ? ` (${n(h.total.valueMissing)} missing)` : ""}</div>
          </div>
          <div>
            <div className="stat-value">{n(h.total.count)}</div>
            <div className="note">Won opportunities</div>
          </div>
        </div>
      }
      pill={<span className="pill pill-neutral">Goal not set</span>}
      goalLine={
        <span>
          <span className="stat-split-dot" style={{ background: programColors.army, marginRight: 4 }} />
          Army CA <b>{n(army?.totals.count ?? 0)}</b> · {usd(army?.totals.value ?? 0)}
          {"   "}
          <span className="stat-split-dot" style={{ background: programColors.veteran, margin: "0 4px 0 12px" }} />
          Veteran G.I. Bill <b>{n(vet?.totals.count ?? 0)}</b> · {usd(vet?.totals.value ?? 0)}
        </span>
      }
      deltaLine={<span className="kpi-muted">{mode === "period" ? `${n(h.reversals)} reopened / reversed in period (listed, never subtracted).` : "Snapshot of status = won in the two program pipelines, at current Opportunity Value."} Entire CRM is in Details.</span>}
      chart={
        <div className="lead-donut">
          <DonutChart segments={donut} total={h.total.count} centerLabel="won" size={150} emptyText="No won opportunities." />
        </div>
      }
      body={table}
      footer={<DrilldownButton spec={allSpec} label="View all won opportunities" />}
      breakdown={[
        { label: "Entire CRM · won opportunities (every pipeline)", value: n(h.entireCrm.count) },
        { label: "Entire CRM · Won Opportunity Value", value: usd(h.entireCrm.value) },
        { label: "…of which outside the program pipelines (Partner Inquiry and others)", value: `${n(h.nonProgram.count)} · ${usd(h.nonProgram.value)}` },
      ]}
      details={
        <div className="cohort-sub-actions">
          <DrilldownButton spec={crmSpec} label="View entire CRM won opportunities" />
        </div>
      }
      notes={h.notes}
    />
  );
}

// ---- 2. current programs ---------------------------------------------------------------------------

export function CurrentProgramsCard({ c, mode, rangeQuery, rangeLabel, className = "" }: { c: CurrentProgramsResult; mode: WonMode; rangeQuery: string; rangeLabel: string; className?: string }) {
  const q = `kind=won&mode=${mode}&${rangeQuery}`;
  const programName = (p: "army" | "veteran") => (p === "army" ? "Army" : "Veteran");
  const bars = c.stages.map((s) => ({ label: `${programName(s.program)} · ${s.short}`, value: s.totals.value, color: programColors[s.program], text: `${usd(s.totals.value)} · ${n(s.totals.count)} won`, detail: s.label }));
  return (
    <KpiShell
      id={`wonPrograms-${mode}`}
      className={`kpi-title-xl kpi-chart-fit ${className}`.trim()}
      title="Current Programs"
      subtitle={`Won in ${c.stages.map((s) => s.label).join(" + ")} · ${MODE_LABEL[mode]}`}
      value={
        <div className="stat-pair">
          <div>
            <div className="stat-value">{n(c.combined.count)}</div>
            <div className="note">Won · combined</div>
          </div>
          <div>
            <div className="stat-value">{usd(c.combined.value)}</div>
            <div className="note">Opportunity Value{c.combined.valueMissing > 0 ? ` (${n(c.combined.valueMissing)} missing)` : ""}</div>
          </div>
        </div>
      }
      pill={c.discrepancyCount > 0 ? <span className="pill pill-warn">{n(c.discrepancyCount)} not won</span> : <span className="pill pill-ok">No discrepancies</span>}
      goalLine={
        <span className="won-split">
          {c.stages.map((s) => (
            <span key={s.key}>
              <span className="stat-split-dot" style={{ background: programColors[s.program], marginRight: 4 }} />
              {programName(s.program)} · {s.label}: <b>{n(s.totals.count)}</b> · {usd(s.totals.value)}
            </span>
          ))}
        </span>
      }
      deltaLine={
        <span className="kpi-muted">
          {c.discrepancyCount > 0
            ? `Discrepancies: ${c.stages
                .filter((s) => s.discrepancies.length > 0)
                .map((s) => `${s.label} ${s.discrepancies.map((d) => `${n(d.count)} ${d.status}`).join(", ")}`)
                .join(" · ")} — in a won stage but status not won; counted in no won total.`
            : "No opportunity sits in any of these stages with a status other than won."}
          {c.otherWonStages.length > 0 ? ` Other won stages in the program pipelines: ${c.otherWonStages.map((s) => `${s.stageName} ${n(s.count)}`).join(", ")}.` : ""}
        </span>
      }
      chart={<HBarChart rows={bars} height={84} emptyText="No won opportunities in these stages." />}
      footer={<DrilldownButton spec={spec(`${q}&which=programs`, `Current programs · ${n(c.combined.count)} won`, `${MODE_LABEL[mode]} · ${modeSub(mode, rangeLabel)}`, c.combined.count, c.notes, `Current programs won ${mode} ${rangeLabel}`, { segments: c.stages.map((s) => ({ key: `stage:${s.key}`, label: s.label, expected: s.totals.count })) })} label="View won opportunities" />}
      notes={c.notes}
    />
  );
}

// ---- 3. past semesters ---------------------------------------------------------------------------

export function PastSemestersCard({ p, mode, rangeQuery, rangeLabel, className = "" }: { p: PastSemestersResult; mode: WonMode; rangeQuery: string; rangeLabel: string; className?: string }) {
  const q = `kind=won&mode=${mode}&${rangeQuery}`;
  const bars = [
    ...p.rows.map((r) => ({ label: r.best ? `${r.short} ★` : r.short, value: r.totals.value, color: r.best ? BEST_GOLD : programColors.veteran, text: `${usd(r.totals.value)} · ${n(r.totals.count)} won`, detail: r.best ? `${r.label} · best by won $ (rank ${r.rankCount} by count)` : `${r.label} · rank ${r.rankValue} by won $, ${r.rankCount} by count` })),
    ...p.current.map((s) => ({ label: `${s.short} (current)`, value: s.totals.value, color: chartSeries[3], text: `${usd(s.totals.value)} · ${n(s.totals.count)} won`, detail: `${s.label} · for comparison` })),
  ];
  const table = (
    <div className="kpi-body">
      <table className="stat-breakdown rep-table rep-table-cohort rep-table-past">
        <colgroup>
          <col className="col-sem" />
          <col className="col-num" />
          <col className="col-val" />
          <col className="col-num" />
          <col className="col-num" />
        </colgroup>
        <thead>
          <tr>
            <th>Semester</th>
            <th className="num combined">Won</th>
            <th className="num combined">Opportunity Value</th>
            <th className="num" title="Distinct contacts assumed to have reached the application stage (current stage in the semester's path, or lost from it)">
              Reached application
            </th>
            <th className="num" title="Won ÷ reached application">Won ÷ reached</th>
          </tr>
        </thead>
        <tbody>
          {p.rows.map((r) => (
            <RepDrilldownRow key={r.key} className={r.best ? "row-best" : undefined} spec={spec(`${q}&which=stage&arg=${encodeURIComponent(r.stageId)}`, `${r.label} · ${n(r.totals.count)} won`, `${MODE_LABEL[mode]} · ${modeSub(mode, rangeLabel)}`, r.totals.count, p.notes, `${r.short} won ${mode} ${rangeLabel}`)}>
              <td className="rep-name" title={`${r.label} · application stage: ${r.applicationStageName}${r.best ? ` · best by won $ · rank ${r.rankCount} by count` : ` · rank ${r.rankValue} by won $, ${r.rankCount} by count`}`}>
                {r.short}
                {r.best ? <span className="pill pill-gold leader-badge" title={`Highest won Opportunity Value of the past semesters; rank ${r.rankCount} by won count`}>Best</span> : null}
                <span className="plan-label">{r.label.replace("Enrolled/ Won ", "").replace(/[()]/g, "")}</span>
              </td>
              <td className="num combined">{n(r.totals.count)}</td>
              <td className="num combined" title={valueText(r.totals)}>
                {usd(r.totals.value)}
              </td>
              <td className="num" title={r.reachedShared ? "SS1 and SS2 share one application stage; this figure is the same on both rows and counted once in the total" : undefined}>
                {n(r.reached)}
                {r.reachedShared ? <span className="plan-label">SS1 & SS2 combined</span> : null}
              </td>
              <td className="num">{r.reachedShared ? DASH : pct(r.totals.count, r.reached)}</td>
            </RepDrilldownRow>
          ))}
          <tr className="rep-total">
            <td className="rep-name">Combined</td>
            <td className="num combined">{n(p.total.count)}</td>
            <td className="num combined">{usd(p.total.value)}</td>
            <td className="num">{n(p.reachedTotal)}</td>
            <td className="num">{pct(p.total.count, p.reachedTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
  return (
    <KpiShell
      id={`wonPast-${mode}`}
      className={`kpi-title-xl ${className}`.trim()}
      title="Past Semesters"
      subtitle={`Won in FS1, Summer Session 1, Summer Session 2 · reached-application counts assumed from current stage · ${MODE_LABEL[mode]}`}
      value={
        <div className="stat-pair">
          <div>
            <div className="stat-value">{n(p.total.count)}</div>
            <div className="note">Won · past semesters</div>
          </div>
          <div>
            <div className="stat-value">{usd(p.total.value)}</div>
            <div className="note">Opportunity Value{p.total.valueMissing > 0 ? ` (${n(p.total.valueMissing)} missing)` : ""}</div>
          </div>
        </div>
      }
      pill={<span className="pill pill-neutral">Historical</span>}
      goalLine={
        <span>
          {p.rows.map((r) => `${r.short} ${n(r.totals.count)} · ${usd(r.totals.value)}`).join("   ")}
        </span>
      }
      deltaLine={<span className="kpi-muted">Reached application is a snapshot assumption (no stage history for these semesters); the current semesters ({p.current.map((s) => s.short).join(", ")}) are shown on the chart for comparison.</span>}
      chart={<HBarChart rows={bars} height={150} emptyText="No won opportunities in past semesters." />}
      body={table}
      footer={<DrilldownButton spec={spec(`${q}&which=past`, `Past semesters · ${n(p.total.count)} won`, `${MODE_LABEL[mode]} · ${modeSub(mode, rangeLabel)}`, p.total.count, p.notes, `Past semesters won ${mode} ${rangeLabel}`)} label="View won opportunities" />}
      notes={p.notes}
    />
  );
}

// ---- 4. won by campaign ---------------------------------------------------------------------------

export function WonByCampaignCard({ w, mode, rangeQuery, rangeLabel, className = "" }: { w: WonByCampaignResult; mode: WonMode; rangeQuery: string; rangeLabel: string; className?: string }) {
  const q = `kind=won&mode=${mode}&${rangeQuery}`;
  const rows = [...w.rows, w.none];
  const cells = (r: WonByCampaignResult["rows"][number]) => (
    <>
      <td className="num combined">{n(r.totals.count)}</td>
      <td className="num combined" title={valueText(r.totals)}>
        {usd(r.totals.value)}
      </td>
      <td className="num" style={{ color: programColors.army }}>
        {n(r.army.count)}
        <span className="plan-label">{usd(r.army.value)}</span>
      </td>
      <td className="num" style={{ color: programColors.veteran }}>
        {n(r.veteran.count)}
        <span className="plan-label">{usd(r.veteran.value)}</span>
      </td>
      <td className="stages">{r.stages.length ? r.stages.map((s) => `${s.stageName} ${n(s.count)}`).join(" · ") : DASH}</td>
    </>
  );
  const table = (
    <div className="scroll kpi-body">
      <table className="stat-breakdown rep-table rep-table-wonCampaign">
        <thead>
          <tr>
            <th>Campaign tag</th>
            <th className="num combined">Won</th>
            <th className="num combined">Opportunity Value</th>
            <th className="num">Army</th>
            <th className="num">Veteran</th>
            <th className="stages">Won stage they sit in</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <RepDrilldownRow key={r.key} spec={spec(`${q}&which=campaign&arg=${encodeURIComponent(r.key)}`, `${r.label} · ${n(r.totals.count)} won`, `${MODE_LABEL[mode]} · ${modeSub(mode, rangeLabel)}`, r.totals.count, w.notes, `${r.label} won ${mode} ${rangeLabel}`)}>
              <td className={r.key === "none" ? "note" : "rep-name"}>{r.label}</td>
              {cells(r)}
            </RepDrilldownRow>
          ))}
          <tr className="rep-total">
            <td className="rep-name">{w.total.label}</td>
            {cells(w.total)}
          </tr>
        </tbody>
      </table>
    </div>
  );
  return (
    <KpiShell
      id={`wonCampaign-${mode}`}
      className={`kpi-title-xl ${className}`.trim()}
      title="Won by Campaign"
      subtitle={`Won opportunities whose contact carries a campaign tag · Army / Veteran by pipeline · ${MODE_LABEL[mode]}`}
      value={
        <div className="stat-pair">
          <div>
            <div className="stat-value">{n(w.rows.reduce((s, r) => s + r.totals.count, 0))}</div>
            <div className="note">Won with a campaign tag (counted per tag)</div>
          </div>
          <div>
            <div className="stat-value">{n(w.none.totals.count)}</div>
            <div className="note">Won with no campaign tag</div>
          </div>
        </div>
      }
      pill={<span className="pill pill-neutral">Goal not set</span>}
      goalLine={
        <span>
          {n(w.total.totals.count)} won in all · {n(w.multi)} with more than one campaign tag (counted under each, once in the total)
        </span>
      }
      deltaLine={<span className="kpi-muted">Campaign tags come from config/leads.json; the total never exceeds the headline.</span>}
      chart={
        <StackedBarChart
          height={Math.max(140, 34 * rows.length + 30)}
          legend={[
            { label: "Army CA", value: 0, color: programColors.army },
            { label: "Veteran G.I. Bill", value: 0, color: programColors.veteran },
            { label: "Other", value: 0, color: "#8a97a8" },
          ]}
          rows={rows.map((r) => ({
            label: r.label,
            segments: [
              { label: "Army CA", value: r.army.count, color: programColors.army },
              { label: "Veteran G.I. Bill", value: r.veteran.count, color: programColors.veteran },
              { label: "Other", value: r.other.count, color: "#8a97a8" },
            ],
          }))}
          emptyText="No won opportunities."
        />
      }
      body={table}
      notes={w.notes}
    />
  );
}

// ---- 5. application → close rate ---------------------------------------------------------------------------

const CLOSE_COLORS = { won: statusColors.good, lost: statusColors.bad, still: chartSeries[0], other: "#8a97a8" } as const;

export function CloseRateCard({ c, rangeQuery, className = "" }: { c: CloseRateResult; rangeQuery: string; className?: string }) {
  const rowSpec = (r: CloseRateResult["rows"][number]): DrilldownSpec => ({
    query: `kind=won&which=group&arg=${encodeURIComponent(r.key)}&${rangeQuery}`,
    title: `${r.label} · ${n(r.cohort)} applications`,
    subtitle: `${r.basis === "tracked" ? "Tracked from milestone events plus current stage" : r.basis === "assumed" ? "Assumed from current stage" : "All groups"} · as of the last sync`,
    expected: r.cohort,
    columns: ["name", "pipeline", "stage", "status", "value", "wonOn", "assignedUser", "campaigns"],
    segments: [
      { key: "cohort", label: "Cohort", expected: r.cohort },
      { key: "won", label: "Won", expected: r.won },
      { key: "lost", label: "Lost", expected: r.lost },
      { key: "still", label: "Still in application", expected: r.still },
      { key: "other", label: "Other", expected: r.other },
    ],
    notes: c.notes,
    csvName: `Close rate ${r.key}`,
  });
  const table = (
    <div className="scroll kpi-body">
      <table className="stat-breakdown rep-table rep-table-close">
        <thead>
          <tr>
            <th>Reporting group</th>
            <th>Basis</th>
            <th className="num combined">Cohort</th>
            <th className="num">Won</th>
            <th className="num">Lost</th>
            <th className="num">Still in application</th>
            <th className="num">Other</th>
            <th className="num combined">Close rate</th>
          </tr>
        </thead>
        <tbody>
          {c.rows.map((r) => (
            <RepDrilldownRow key={r.key} spec={rowSpec(r)}>
              <td className={r.key === "ALL" ? "rep-name" : "rep-name"}>
                {r.label}
                <span className="plan-label">{r.applicationStageName}</span>
              </td>
              <td>
                <span className={`pill ${r.basis === "tracked" ? "pill-info" : r.basis === "assumed" ? "pill-warn" : "pill-neutral"}`}>{r.basis === "tracked" ? "tracked" : r.basis === "assumed" ? "assumed path" : "mixed"}</span>
              </td>
              <td className="num combined">{n(r.cohort)}</td>
              <td className="num outcome-cell">
                {n(r.won)}
                <span className="outcome-pct">{pct(r.won, r.cohort)}</span>
              </td>
              <td className="num outcome-cell">
                {n(r.lost)}
                <span className="outcome-pct">{pct(r.lost, r.cohort)}</span>
              </td>
              <td className="num outcome-cell">
                {n(r.still)}
                <span className="outcome-pct">{pct(r.still, r.cohort)}</span>
              </td>
              <td className="num outcome-cell">
                {n(r.other)}
                <span className="outcome-pct">{pct(r.other, r.cohort)}</span>
              </td>
              <td className="num combined">{r.closeRate === null ? DASH : `${Math.round(r.closeRate * 100)}%`}</td>
            </RepDrilldownRow>
          ))}
        </tbody>
      </table>
    </div>
  );
  const all = c.rows.find((r) => r.key === "ALL");
  const fs2 = c.rows.find((r) => r.key === "FS2");
  return (
    <KpiShell
      id="wonCloseRate"
      className={`kpi-title-xl ${className}`.trim()}
      title="Application → Close Rate"
      subtitle={`FS1 / SS based on current stage, assumed path · ${c.rows.filter((r) => r.basis === "tracked").map((r) => r.key).join(" and ")} tracked · as of the last sync`}
      value={
        <div className="stat-pair">
          <div>
            <div className="stat-value">{all && all.closeRate !== null ? `${Math.round(all.closeRate * 100)}%` : DASH}</div>
            <div className="note">Close rate · all groups</div>
          </div>
          <div>
            <div className="stat-value">{fs2 && fs2.closeRate !== null ? `${Math.round(fs2.closeRate * 100)}%` : DASH}</div>
            <div className="note">Close rate · FS2 (tracked)</div>
          </div>
        </div>
      }
      pill={<span className="pill pill-neutral">Goal not set</span>}
      goalLine={<span>{all ? `${n(all.won)} won · ${n(all.lost)} lost · ${n(all.still)} still in application · ${n(all.other)} other, of ${n(all.cohort)} applications` : DASH}</span>}
      deltaLine={<span className="kpi-muted">Close rate = won ÷ applications. Cohorts are not affected by the date range or the snapshot / period toggle.</span>}
      chart={
        <StackedBarChart
          height={Math.max(140, 34 * c.rows.length + 30)}
          legend={[
            { label: "Won", value: 0, color: CLOSE_COLORS.won },
            { label: "Lost", value: 0, color: CLOSE_COLORS.lost },
            { label: "Still in application", value: 0, color: CLOSE_COLORS.still },
            { label: "Other", value: 0, color: CLOSE_COLORS.other },
          ]}
          rows={c.rows.map((r) => ({
            label: r.key,
            segments: [
              { label: "Won", value: r.won, color: CLOSE_COLORS.won },
              { label: "Lost", value: r.lost, color: CLOSE_COLORS.lost },
              { label: "Still in application", value: r.still, color: CLOSE_COLORS.still },
              { label: "Other", value: r.other, color: CLOSE_COLORS.other },
            ],
          }))}
          emptyText="No applications found."
        />
      }
      body={table}
      notes={c.notes}
    />
  );
}

// ---- 6. monthly won line ---------------------------------------------------------------------------

export function WonMonthlyCard({ m, className = "" }: { m: MonthlyResult; className?: string }) {
  const totalArmy = m.points.reduce((s, p) => s + p.army, 0);
  const totalVet = m.points.reduce((s, p) => s + p.veteran, 0);
  return (
    <KpiShell
      id="wonMonthly"
      className={`kpi-title-xl kpi-chart-auto ${className}`.trim()}
      title="Won $ by Month"
      subtitle={`Opportunity Value at the won event, per month, last ${m.months} months · both program pipelines`}
      value={
        <div className="stat-pair">
          <div>
            <div className="stat-value" style={{ color: programColors.army }}>
              {usd(totalArmy)}
            </div>
            <div className="note">Army CA · {m.months} months</div>
          </div>
          <div>
            <div className="stat-value" style={{ color: programColors.veteran }}>
              {usd(totalVet)}
            </div>
            <div className="note">Veteran G.I. Bill · {m.months} months</div>
          </div>
        </div>
      }
      pill={<span className="pill pill-neutral">Goal not set</span>}
      goalLine={<span className="kpi-muted">By the month of GHL&apos;s status-change time (America/New_York).</span>}
      deltaLine={<span className="kpi-muted">Not affected by the date range or the snapshot / period toggle.</span>}
      chart={
        <LineChart
          height={260}
          leftLabel="Won $"
          series={[
            { label: "Army CA", color: programColors.army, points: m.points.map((p) => ({ label: p.label, value: p.army })), format: "usd" },
            { label: "Veteran G.I. Bill", color: programColors.veteran, points: m.points.map((p) => ({ label: p.label, value: p.veteran })), format: "usd" },
          ]}
        />
      }
      notes={m.notes}
    />
  );
}

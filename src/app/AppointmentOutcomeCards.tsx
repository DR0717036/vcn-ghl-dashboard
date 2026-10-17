// Appointments row, cards 4–6 (owner request 2026-10-17): the appointment →
// outcome cohort with its funnel, post-appointment losses with the NGT
// follow-up, and the Army vs Veteran comparison. Same card anatomy and
// drilldown pattern as the rest of the row.

import { programColors, statusColors } from "@/lib/design";
import { pct, type Split } from "@/lib/appointments";
import type { CompareLine, CompareResult, LossesResult, OutcomeResult } from "@/lib/appointmentOutcomes";
import { fmtDateTime } from "@/lib/dates";
import { DrilldownButton, LOST_COLUMNS, NGT_COLUMNS, OUTCOME_COLUMNS, type DrilldownSpec } from "./Drilldown";
import KpiShell from "./KpiShell";
import { ProgramSplit } from "./AppointmentCards";
import PairedHBarChart from "./charts/PairedHBarChart";

const n = (v: number) => v.toLocaleString("en-US");
const DASH = "—";
const pctOrDash = (v: number | null) => (v === null ? DASH : `${Math.round(v * 100)}%`);

/** One row of a three-column (Army / Veteran / Total) count table, with optional % of a base split. */
function SplitRow({ label, s, base, title, strong = false, muted = false }: { label: string; s: Split; base?: Split; title?: string; strong?: boolean; muted?: boolean }) {
  const cell = (v: number, b?: number, combined = false) => (
    <td className={`num${combined ? " combined" : ""}${muted ? " note" : ""}`}>
      {n(v)}
      {base && b !== undefined ? <span className="plan-label">{pct(v, b)}</span> : null}
    </td>
  );
  return (
    <tr className={strong ? "row-strong" : undefined} title={title}>
      <td className={muted ? "note" : "rep-name"}>{label}</td>
      {cell(s.army, base?.army)}
      {cell(s.veteran, base?.veteran)}
      {cell(s.total, base?.total, true)}
    </tr>
  );
}

function SplitHead({ first = "Step", extra }: { first?: string; extra?: string }) {
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
        <th className="num combined">{extra ?? "Total"}</th>
      </tr>
    </thead>
  );
}

// ---- 4. appointment → outcome ---------------------------------------------------------------------

export function AppointmentOutcomeCard({ o, rangeQuery, rangeLabel, className = "" }: { o: OutcomeResult; rangeQuery: string; rangeLabel: string; className?: string }) {
  const spec: DrilldownSpec = {
    query: `kind=apptOutcome&${rangeQuery}`,
    title: `Appointment → Outcome · ${n(o.cohort.total)} contacts`,
    subtitle: `Contacts with an appointment scheduled in the range, judged as of ${fmtDateTime(o.asOf)} · ${rangeLabel}`,
    expected: o.cohort.total,
    facts: [
      { label: "Cohort", value: n(o.cohort.total) },
      { label: "With history", value: n(o.withHistory.total) },
      { label: "Showed", value: n(o.showed.total) },
      { label: "Converted", value: `${n(o.converted.total)} (${pctOrDash(o.conversionRate.total)})` },
      { label: "Won", value: `${n(o.won.total)} (${pctOrDash(o.wonRate.total)})` },
      { label: "Lost", value: n(o.lost.total) },
    ],
    columns: OUTCOME_COLUMNS,
    segments: [
      { key: "cohort", label: "Cohort (booked)", expected: o.cohort.total },
      { key: "showed", label: "Showed", expected: o.showed.total },
      { key: "ca101", label: "CA 101 submitted", expected: o.ca101.total },
      { key: "fs2", label: "IAU App (FS2)", expected: o.fs2.total },
      { key: "ngt", label: o.ngtStageName, expected: o.ngt.total },
      { key: "converted", label: "Converted (any)", expected: o.converted.total },
      { key: "won", label: "Won", expected: o.won.total },
      { key: "lost", label: "Lost", expected: o.lost.total },
      { key: "historyUnavailable", label: "History unavailable", expected: o.historyUnavailable.total },
    ],
    notes: o.notes,
    csvName: `Appointment outcome cohort ${rangeLabel}`,
  };
  const unavailable = o.withHistory.total === 0 && o.cohort.total > 0;
  const body = (
    <div className="kpi-body">
      <table className="stat-breakdown rep-table rep-table-cohort">
        <colgroup>
          <col className="col-name" />
          <col className="col-num" />
          <col className="col-num" />
          <col className="col-num" />
        </colgroup>
        <SplitHead first="Outcome since the appointment" />
        <tbody>
          <SplitRow label="Cohort: appointment scheduled in period" s={o.cohort} strong />
          <SplitRow label="…with milestone history (basis for %)" s={o.withHistory} base={o.cohort} muted />
          <SplitRow label="CA 101 submitted" s={o.ca101} base={o.withHistory} />
          <SplitRow label="IAU App Submitted (FS2)" s={o.fs2} base={o.withHistory} />
          <SplitRow label={o.ngtStageName} s={o.ngt} base={o.withHistory} />
          <SplitRow label="Converted (any of the three)" s={o.converted} base={o.withHistory} strong />
        </tbody>
      </table>
      <div className="label kpi-notes-title">Outcome funnel · same cohort</div>
      <table className="stat-breakdown rep-table rep-table-cohort">
        <colgroup>
          <col className="col-name" />
          <col className="col-num" />
          <col className="col-num" />
          <col className="col-num" />
        </colgroup>
        <SplitHead />
        <tbody>
          <SplitRow label="Booked (cohort)" s={o.cohort} base={o.cohort} />
          <SplitRow label="→ Showed" s={o.showed} base={o.cohort} />
          <SplitRow label="→ Converted (with history)" s={o.converted} base={o.withHistory} />
          <SplitRow label="→ Won" s={o.won} base={o.cohort} strong />
          <SplitRow label="Lost (side branch)" s={o.lost} base={o.cohort} muted />
        </tbody>
      </table>
      {o.historyUnavailable.total > 0 ? (
        <p className="note kpi-reason">
          History unavailable for {n(o.historyUnavailable.total)} of {n(o.cohort.total)} cohort contacts: their appointment was before milestone tracking began
          {o.historyStart ? ` (${fmtDateTime(o.historyStart)})` : ""}. They are excluded from the conversion %, but still counted for Showed, Won, and Lost.
        </p>
      ) : null}
    </div>
  );
  return (
    <KpiShell
      id="appointmentOutcome"
      className={`kpi-title-xl ${className}`.trim()}
      title="Appointment → Outcome"
      subtitle={`Cohort: contacts with an appointment scheduled in period · outcomes as of ${fmtDateTime(o.asOf)}`}
      value={
        unavailable ? (
          <>
            <div className="stat-value unavailable">unavailable</div>
            <div className="note kpi-reason">No cohort contact has an appointment after milestone tracking began.</div>
          </>
        ) : (
          <>
            <div className="stat-value" title={`${n(o.converted.total)} converted of ${n(o.withHistory.total)} with history`}>
              {pctOrDash(o.conversionRate.total)}
            </div>
            <ProgramSplit army={o.converted.army} veteran={o.converted.veteran} armyTitle={`Army converted · ${pctOrDash(o.conversionRate.army)} of ${n(o.withHistory.army)}`} veteranTitle={`Veteran converted · ${pctOrDash(o.conversionRate.veteran)} of ${n(o.withHistory.veteran)}`} />
          </>
        )
      }
      pill={<span className="pill pill-neutral">Goal not set</span>}
      goalLine={
        <span>
          Converted: <b>{n(o.converted.total)}</b> of {n(o.withHistory.total)} with history · Won: <b>{n(o.won.total)}</b> of {n(o.cohort.total)} ({pctOrDash(o.wonRate.total)})
        </span>
      }
      deltaLine={<span className="kpi-muted">Cohort of {n(o.cohort.total)} contacts · first achievement per contact · outcomes judged as of the last sync</span>}
      chart={
        <PairedHBarChart
          height={230}
          seriesA={{ label: "Army", color: programColors.army }}
          seriesB={{ label: "Veteran", color: programColors.veteran }}
          rows={[
            { label: "Booked (cohort)", a: o.cohort.army, b: o.cohort.veteran, aDetail: "100%", bDetail: "100%" },
            { label: "Showed", a: o.showed.army, b: o.showed.veteran, aDetail: `${pct(o.showed.army, o.cohort.army)} of cohort`, bDetail: `${pct(o.showed.veteran, o.cohort.veteran)} of cohort` },
            { label: "Converted", a: o.converted.army, b: o.converted.veteran, aDetail: `${pct(o.converted.army, o.withHistory.army)} of ${n(o.withHistory.army)} with history`, bDetail: `${pct(o.converted.veteran, o.withHistory.veteran)} of ${n(o.withHistory.veteran)} with history` },
            { label: "Won", a: o.won.army, b: o.won.veteran, aDetail: `${pct(o.won.army, o.cohort.army)} of cohort`, bDetail: `${pct(o.won.veteran, o.cohort.veteran)} of cohort` },
            { label: "Lost (side branch)", a: o.lost.army, b: o.lost.veteran, aDetail: `${pct(o.lost.army, o.cohort.army)} of cohort`, bDetail: `${pct(o.lost.veteran, o.cohort.veteran)} of cohort`, muted: true },
          ]}
        />
      }
      body={body}
      footer={<DrilldownButton spec={spec} label="View cohort" />}
      notes={o.notes}
    />
  );
}

// ---- 5. post-appointment losses -----------------------------------------------------------------------

export function PostAppointmentLossesCard({ l, rangeQuery, rangeLabel, className = "" }: { l: LossesResult; rangeQuery: string; rangeLabel: string; className?: string }) {
  const lostSpec: DrilldownSpec = {
    query: `kind=apptLost&${rangeQuery}`,
    title: `Lost after showing · ${n(l.lostAfterShowed.total)} contacts`,
    subtitle: `Showed in the range, opportunity lost afterwards · ${rangeLabel}`,
    expected: l.lostAfterShowed.total,
    facts: l.lostByStage.map((s) => ({ label: `Lost from ${s.stage} (${s.pipeline})`, value: n(s.count) })),
    columns: LOST_COLUMNS,
    notes: l.notes,
    csvName: `Lost after showing ${rangeLabel}`,
  };
  const ngtSpec: DrilldownSpec = {
    query: `kind=apptNgt&${rangeQuery}`,
    title: `${l.ngt.stageName} · ${n(l.ngt.entered.total)} entries`,
    subtitle: `Entered the stage in the range, with what they became since · ${rangeLabel}`,
    expected: l.ngt.entered.total,
    columns: NGT_COLUMNS,
    segments: [
      { key: "entered", label: "Entered NGT", expected: l.ngt.entered.total },
      { key: "fs2", label: "IAU App (FS2)", expected: l.ngt.fs2.total },
      { key: "won", label: "Won", expected: l.ngt.won.total },
      { key: "lost", label: "Lost", expected: l.ngt.lost.total },
      { key: "open", label: "Still open", expected: l.ngt.open.total },
    ],
    notes: l.notes,
    csvName: `NGT entries ${rangeLabel}`,
  };
  const body = (
    <div className="kpi-body">
      <table className="stat-breakdown rep-table rep-table-cohort">
        <colgroup>
          <col className="col-name" />
          <col className="col-num" />
          <col className="col-num" />
          <col className="col-num" />
        </colgroup>
        <SplitHead first="After showing" />
        <tbody>
          <SplitRow label="Contacts who showed (scheduled in period)" s={l.showedContacts} />
          <SplitRow label="…lost after the appointment" s={l.lostAfterShowed} base={l.showedContacts} strong />
        </tbody>
      </table>
      {l.lostByStage.length > 0 ? (
        <div className="note cohort-stages">
          Lost from: {l.lostByStage.map((s) => `${s.stage} ${n(s.count)}`).join(" · ")}
        </div>
      ) : null}
      <div className="cohort-sub-actions">
        <DrilldownButton spec={lostSpec} label="View lost contacts" />
      </div>
      <div className="label kpi-notes-title">{l.ngt.stageName} · entered in period</div>
      <table className="stat-breakdown rep-table rep-table-cohort">
        <colgroup>
          <col className="col-name" />
          <col className="col-num" />
          <col className="col-num" />
          <col className="col-num" />
        </colgroup>
        <SplitHead first="Since entering NGT" />
        <tbody>
          <SplitRow label="Entered the stage in period" s={l.ngt.entered} strong />
          <SplitRow label="→ IAU App Submitted (FS2)" s={l.ngt.fs2} base={l.ngt.entered} />
          <SplitRow label="→ Won" s={l.ngt.won} base={l.ngt.entered} />
          <SplitRow label="→ Lost" s={l.ngt.lost} base={l.ngt.entered} />
          <SplitRow label="Still open (none of the three)" s={l.ngt.open} base={l.ngt.entered} muted />
        </tbody>
      </table>
      <div className="cohort-sub-actions">
        <DrilldownButton spec={ngtSpec} label="View NGT entries" />
      </div>
    </div>
  );
  return (
    <KpiShell
      id="appointmentLosses"
      className={`kpi-title-xl ${className}`.trim()}
      title="Post-Appointment Losses"
      subtitle="Contacts lost after a Showed appointment, and what NGT entries became · selected range"
      value={
        <>
          <div className="stat-value" title={`${n(l.lostAfterShowed.total)} of ${n(l.showedContacts.total)} contacts who showed`}>
            {n(l.lostAfterShowed.total)}
          </div>
          <ProgramSplit army={l.lostAfterShowed.army} veteran={l.lostAfterShowed.veteran} />
        </>
      }
      pill={<span className="pill pill-neutral">Goal not set</span>}
      goalLine={
        <span>
          Lost after showing: <b>{pct(l.lostAfterShowed.total, l.showedContacts.total)}</b> of {n(l.showedContacts.total)} who showed
        </span>
      }
      deltaLine={
        <span className="kpi-muted">
          NGT: {n(l.ngt.entered.total)} entered · FS2 {n(l.ngt.fs2.total)} · won {n(l.ngt.won.total)} · lost {n(l.ngt.lost.total)} · open {n(l.ngt.open.total)}
        </span>
      }
      body={body}
      notes={l.notes}
    />
  );
}

// ---- 6. Army vs Veteran -------------------------------------------------------------------------------

function CompareCell({ line, side }: { line: CompareLine; side: "army" | "veteran" }) {
  const v = line[side];
  const better = line.better === side;
  const text = v === null ? DASH : line.format === "pct" ? `${Math.round(v * 100)}%` : v.toFixed(1);
  return (
    <td className={`num compare-cell${better ? " compare-better" : ""}`} title={line.detail[side]}>
      <span className="compare-value">{text}</span>
      {better ? (
        <span className="compare-badge" style={{ color: statusColors.good }}>
          ✓ better
        </span>
      ) : null}
      <span className="plan-label">{line.detail[side]}</span>
    </td>
  );
}

export function ArmyVsVeteranCard({ c, rangeLabel, className = "" }: { c: CompareResult; rangeLabel: string; className?: string }) {
  const wins = { army: c.lines.filter((l) => l.better === "army").length, veteran: c.lines.filter((l) => l.better === "veteran").length };
  const table = (
    <div className="scroll kpi-body">
      <table className="stat-breakdown rep-table rep-table-compare">
        <colgroup>
          <col className="col-name" />
          <col className="col-num" />
          <col className="col-num" />
          <col className="col-gap" />
        </colgroup>
        <thead>
          <tr>
            <th>Metric</th>
            <th className="num">
              <span className="stat-split-dot" style={{ background: programColors.army }} /> Army
            </th>
            <th className="num">
              <span className="stat-split-dot" style={{ background: programColors.veteran }} /> Veteran
            </th>
            <th className="num">Gap</th>
          </tr>
        </thead>
        <tbody>
          {c.lines.map((l) => (
            <tr key={l.key}>
              <td className="rep-name">
                {l.label}
                <span className="plan-label">
                  {l.basis} · {l.lowerIsBetter ? "lower is better" : "higher is better"}
                </span>
              </td>
              <CompareCell line={l} side="army" />
              <CompareCell line={l} side="veteran" />
              <td className="num gap">
                {l.gap === null ? DASH : l.format === "pct" ? `${l.gap.toFixed(l.gap < 10 ? 1 : 0)} pts` : `${l.gap.toFixed(1)} calls`}
                <span className="plan-label">{l.better === "tie" ? "tie" : l.better ? `${l.better === "army" ? "Army" : "Veteran"} ahead` : "not comparable"}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <KpiShell
      id="armyVsVeteran"
      className={`kpi-title-xl ${className}`.trim()}
      title="Army vs Veteran"
      subtitle={`Show rate, cancel rate, calls per booking, appointment → conversion, appointment → won · ${rangeLabel}`}
      value={
        <div className="stat-pair">
          <div>
            <div className="stat-value" style={{ color: programColors.army }}>
              {n(wins.army)}
            </div>
            <div className="note">Army ahead on</div>
          </div>
          <div>
            <div className="stat-value" style={{ color: programColors.veteran }}>
              {n(wins.veteran)}
            </div>
            <div className="note">Veteran ahead on</div>
          </div>
        </div>
      }
      pill={<span className="pill pill-neutral">Goal not set</span>}
      goalLine={<span className="kpi-muted">of {n(c.lines.length)} metrics · better side highlighted, gap in points</span>}
      deltaLine={<span className="kpi-muted">Same cohort rules as the cards above; Both / No tag contacts are in neither column.</span>}
      body={table}
      notes={c.notes}
    />
  );
}

// Response time by rep (selected range): business-hours minutes from an
// inbound SMS/email episode to the rep's next human reply. Fastest first.
// Click a row to see each episode with the inbound preview and reply time.

import { fmtWait, type ResponseResult, type ResponseRow } from "@/lib/conversations";
import { RepDrilldownRow, RESPONSE_COLUMNS, type DrilldownSpec } from "./Drilldown";
import KpiShell from "./KpiShell";
import HBarChart from "./charts/HBarChart";

const n = (v: number) => v.toLocaleString("en-US");
const DASH = "—";
const pct = (v: number | null) => (v === null ? DASH : `${Math.round(v * 100)}%`);

export default function ResponseTimeCard({ r, rangeQuery, rangeLabel, className = "" }: { r: ResponseResult; rangeQuery: string; rangeLabel: string; className?: string }) {
  const spec = (row: ResponseRow, user: string): DrilldownSpec => ({
    query: `kind=response&user=${encodeURIComponent(user)}&${rangeQuery}`,
    title: `${row.name} · ${n(row.episodes)} inbound ${row.episodes === 1 ? "episode" : "episodes"}`,
    subtitle: `Inbound SMS/email episodes and the next human reply · ${rangeLabel} · business hours ${r.windowLabel}`,
    expected: row.episodes,
    facts: [
      { label: "Median response", value: row.medianMinutes === null ? DASH : fmtWait(row.medianMinutes) },
      { label: "Average response", value: row.avgMinutes === null ? DASH : fmtWait(row.avgMinutes) },
      { label: `Replied within ${r.withinMinutes}m`, value: `${pct(row.withinPct)} (${n(row.withinCount)} of ${n(row.episodes)})` },
      { label: "Replied at all", value: `${n(row.replied)} of ${n(row.episodes)}` },
    ],
    columns: RESPONSE_COLUMNS,
    notes: r.notes,
    csvName: `${row.name} response times ${rangeLabel}`,
  });

  const cells = (row: ResponseRow) => (
    <>
      <td className="num">{n(row.episodes)}</td>
      <td className="num combined">{row.medianMinutes === null ? DASH : fmtWait(row.medianMinutes)}</td>
      <td className="num">{row.avgMinutes === null ? DASH : fmtWait(row.avgMinutes)}</td>
      <td className="num" title={`${n(row.withinCount)} of ${n(row.episodes)} episodes`}>
        {pct(row.withinPct)}
      </td>
      <td className="num">{row.episodes > 0 ? `${n(row.replied)} / ${n(row.episodes)}` : DASH}</td>
    </>
  );

  const table = (
    <div className="scroll kpi-body">
      <table className="stat-breakdown rep-table rep-table-conv">
        <colgroup>
          <col className="col-name" />
          <col className="col-num" />
          <col className="col-num" />
          <col className="col-num" />
          <col className="col-num" />
          <col className="col-num" />
        </colgroup>
        <thead>
          <tr>
            <th>Sales rep</th>
            <th className="num">Inbound episodes</th>
            <th className="num combined">Median response</th>
            <th className="num">Average response</th>
            <th className="num">Within {r.withinMinutes}m</th>
            <th className="num">Replied / episodes</th>
          </tr>
        </thead>
        <tbody>
          {r.rows.map((row) => (
            <RepDrilldownRow key={row.userId ?? row.name} spec={spec(row, row.userId ?? "unassigned")}>
              <td className="rep-name">{row.name}</td>
              {cells(row)}
            </RepDrilldownRow>
          ))}
          <RepDrilldownRow spec={spec(r.unassigned, "unassigned")}>
            <td className="note">{r.unassigned.name}</td>
            {cells(r.unassigned)}
          </RepDrilldownRow>
          {r.others ? (
            <RepDrilldownRow spec={spec(r.others, "others")}>
              <td className="note">{r.others.name}</td>
              {cells(r.others)}
            </RepDrilldownRow>
          ) : null}
          <tr className="rep-total">
            <td className="rep-name">Team total</td>
            {cells(r.total)}
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <KpiShell
      id="responseTime"
      className={`kpi-title-xl ${className}`.trim()}
      title="Response Time by Rep"
      subtitle={`Business-hours time from an inbound SMS/email to the rep's next reply · ${r.windowLabel} · selected range`}
      value={
        <div className="stat-pair">
          <div>
            <div className="stat-value">{r.total.medianMinutes === null ? DASH : fmtWait(r.total.medianMinutes)}</div>
            <div className="note">Median response (team)</div>
          </div>
          <div>
            <div className="stat-value">{pct(r.total.withinPct)}</div>
            <div className="note">Replied within {r.withinMinutes}m</div>
          </div>
        </div>
      }
      pill={<span className="pill pill-neutral">Goal not set</span>}
      goalLine={<span className="kpi-muted">Goal not set</span>}
      deltaLine={
        <span className="kpi-muted">
          {n(r.total.episodes)} inbound episodes · {n(r.total.replied)} replied by a person
        </span>
      }
      chart={
        <HBarChart
          height={220}
          line={r.withinMinutes}
          lineLabel={`${r.withinMinutes} min`}
          emptyText="No replied inbound episodes in this period."
          rows={r.rows
            .filter((row) => row.episodes > 0 && row.medianMinutes !== null)
            .map((row) => {
              const m = row.medianMinutes as number;
              const color = m < r.responseLevels.greenUnderMinutes ? "var(--status-good)" : m < r.responseLevels.yellowUnderMinutes ? "var(--status-warn)" : "var(--status-bad)";
              return { label: row.name, value: m, color, text: fmtWait(m), detail: `median of ${n(row.replied)} replied episodes · ${pct(row.withinPct)} within ${r.withinMinutes}m` };
            })}
        />
      }
      body={table}
      notes={r.notes}
    />
  );
}

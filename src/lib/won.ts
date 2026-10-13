// Won-opportunity reporting (brief section 3.8). Won means opportunity
// status = won; a stage name containing "Won" is never enough on its own.
//
// Two modes are always shown side by side:
//   "Became Won During Period" — events: the FIRST won transition per
//     opportunity (reopen-and-win-again never adds a second win); reversals
//     are reported separately and never subtracted.
//   "Currently Won" — snapshot of opportunities whose status is won now.

import { getDb } from "@/lib/db";
import type { DateRange } from "@/lib/dates";
import { fmtDay } from "@/lib/dates";
import { goalFor } from "@/lib/goals";
import { mappingConfig } from "@/lib/mapping-config";
import { coverage } from "@/lib/metrics";

export interface WonTotals {
  count: number;
  value: number;
  valueMissing: number;
  zeroValue: number;
}

export interface WonView {
  key: string;
  title: string;
  scope: string;
  period: WonTotals & { reversals: number };
  prev: number | null;
  prevUnavailableReason?: string;
  goal: number | null;
  current: WonTotals;
  notes: string[];
}

export interface WonByStage {
  stageId: string;
  stageName: string;
  periodCount: number;
  periodValue: number;
  currentCount: number;
  currentValue: number;
}

export interface Discrepancy {
  pipelineName: string;
  stageName: string;
  status: string;
  count: number;
}

export interface WonReport {
  views: WonView[];
  veteranByStage: WonByStage[];
  discrepancies: Discrepancy[];
  historyNote: string;
}

interface Scope {
  pipelineIds: string[];
  /** Restrict to contacts carrying this tag (reporting-group filter). */
  tag?: string;
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(", ");
}

function periodWon(scope: Scope, start: string, end: string): { rows: { opportunity_id: string; value_at_event: number | null; stage_id: string }[] } {
  const tagSql = scope.tag ? ` AND EXISTS (SELECT 1 FROM contacts c WHERE c.id = e.contact_id AND c.tags LIKE ?)` : "";
  const params: (string | number)[] = [...scope.pipelineIds, start, end];
  if (scope.tag) params.push(`%"${scope.tag}"%`);
  const rows = getDb()
    .prepare(
      `SELECT e.opportunity_id, e.value_at_event, e.stage_id
         FROM milestone_events e
         JOIN (SELECT opportunity_id, MIN(event_time) AS t FROM milestone_events WHERE kind = 'won' GROUP BY opportunity_id) f
           ON f.opportunity_id = e.opportunity_id AND f.t = e.event_time
        WHERE e.kind = 'won' AND e.pipeline_id IN (${placeholders(scope.pipelineIds.length)})
          AND e.event_time >= ? AND e.event_time < ?${tagSql}`,
    )
    .all(...params) as { opportunity_id: string; value_at_event: number | null; stage_id: string }[];
  return { rows };
}

function totalsOf(values: (number | null)[]): WonTotals {
  let value = 0;
  let valueMissing = 0;
  let zeroValue = 0;
  for (const v of values) {
    if (v === null) valueMissing += 1;
    else if (v === 0) zeroValue += 1;
    else value += v;
  }
  return { count: values.length, value, valueMissing, zeroValue };
}

function reversals(scope: Scope, start: string, end: string): number {
  return (
    getDb()
      .prepare(
        `SELECT COUNT(*) AS c FROM milestone_events WHERE kind = 'won_reversal' AND pipeline_id IN (${placeholders(scope.pipelineIds.length)})
          AND event_time >= ? AND event_time < ?`,
      )
      .get(...scope.pipelineIds, start, end) as { c: number }
  ).c;
}

function currentWon(scope: Scope): { rows: { id: string; monetary_value: number | null; stage_id: string }[] } {
  const tagSql = scope.tag ? ` AND EXISTS (SELECT 1 FROM contacts c WHERE c.id = o.contact_id AND c.tags LIKE ?)` : "";
  const params: string[] = [...scope.pipelineIds];
  if (scope.tag) params.push(`%"${scope.tag}"%`);
  const rows = getDb()
    .prepare(
      `SELECT o.id, o.monetary_value, o.stage_id FROM opportunities o
        WHERE o.status = 'won' AND o.missing_since IS NULL AND o.pipeline_id IN (${placeholders(scope.pipelineIds.length)})${tagSql}`,
    )
    .all(...params) as { id: string; monetary_value: number | null; stage_id: string }[];
  return { rows };
}

function stageName(pipelineId: string, stageId: string): string {
  return mappingConfig.pipelines.find((p) => p.id === pipelineId)?.stages.find((s) => s.id === stageId)?.name ?? stageId;
}

export function computeWon(range: DateRange): WonReport {
  const cov = coverage();
  const start = range.start.toISOString();
  const end = range.end.toISOString();
  const pStart = range.prevStart.toISOString();
  const pEnd = range.prevEnd.toISOString();
  const army = mappingConfig.programs.army.pipelineId;
  const vet = mappingConfig.programs.veteran.pipelineId;
  const allIds = mappingConfig.pipelines.map((p) => p.id);
  const otherNames = mappingConfig.pipelines.filter((p) => p.id !== army && p.id !== vet).map((p) => p.name);

  // Won history comes from GHL's lastStatusChangeAt on opportunities that were already won at the
  // first sync, plus every transition observed since. Earliest known won event:
  const earliest = (getDb().prepare(`SELECT MIN(event_time) AS t FROM milestone_events WHERE kind = 'won'`).get() as { t: string | null }).t;

  function view(key: string, title: string, scope: Scope, scopeText: string, goalKey: string, extraNotes: string[] = []): WonView {
    const cur = periodWon(scope, start, end);
    const period = { ...totalsOf(cur.rows.map((r) => r.value_at_event)), reversals: reversals(scope, start, end) };
    const prevRows = periodWon(scope, pStart, pEnd).rows;
    const prevReason = !earliest
      ? "No won history loaded yet."
      : pStart < earliest
        ? `Won history starts ${fmtDay(new Date(earliest))}, after the comparison period began.`
        : undefined;
    const snapshot = currentWon(scope);
    return {
      key,
      title,
      scope: scopeText,
      period,
      prev: prevReason ? null : prevRows.length,
      prevUnavailableReason: prevReason,
      goal: goalFor(goalKey, range)?.full ?? null,
      current: totalsOf(snapshot.rows.map((r) => r.monetary_value)),
      notes: [
        "Became Won During Period counts the first time each opportunity reached status = won, by GHL's status-change time. An opportunity reopened and won again is not counted twice; reversals are listed and never subtracted.",
        "Currently Won is a snapshot of opportunities whose status is won right now, valued at their current Opportunity Value.",
        ...extraNotes,
      ],
    };
  }

  const views: WonView[] = [
    view("wonArmy", "Army CA won opportunities", { pipelineIds: [army] }, "Army CA Pipeline, all fiscal years", "wonArmy"),
    view(
      "wonArmyFy27",
      "Army CA won opportunities · FY27",
      { pipelineIds: [army], tag: mappingConfig.reportingGroups.FY27?.tag },
      `Army CA Pipeline, contacts tagged "${mappingConfig.reportingGroups.FY27?.tag}"`,
      "wonArmy",
      ["FY27 membership comes from the contact tag, per the owner decision of 2026-10-11."],
    ),
    view("wonVeteran", "Veteran G.I. Bill won opportunities", { pipelineIds: [vet] }, "Veteran G.I. Bill pipeline, every stage", "wonVeteran"),
    view(
      "wonEntireCrm",
      "Entire CRM won opportunities",
      { pipelineIds: allIds },
      `Every pipeline in the connected VCN sub-account: Army CA, Veteran G.I. Bill, and ${otherNames.join(", ")}`,
      "wonEntireCrm",
      ["Entire CRM means this one sub-account, not every sub-account in the agency. The non-program pipeline is included here and nowhere else."],
    ),
  ];

  // ---- Veteran by stage: stage at the won event (period) vs current stage (snapshot) ----
  const byStage = new Map<string, WonByStage>();
  const touch = (stageId: string) => {
    let s = byStage.get(stageId);
    if (!s) {
      s = { stageId, stageName: stageName(vet, stageId), periodCount: 0, periodValue: 0, currentCount: 0, currentValue: 0 };
      byStage.set(stageId, s);
    }
    return s;
  };
  for (const r of periodWon({ pipelineIds: [vet] }, start, end).rows) {
    const s = touch(r.stage_id);
    s.periodCount += 1;
    s.periodValue += r.value_at_event ?? 0;
  }
  for (const r of currentWon({ pipelineIds: [vet] }).rows) {
    const s = touch(r.stage_id);
    s.currentCount += 1;
    s.currentValue += r.monetary_value ?? 0;
  }
  const order = new Map(mappingConfig.pipelines.find((p) => p.id === vet)?.stages.map((s, i) => [s.id, i]) ?? []);
  const veteranByStage = [...byStage.values()].sort((a, b) => (order.get(a.stageId) ?? 999) - (order.get(b.stageId) ?? 999));

  // ---- Discrepancies: Won-named stage but status not won ----
  const discrepancies: Discrepancy[] = [];
  for (const p of mappingConfig.pipelines) {
    for (const s of p.stages) {
      if (!/won/i.test(s.name)) continue;
      const rows = getDb()
        .prepare(`SELECT status, COUNT(*) AS c FROM opportunities WHERE stage_id = ? AND missing_since IS NULL AND status != 'won' GROUP BY status`)
        .all(s.id) as { status: string; c: number }[];
      for (const r of rows) discrepancies.push({ pipelineName: p.name, stageName: s.name, status: r.status, count: r.c });
    }
  }

  const historyNote = earliest
    ? `Won history is known from ${fmtDay(new Date(earliest))} (GHL's status-change time on opportunities that were won at the first sync on ${fmtDay(new Date(cov.firstCoreSyncAt ?? earliest))}, plus every change seen since). Opportunities won and later reopened before that date are not visible.`
    : "No won history loaded yet.";

  return { views, veteranByStage, discrepancies, historyNote };
}

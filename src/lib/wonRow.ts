// The Won Opportunities row (owner request 2026-10-17). Reads the local
// cache only.
//
// Won always means opportunity status = won, once per opportunity id, and
// every dollar figure is Opportunity Value (the value on the opportunity),
// never cash collected or commission. Two modes:
//   current — SNAPSHOT: opportunities whose status is won right now, at
//             their current value and stage (the default view);
//   period  — EVENTS: the first won transition per opportunity inside the
//             selected range (GHL's status-change time), at the value and
//             stage it had at that moment; reversals are never subtracted.
// Stage ids for the live program stages, the past semesters, and the
// application → close-rate cohorts live in config/won.json.

import raw from "../../config/won.json";
import { getDb } from "@/lib/db";
import { nyParts, type DateRange } from "@/lib/dates";
import { contactUrl, type DrillResult, type DrillRow } from "@/lib/drilldown";
import { leadsConfig } from "@/lib/leads";
import { mappingConfig } from "@/lib/mapping-config";
import { classifyTags, coverage } from "@/lib/metrics";
import { userNames } from "@/lib/milestones";

// ---- config ---------------------------------------------------------------------------

export interface WonConfig {
  currentPrograms: { key: string; label: string; program: "army" | "veteran"; pipelineId: string; stageId: string }[];
  pastSemesters: { key: string; label: string; short: string; wonStageId: string; group: string }[];
  closeRateGroups: { key: string; label: string; basis: "tracked" | "assumed"; milestoneKey?: string; applicationStageIds: string[]; applicationStageName: string; wonStageIds: string[] }[];
  monthsOfHistory: number;
}

export function wonConfig(): WonConfig {
  const c = raw as unknown as WonConfig;
  return { ...c, monthsOfHistory: typeof c.monthsOfHistory === "number" && c.monthsOfHistory > 0 ? Math.round(c.monthsOfHistory) : 12 };
}

export type WonMode = "current" | "period";
export const MODE_LABEL: Record<WonMode, string> = { current: "Currently Won (snapshot)", period: "Became Won During Period" };

// ---- won opportunities --------------------------------------------------------------------

export type ProgramKind = "army" | "veteran" | "partner" | "other";

export interface WonOpp {
  id: string;
  contactId: string | null;
  name: string | null;
  pipelineId: string;
  pipelineName: string;
  programKind: ProgramKind;
  stageId: string;
  stageName: string;
  /** Opportunity Value (current value in snapshot mode, value at the won event in period mode). */
  value: number | null;
  wonAt: string | null;
  assignedTo: string | null;
  cls: "army" | "veteran" | "both" | "untagged";
  tags: string[];
  campaigns: string[];
}

export interface Totals {
  count: number;
  value: number;
  valueMissing: number;
  zeroValue: number;
}

export function totalsOf(list: { value: number | null }[]): Totals {
  const t: Totals = { count: 0, value: 0, valueMissing: 0, zeroValue: 0 };
  for (const o of list) {
    t.count += 1;
    if (o.value === null) t.valueMissing += 1;
    else if (o.value === 0) t.zeroValue += 1;
    else t.value += o.value;
  }
  return t;
}

export const n = (v: number) => v.toLocaleString("en-US");
export const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const pct = (num: number, den: number): string => (den > 0 ? `${Math.round((num / den) * 100)}%` : "—");

function stageIndex() {
  const stages = new Map<string, string>();
  const pipelines = new Map<string, string>();
  for (const p of mappingConfig.pipelines) {
    pipelines.set(p.id, p.name);
    for (const s of p.stages) stages.set(s.id, s.name);
  }
  return { stages, pipelines };
}

export function programKindOf(pipelineId: string): ProgramKind {
  if (pipelineId === mappingConfig.programs.army.pipelineId) return "army";
  if (pipelineId === mappingConfig.programs.veteran.pipelineId) return "veteran";
  if (mappingConfig.nonProgramPipelines.some((p) => p.pipelineId === pipelineId)) return "partner";
  return "other";
}

export const PROGRAM_KIND_LABEL: Record<ProgramKind, string> = { army: "Army CA", veteran: "Veteran G.I. Bill", partner: "Partner Inquiry", other: "Other pipelines" };

function parseTags(json: string | null): string[] {
  try {
    return json ? (JSON.parse(json) as string[]) : [];
  } catch {
    return [];
  }
}

function campaignsOf(tags: string[]): string[] {
  const keys = new Set(tags.map((t) => t.trim().toLowerCase()));
  return leadsConfig().campaignTags.filter((t) => keys.has(t.trim().toLowerCase()));
}

/** Every won opportunity for the mode: the snapshot, or the first won event per opportunity inside the range. */
export function wonOpps(mode: WonMode, range: DateRange): WonOpp[] {
  const { stages, pipelines } = stageIndex();
  const db = getDb();
  type Row = { id: string; contact_id: string | null; name: string | null; cname: string | null; pipeline_id: string; stage_id: string; value: number | null; won_at: string | null; assigned_to: string | null; tags: string | null };
  const rows =
    mode === "current"
      ? (db
          .prepare(
            `SELECT o.id, o.contact_id, o.name, c.name AS cname, o.pipeline_id, o.stage_id, o.monetary_value AS value, o.last_status_change_at AS won_at, o.assigned_to, c.tags
               FROM opportunities o LEFT JOIN contacts c ON c.id = o.contact_id WHERE o.status = 'won' AND o.missing_since IS NULL`,
          )
          .all() as unknown as Row[])
      : (db
          .prepare(
            `SELECT e.opportunity_id AS id, e.contact_id, o.name, c.name AS cname, e.pipeline_id, e.stage_id, e.value_at_event AS value, e.event_time AS won_at,
                    e.assigned_to_at_event AS assigned_to, c.tags
               FROM milestone_events e
               JOIN (SELECT opportunity_id, MIN(event_time) AS t FROM milestone_events WHERE kind = 'won' GROUP BY opportunity_id) f ON f.opportunity_id = e.opportunity_id AND f.t = e.event_time
               LEFT JOIN opportunities o ON o.id = e.opportunity_id LEFT JOIN contacts c ON c.id = e.contact_id
              WHERE e.kind = 'won' AND e.event_time >= ? AND e.event_time < ?`,
          )
          .all(range.start.toISOString(), range.end.toISOString()) as unknown as Row[]);
  const seen = new Set<string>();
  const out: WonOpp[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const tags = parseTags(r.tags);
    out.push({
      id: r.id,
      contactId: r.contact_id,
      name: r.cname ?? r.name,
      pipelineId: r.pipeline_id,
      pipelineName: pipelines.get(r.pipeline_id) ?? r.pipeline_id,
      programKind: programKindOf(r.pipeline_id),
      stageId: r.stage_id,
      stageName: stages.get(r.stage_id) ?? r.stage_id,
      value: r.value === null || r.value === undefined ? null : Number(r.value),
      wonAt: r.won_at,
      assignedTo: r.assigned_to,
      cls: classifyTags(r.tags),
      tags,
      campaigns: campaignsOf(tags),
    });
  }
  out.sort((a, b) => ((a.wonAt ?? "") < (b.wonAt ?? "") ? 1 : -1));
  return out;
}

/** Reversals (won → not won) observed inside the range, by pipeline. Listed, never subtracted. */
export function reversalsIn(range: DateRange): number {
  return (getDb().prepare(`SELECT COUNT(*) AS c FROM milestone_events WHERE kind = 'won_reversal' AND event_time >= ? AND event_time < ?`).get(range.start.toISOString(), range.end.toISOString()) as { c: number }).c;
}

// ---- 1. headline ---------------------------------------------------------------------------

export interface PipelineTotals {
  pipelineId: string;
  name: string;
  kind: ProgramKind;
  totals: Totals;
}

export interface HeadlineResult {
  mode: WonMode;
  total: Totals;
  byPipeline: PipelineTotals[];
  reversals: number;
  earliest: string | null;
  notes: string[];
}

export function computeHeadline(opps: WonOpp[], mode: WonMode, range: DateRange): HeadlineResult {
  const by = new Map<string, PipelineTotals>();
  for (const p of mappingConfig.pipelines) by.set(p.id, { pipelineId: p.id, name: p.name, kind: programKindOf(p.id), totals: { count: 0, value: 0, valueMissing: 0, zeroValue: 0 } });
  for (const o of opps) {
    const p = by.get(o.pipelineId) ?? { pipelineId: o.pipelineId, name: o.pipelineName, kind: o.programKind, totals: { count: 0, value: 0, valueMissing: 0, zeroValue: 0 } };
    const t = totalsOf([o]);
    p.totals.count += t.count;
    p.totals.value += t.value;
    p.totals.valueMissing += t.valueMissing;
    p.totals.zeroValue += t.zeroValue;
    by.set(o.pipelineId, p);
  }
  const order: ProgramKind[] = ["army", "veteran", "partner", "other"];
  const earliest = (getDb().prepare(`SELECT MIN(event_time) AS t FROM milestone_events WHERE kind = 'won'`).get() as { t: string | null }).t;
  return {
    mode,
    total: totalsOf(opps),
    byPipeline: [...by.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.name.localeCompare(b.name)),
    reversals: reversalsIn(range),
    earliest,
    notes: [
      "Won — opportunity status = won, once per opportunity ID; a stage named Won is never enough on its own.",
      "Total Won Opportunity Value — the sum of the Opportunity Value on those opportunities: not cash collected, not commission; opportunities with no value are counted but add nothing (shown as missing).",
      "Currently Won (snapshot) — opportunities whose status is won right now, at their current value and stage, every pipeline in the connected sub-account.",
      "Became Won During Period — the first time each opportunity reached status = won inside the selected range, by GHL's status-change time, at the value and stage it had then; an opportunity reopened and won again is not counted twice, and reversals are listed, never subtracted.",
      "By pipeline — Army CA Pipeline, Veteran G.I. Bill, and the Intelagent Partner Inquiry pipeline (the only place the non-program pipeline is included); the three add up to the total.",
      `Limitation: won history is known from GHL's status-change time on opportunities that were won at the first sync${earliest ? ` (earliest ${earliest.slice(0, 10)})` : ""} plus every change seen since; an opportunity won and reopened before that is not visible.`,
    ],
  };
}

// ---- 2. current programs ---------------------------------------------------------------------------

export interface ProgramStage {
  key: string;
  label: string;
  program: "army" | "veteran";
  stageId: string;
  totals: Totals;
  /** Opportunities in the stage whose status is not won (snapshot, always). */
  discrepancies: { status: string; count: number }[];
}

export interface CurrentProgramsResult {
  mode: WonMode;
  combined: Totals;
  stages: ProgramStage[];
  discrepancyCount: number;
  /** Won opportunities in the program pipelines that sit in neither live won stage (snapshot) or were won from another stage (period). */
  otherWonStages: { pipelineName: string; stageName: string; stageId: string; count: number; value: number }[];
  notes: string[];
}

export function computeCurrentPrograms(opps: WonOpp[], mode: WonMode): CurrentProgramsResult {
  const cfg = wonConfig();
  const db = getDb();
  const stages: ProgramStage[] = cfg.currentPrograms.map((p) => {
    const list = opps.filter((o) => o.stageId === p.stageId);
    const disc = db.prepare(`SELECT status, COUNT(*) AS c FROM opportunities WHERE stage_id = ? AND missing_since IS NULL AND status != 'won' GROUP BY status`).all(p.stageId) as unknown as { status: string; c: number }[];
    return { key: p.key, label: p.label, program: p.program, stageId: p.stageId, totals: totalsOf(list), discrepancies: disc.map((d) => ({ status: d.status, count: d.c })) };
  });
  const liveIds = new Set(cfg.currentPrograms.map((p) => p.stageId));
  const other = new Map<string, { pipelineName: string; stageName: string; stageId: string; count: number; value: number }>();
  for (const o of opps) {
    if (liveIds.has(o.stageId) || (o.programKind !== "army" && o.programKind !== "veteran")) continue;
    const cur = other.get(o.stageId) ?? { pipelineName: o.pipelineName, stageName: o.stageName, stageId: o.stageId, count: 0, value: 0 };
    cur.count += 1;
    cur.value += o.value ?? 0;
    other.set(o.stageId, cur);
  }
  return {
    mode,
    combined: totalsOf(opps.filter((o) => liveIds.has(o.stageId))),
    stages,
    discrepancyCount: stages.reduce((s, x) => s + x.discrepancies.reduce((a, d) => a + d.count, 0), 0),
    otherWonStages: [...other.values()].sort((a, b) => b.count - a.count),
    notes: [
      `Current programs — won opportunities sitting in ${cfg.currentPrograms.map((p) => `"${p.label}"`).join(" or ")}: ${mode === "current" ? "their current stage, as of the last sync" : "the stage they were in at the won event"}.`,
      "Combined — the two stages added together; one opportunity sits in exactly one stage, so nothing is double counted.",
      "Army / Veteran — by pipeline: Won/Submitted (Fy 27) is the Army CA Pipeline's won stage, Enrolled Won (FS2) the Veteran G.I. Bill's.",
      "Discrepancies — opportunities sitting in one of these stages whose status is not won; they are listed here and counted in no won total (a snapshot check, whatever the mode).",
      "Other won stages — won opportunities in the two program pipelines that sit in a different stage (past semesters, or moved after winning); together with this card they add up to the pipeline totals on the headline.",
      "Chart — Won Opportunity Value per stage; the count is in the label.",
    ],
  };
}

// ---- 3. past semesters ---------------------------------------------------------------------------

export interface SemesterRow {
  key: string;
  label: string;
  short: string;
  group: string;
  stageId: string;
  totals: Totals;
  /** Distinct contacts assumed to have reached the group's application stage (current stage in the group's path, or lost from it). */
  reached: number;
  reachedShared: boolean;
  applicationStageName: string;
}

export interface PastSemestersResult {
  mode: WonMode;
  rows: SemesterRow[];
  total: Totals;
  reachedTotal: number;
  /** FS2 for comparison on the chart. */
  fs2: { label: string; totals: Totals } | null;
  notes: string[];
}

/** Distinct contacts whose opportunity sits in (or was lost from) one of the group's application / accepted / signed / won stages. */
function reachedApplication(groupKey: string): number {
  const cfg = wonConfig();
  const g = cfg.closeRateGroups.find((x) => x.key === groupKey);
  if (!g) return 0;
  const ids = [...g.applicationStageIds, ...g.wonStageIds];
  return (
    getDb()
      .prepare(`SELECT COUNT(DISTINCT COALESCE(contact_id, 'opp:' || id)) AS c FROM opportunities WHERE missing_since IS NULL AND stage_id IN (${ids.map(() => "?").join(",")})`)
      .get(...ids) as { c: number }
  ).c;
}

export function computePastSemesters(opps: WonOpp[], mode: WonMode): PastSemestersResult {
  const cfg = wonConfig();
  const reachedBy = new Map<string, number>();
  for (const g of cfg.closeRateGroups) reachedBy.set(g.key, reachedApplication(g.key));
  const groupsSeen = new Map<string, number>();
  for (const s of cfg.pastSemesters) groupsSeen.set(s.group, (groupsSeen.get(s.group) ?? 0) + 1);
  const rows: SemesterRow[] = cfg.pastSemesters.map((s) => ({
    key: s.key,
    label: s.label,
    short: s.short,
    group: s.group,
    stageId: s.wonStageId,
    totals: totalsOf(opps.filter((o) => o.stageId === s.wonStageId)),
    reached: reachedBy.get(s.group) ?? 0,
    reachedShared: (groupsSeen.get(s.group) ?? 0) > 1,
    applicationStageName: cfg.closeRateGroups.find((g) => g.key === s.group)?.applicationStageName ?? s.group,
  }));
  const pastIds = new Set(cfg.pastSemesters.map((s) => s.wonStageId));
  const fs2 = cfg.currentPrograms.find((p) => p.program === "veteran");
  const groupsCounted = [...new Set(cfg.pastSemesters.map((s) => s.group))];
  return {
    mode,
    rows,
    total: totalsOf(opps.filter((o) => pastIds.has(o.stageId))),
    reachedTotal: groupsCounted.reduce((s, g) => s + (reachedBy.get(g) ?? 0), 0),
    fs2: fs2 ? { label: fs2.label, totals: totalsOf(opps.filter((o) => o.stageId === fs2.stageId)) } : null,
    notes: [
      `Past semesters — won opportunities sitting in ${cfg.pastSemesters.map((s) => `"${s.label}"`).join(", ")} (${mode === "current" ? "current stage" : "stage at the won event"}); won = status won.`,
      "Reached application stage — distinct contacts whose opportunity currently sits in that semester's application, accepted, signed, or enrolled/won stage, or was marked lost while in one of them. GHL keeps no stage history for these semesters, so this assumes the pipeline path (an enrolled contact must have applied) and is a snapshot, not an event count.",
      "SS1 & SS2 — the two summer sessions share one application stage (IAU Application Submitted (SS1 & SS2)), so the same reached figure is shown on both rows and counted once in the total.",
      "Chart — Won Opportunity Value per semester, with Enrolled Won (FS2) alongside for comparison.",
      "Limitation: reached-application counts are assumed from current stages; a contact who applied and was then moved to an unrelated stage is not counted.",
    ],
  };
}

// ---- 4. won by campaign ---------------------------------------------------------------------------

export interface CampaignWonRow {
  key: string;
  label: string;
  totals: Totals;
  army: Totals;
  veteran: Totals;
  other: Totals;
  stages: { stageName: string; count: number }[];
}

export interface WonByCampaignResult {
  mode: WonMode;
  rows: CampaignWonRow[];
  none: CampaignWonRow;
  total: CampaignWonRow;
  multi: number;
  notes: string[];
}

function campaignRow(key: string, label: string, list: WonOpp[]): CampaignWonRow {
  const st = new Map<string, number>();
  for (const o of list) st.set(o.stageName, (st.get(o.stageName) ?? 0) + 1);
  return {
    key,
    label,
    totals: totalsOf(list),
    army: totalsOf(list.filter((o) => o.programKind === "army")),
    veteran: totalsOf(list.filter((o) => o.programKind === "veteran")),
    other: totalsOf(list.filter((o) => o.programKind !== "army" && o.programKind !== "veteran")),
    stages: [...st.entries()].map(([stageName, count]) => ({ stageName, count })).sort((a, b) => b.count - a.count),
  };
}

export function computeWonByCampaign(opps: WonOpp[], mode: WonMode): WonByCampaignResult {
  const tags = leadsConfig().campaignTags;
  return {
    mode,
    rows: tags.map((t) => campaignRow(t.toLowerCase(), t, opps.filter((o) => o.campaigns.includes(t)))),
    none: campaignRow("none", "No campaign tag", opps.filter((o) => o.campaigns.length === 0)),
    total: campaignRow("total", "All won opportunities", opps),
    multi: opps.filter((o) => o.campaigns.length > 1).length,
    notes: [
      `Campaign — the won opportunity's contact carries the campaign tag (${tags.join(", ")}, from config/leads.json); a contact with two campaign tags counts under each but once in the total.`,
      "Army / Veteran — by pipeline (Army CA Pipeline / Veteran G.I. Bill); Partner Inquiry wins, if any, are in Other.",
      "Won stage — the stage the won opportunity sits in (current stage in snapshot mode, stage at the won event in period mode).",
      "Chart — won count per campaign, stacked Army over Veteran.",
    ],
  };
}

// ---- 5. application → close rate ---------------------------------------------------------------------------

export interface CloseRateRow {
  key: string;
  label: string;
  basis: "tracked" | "assumed" | "mixed";
  cohort: number;
  won: number;
  lost: number;
  still: number;
  other: number;
  closeRate: number | null;
  applicationStageName: string;
}

export interface CloseRateResult {
  rows: CloseRateRow[];
  historyStart: string | undefined;
  notes: string[];
}

interface CohortOpp {
  id: string;
  status: string;
  stage_id: string;
}

function cohortFor(group: WonConfig["closeRateGroups"][number]): CohortOpp[] {
  const db = getDb();
  const stageIds = [...group.applicationStageIds, ...group.wonStageIds];
  const marks = stageIds.map(() => "?").join(",");
  const byStage = db.prepare(`SELECT id, status, stage_id FROM opportunities WHERE missing_since IS NULL AND stage_id IN (${marks})`).all(...stageIds) as unknown as CohortOpp[];
  const map = new Map<string, CohortOpp>(byStage.map((o) => [o.id, o]));
  if (group.basis === "tracked" && group.milestoneKey) {
    const tracked = db
      .prepare(`SELECT o.id, o.status, o.stage_id FROM milestone_events e JOIN opportunities o ON o.id = e.opportunity_id WHERE e.kind = 'milestone' AND e.milestone_key = ? AND o.missing_since IS NULL`)
      .all(group.milestoneKey) as unknown as CohortOpp[];
    for (const o of tracked) map.set(o.id, o);
  }
  return [...map.values()];
}

function closeRow(key: string, label: string, basis: CloseRateRow["basis"], cohort: CohortOpp[], appIds: Set<string>, wonIds: Set<string>, applicationStageName: string): CloseRateRow {
  const won = cohort.filter((o) => o.status === "won" && wonIds.has(o.stage_id)).length;
  const lost = cohort.filter((o) => o.status === "lost").length;
  const still = cohort.filter((o) => o.status !== "lost" && o.status !== "won" && appIds.has(o.stage_id)).length;
  return { key, label, basis, cohort: cohort.length, won, lost, still, other: cohort.length - won - lost - still, closeRate: cohort.length > 0 ? won / cohort.length : null, applicationStageName };
}

export function computeCloseRates(): CloseRateResult {
  const cfg = wonConfig();
  const rows: CloseRateRow[] = [];
  const all = new Map<string, CohortOpp>();
  const allApp = new Set<string>();
  const allWon = new Set<string>();
  for (const g of cfg.closeRateGroups) {
    const cohort = cohortFor(g);
    for (const o of cohort) all.set(o.id, o);
    for (const id of g.applicationStageIds) allApp.add(id);
    for (const id of g.wonStageIds) allWon.add(id);
    rows.push(closeRow(g.key, `${g.key} · ${g.label}`, g.basis, cohort, new Set(g.applicationStageIds), new Set(g.wonStageIds), g.applicationStageName));
  }
  rows.push(closeRow("ALL", "All groups", "mixed", [...all.values()], allApp, allWon, "any application stage"));
  const historyStart = coverage().firstCoreSyncAt;
  return {
    rows,
    historyStart,
    notes: [
      "Cohort — opportunities that reached the group's application-submitted stage.",
      `FS2 (tracked) — every opportunity with an IAU App Submitted (FS2) milestone event (tracked since the first sync${historyStart ? `, ${historyStart.slice(0, 10)}` : ""}, with GHL's stage-entry time for those already there) plus any opportunity currently in the FS2 application, accepted, signed, or Enrolled Won stage.`,
      "FS1 / SS (assumed path) — no stage history exists for these semesters, so the cohort is built from current stages: opportunities now in the group's application, accepted, or signed stage, plus those in its Enrolled/Won stage (the pipeline requires an application first), plus lost opportunities whose last stage was one of those.",
      "Won — status won and sitting in the group's Enrolled/Won stage. Lost — status lost. Still in application — status open and currently in the application, accepted, or signed stage. Other — open but moved to a stage outside the path.",
      "Close rate — Won ÷ cohort. All — every cohort opportunity once, whatever its group.",
      "Limitation: for FS1 and SS a contact who applied and was then moved to an unrelated stage, or reopened, is not in the cohort; for FS2 applications before the first sync are known only if the opportunity still sits in an FS2 stage.",
    ],
  };
}

// ---- 6. monthly series ---------------------------------------------------------------------------

export interface MonthPoint {
  key: string;
  label: string;
  army: number;
  veteran: number;
  armyCount: number;
  veteranCount: number;
  other: number;
}

export interface MonthlyResult {
  points: MonthPoint[];
  months: number;
  notes: string[];
}

const monthLabel = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", year: "2-digit" });

/** Won Opportunity Value per New York month for the last N months, by first won event per opportunity. */
export function computeMonthly(now: Date): MonthlyResult {
  const cfg = wonConfig();
  const p = nyParts(now);
  const keys: string[] = [];
  for (let i = cfg.monthsOfHistory - 1; i >= 0; i--) {
    const m = p.m - 1 - i;
    const y = p.y + Math.floor(m / 12);
    const mm = ((m % 12) + 12) % 12;
    keys.push(`${y}-${String(mm + 1).padStart(2, "0")}`);
  }
  const points = new Map<string, MonthPoint>(keys.map((k) => [k, { key: k, label: monthLabel.format(new Date(Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, 1))), army: 0, veteran: 0, armyCount: 0, veteranCount: 0, other: 0 }]));
  const rows = getDb()
    .prepare(
      `SELECT e.pipeline_id, e.value_at_event AS v, e.event_time AS t FROM milestone_events e
         JOIN (SELECT opportunity_id, MIN(event_time) AS t FROM milestone_events WHERE kind = 'won' GROUP BY opportunity_id) f ON f.opportunity_id = e.opportunity_id AND f.t = e.event_time
        WHERE e.kind = 'won'`,
    )
    .all() as unknown as { pipeline_id: string; v: number | null; t: string }[];
  for (const r of rows) {
    const d = nyParts(new Date(r.t));
    const k = `${d.y}-${String(d.m).padStart(2, "0")}`;
    const pt = points.get(k);
    if (!pt) continue;
    const kind = programKindOf(r.pipeline_id);
    if (kind === "army") {
      pt.army += r.v ?? 0;
      pt.armyCount += 1;
    } else if (kind === "veteran") {
      pt.veteran += r.v ?? 0;
      pt.veteranCount += 1;
    } else pt.other += r.v ?? 0;
  }
  return {
    points: [...points.values()],
    months: cfg.monthsOfHistory,
    notes: [
      `Won $ by month — Opportunity Value at the first won event per opportunity, grouped by the New York month of GHL's status-change time, last ${cfg.monthsOfHistory} months; Army CA and Veteran G.I. Bill as two lines.`,
      "Not affected by the date range or the snapshot / period toggle.",
      "Limitation: an opportunity won and reopened before the first sync is not visible, and a value changed after the win is not reflected (the value at the win is used).",
    ],
  };
}

// ---- drilldowns ---------------------------------------------------------------------------------

function wonRow(o: WonOpp, names: Map<string, string>, segments?: string[]): DrillRow {
  return {
    contactId: o.contactId,
    opportunityId: o.id,
    name: o.name,
    ghlUrl: o.contactId ? contactUrl(o.contactId) : null,
    source: null,
    assignedUser: o.assignedTo ? (names.get(o.assignedTo) ?? o.assignedTo) : null,
    pipeline: o.pipelineName,
    status: "won",
    phone: null,
    email: null,
    value: o.value,
    stage: o.stageName,
    stageReached: "won",
    milestoneKey: "won",
    tags: o.tags,
    createdOn: null,
    reachedOn: o.wonAt ?? "",
    tagClass: o.cls === "army" ? "Army" : o.cls === "veteran" ? "Veteran" : o.cls === "both" ? "Both (army + veteran)" : "No tag",
    campaigns: o.campaigns.length ? o.campaigns.join(", ") : null,
    segments,
  };
}

/**
 * Won drilldowns. which: all | pipeline (arg = pipeline id) | stage (arg = stage id) | campaign (arg = tag or "none") |
 * programs (the two live stages) | past (the past-semester stages) | group (arg = close-rate group key; segments cohort/won/lost/still/other).
 */
export function wonDrilldown(which: string, arg: string, mode: WonMode, range: DateRange): DrillResult | null {
  const names = userNames();
  const cfg = wonConfig();
  if (which === "group") {
    const g = cfg.closeRateGroups.find((x) => x.key === arg);
    const groups = g ? [g] : arg === "ALL" ? cfg.closeRateGroups : [];
    if (groups.length === 0) return null;
    const { stages, pipelines } = stageIndex();
    const map = new Map<string, { o: CohortOpp; segs: Set<string> }>();
    for (const grp of groups) {
      const appIds = new Set(grp.applicationStageIds);
      const wonIds = new Set(grp.wonStageIds);
      for (const o of cohortFor(grp)) {
        const cur = map.get(o.id) ?? { o, segs: new Set<string>(["cohort"]) };
        if (o.status === "won" && wonIds.has(o.stage_id)) cur.segs.add("won");
        else if (o.status === "lost") cur.segs.add("lost");
        else if (appIds.has(o.stage_id)) cur.segs.add("still");
        map.set(o.id, cur);
      }
    }
    for (const v of map.values()) if (!v.segs.has("won") && !v.segs.has("lost") && !v.segs.has("still")) v.segs.add("other");
    const ids = [...map.keys()];
    const detail = new Map<string, { contact_id: string | null; name: string | null; cname: string | null; pipeline_id: string; monetary_value: number | null; last_status_change_at: string | null; assigned_to: string | null; tags: string | null }>();
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      for (const r of getDb()
        .prepare(`SELECT o.id, o.contact_id, o.name, c.name AS cname, o.pipeline_id, o.monetary_value, o.last_status_change_at, o.assigned_to, c.tags FROM opportunities o LEFT JOIN contacts c ON c.id = o.contact_id WHERE o.id IN (${chunk.map(() => "?").join(",")})`)
        .all(...chunk) as unknown as { id: string; contact_id: string | null; name: string | null; cname: string | null; pipeline_id: string; monetary_value: number | null; last_status_change_at: string | null; assigned_to: string | null; tags: string | null }[])
        detail.set(r.id, r);
    }
    const rows: DrillRow[] = [...map.values()].map(({ o, segs }) => {
      const d = detail.get(o.id);
      const tags = parseTags(d?.tags ?? null);
      return {
        contactId: d?.contact_id ?? null,
        opportunityId: o.id,
        name: d?.cname ?? d?.name ?? null,
        ghlUrl: d?.contact_id ? contactUrl(d.contact_id) : null,
        source: null,
        assignedUser: d?.assigned_to ? (names.get(d.assigned_to) ?? d.assigned_to) : null,
        pipeline: d ? (pipelines.get(d.pipeline_id) ?? d.pipeline_id) : null,
        status: o.status,
        phone: null,
        email: null,
        value: d?.monetary_value ?? null,
        stage: stages.get(o.stage_id) ?? o.stage_id,
        stageReached: "cohort",
        milestoneKey: "closeRate",
        tags,
        createdOn: null,
        reachedOn: d?.last_status_change_at ?? "",
        tagClass: null,
        campaigns: campaignsOf(tags).join(", ") || null,
        segments: [...segs],
      };
    });
    rows.sort((a, b) => (a.reachedOn < b.reachedOn ? 1 : -1));
    return { ok: true, title: `Application → close rate · ${arg === "ALL" ? "All groups" : arg}`, rows, count: rows.length, detailsNote: null, fetchedAt: new Date().toISOString() };
  }
  const opps = wonOpps(mode, range);
  let list: WonOpp[];
  let title: string;
  if (which === "all") {
    list = opps;
    title = `Won opportunities · ${MODE_LABEL[mode]}`;
  } else if (which === "pipeline") {
    list = opps.filter((o) => o.pipelineId === arg);
    title = `${list[0]?.pipelineName ?? mappingConfig.pipelines.find((p) => p.id === arg)?.name ?? arg} · won`;
  } else if (which === "stage") {
    list = opps.filter((o) => o.stageId === arg);
    title = `${list[0]?.stageName ?? stageIndex().stages.get(arg) ?? arg} · won`;
  } else if (which === "programs") {
    const ids = new Set(cfg.currentPrograms.map((p) => p.stageId));
    list = opps.filter((o) => ids.has(o.stageId));
    title = "Current programs · won";
  } else if (which === "past") {
    const ids = new Set(cfg.pastSemesters.map((p) => p.wonStageId));
    list = opps.filter((o) => ids.has(o.stageId));
    title = "Past semesters · won";
  } else if (which === "campaign") {
    list = arg === "none" ? opps.filter((o) => o.campaigns.length === 0) : opps.filter((o) => o.campaigns.some((c) => c.toLowerCase() === arg));
    title = arg === "none" ? "Won · no campaign tag" : `Won · ${arg}`;
  } else return null;
  const segs = (o: WonOpp) => [o.programKind, ...(cfg.currentPrograms.some((p) => p.stageId === o.stageId) ? ["programs"] : []), ...(cfg.pastSemesters.some((p) => p.wonStageId === o.stageId) ? ["past"] : [])];
  const rows = list.map((o) => wonRow(o, names, segs(o)));
  return { ok: true, title, rows, count: rows.length, detailsNote: null, fetchedAt: new Date().toISOString() };
}

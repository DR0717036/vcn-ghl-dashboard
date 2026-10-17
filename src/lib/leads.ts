// The Leads row (owner request 2026-10-17). Reads the local cache only.
//
// "New leads" = contacts created in the selected range (GHL dateAdded),
// one per contact id. Program = the contact's current tags (army / veteran /
// both / none). Campaign = the contact's current tags that match the list in
// config/leads.json; a lead with several campaign tags counts in each tag's
// column but once in any total. Source = GHL's contact source field,
// normalized (trimmed, case-insensitive; blank = Unknown).
//
// Outcomes are judged as of the last sync, not the end of the range:
//   current stage   — the contact's live opportunity (program pipelines
//                     preferred; most recently updated when several);
//   working stage   — status open, stage not New Lead and not in the
//                     configured dead-end list;
//   touched         — any outbound call (human), SMS, or email to the
//                     contact within touchWindowDays before now;
//   appointment     — any non-deleted appointment booked for the contact;
//   submitted       — first CA 101 submitted or IAU App Submitted (FS2)
//                     milestone event (events exist since the first sync, so
//                     leads created before that are "history unavailable");
//   won / lost      — opportunity status; still New Lead — stage is New Lead;
//   stale           — still New Lead for more than staleAfterDays, measured
//                     from GHL's stage-entry time when present, else from the
//                     contact's creation time (flagged "estimated").

import raw from "../../config/leads.json";
import { buckets, fill, type Grouping, type TimePoint } from "@/lib/charts";
import { getDb } from "@/lib/db";
import { fmtDay, type DateRange } from "@/lib/dates";
import { contactUrl, type DrillResult, type DrillRow } from "@/lib/drilldown";
import { mappingConfig } from "@/lib/mapping-config";
import { classifyTags, coverage, kpiLeadsAssigned, kpiNewLeads, type KpiResult } from "@/lib/metrics";
import { userNames } from "@/lib/milestones";
import { repRoster } from "@/lib/reps";
import { HISTORY_START } from "@/lib/sync/core";

// ---- config ---------------------------------------------------------------------------

export interface LeadsConfig {
  campaignTags: string[];
  deadEndStages: string[];
  newLeadStageName: string;
  touchWindowDays: number;
  staleAfterDays: number;
  topSources: number;
}

export function leadsConfig(): LeadsConfig {
  const c = raw as unknown as Partial<LeadsConfig>;
  const int = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : d);
  const list = (v: unknown, d: string[]) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : d);
  return {
    campaignTags: list(c.campaignTags, ["vcn26", "missioncyber", "ccnusa", "ccusa", "ccn26", "vcn26 referral"]),
    deadEndStages: list(c.deadEndStages, ["DND", "Not interested", "Unqualified", "Wrong number", "Flagged"]),
    newLeadStageName: typeof c.newLeadStageName === "string" && c.newLeadStageName.trim() ? c.newLeadStageName.trim() : "New Lead",
    touchWindowDays: int(c.touchWindowDays, 7),
    staleAfterDays: int(c.staleAfterDays, 2),
    topSources: Math.max(1, int(c.topSources, 6)),
  };
}

// ---- types --------------------------------------------------------------------------------

export type TagClass = "army" | "veteran" | "both" | "untagged";
export const TAG_CLASS_LABEL: Record<TagClass, string> = { army: "Army", veteran: "Veteran", both: "Both (army + veteran)", untagged: "No tag" };
export const NO_CAMPAIGN = "No campaign tag";
export const n = (v: number) => v.toLocaleString("en-US");
export const pct = (num: number, den: number, digits = 0): string => (den > 0 ? `${((num / den) * 100).toFixed(digits)}%` : "—");

export interface LeadOpp {
  id: string;
  pipelineId: string;
  pipelineName: string;
  stageId: string;
  stageName: string;
  status: string;
  /** GHL's stage-entry time, when it has one. */
  stageAt: string | null;
  assignedTo: string | null;
}

export interface Lead {
  id: string;
  name: string | null;
  createdAt: string;
  assignedTo: string | null;
  sourceKey: string;
  sourceLabel: string;
  cls: TagClass;
  tags: string[];
  /** Matched campaign tags, in config order. */
  campaigns: string[];
  bulk: boolean;
  opp: LeadOpp | null;
  // outcomes as of the last sync
  working: boolean;
  stillNewLead: boolean;
  lastTouchAt: string | null;
  lastHumanTouchAt: string | null;
  touched: boolean;
  touchedHuman: boolean;
  appointmentAt: string | null;
  historyAvailable: boolean;
  submitted: { label: string; at: string } | null;
  won: boolean;
  lost: boolean;
  /** Stale: still New Lead for more than staleAfterDays. */
  stale: boolean;
  daysInNewLead: number | null;
  /** True when the New Lead time comes from the contact's creation time, not GHL's stage-entry time. */
  daysEstimated: boolean;
}

export interface Split {
  army: number;
  veteran: number;
  both: number;
  untagged: number;
  total: number;
}
export const emptySplit = (): Split => ({ army: 0, veteran: 0, both: 0, untagged: 0, total: 0 });
export function splitOf(items: { cls: TagClass }[]): Split {
  const s = emptySplit();
  for (const it of items) {
    s[it.cls] += 1;
    s.total += 1;
  }
  return s;
}

const iso = (d: Date) => d.toISOString();
const norm = (s: string) => s.trim().toLowerCase();

function stageIndex() {
  const stages = new Map<string, { name: string; pipelineId: string; pipelineName: string }>();
  for (const p of mappingConfig.pipelines) for (const s of p.stages) stages.set(s.id, { name: s.name, pipelineId: p.id, pipelineName: p.name });
  return stages;
}

// ---- cohort ---------------------------------------------------------------------------------

/** Every contact created in [start, end) with its outcomes as of now. Sorted newest first. */
export function buildLeads(range: DateRange): Lead[] {
  const cfg = leadsConfig();
  const start = iso(range.start);
  const end = iso(range.end);
  const now = range.asOf;
  const nowIso = iso(now);
  const historyStart = coverage().firstCoreSyncAt;
  const stages = stageIndex();
  const programPipelines = new Set(Object.values(mappingConfig.programs).map((p) => p.pipelineId));
  const newLeadIds = new Set([...stages.entries()].filter(([, s]) => norm(s.name) === norm(cfg.newLeadStageName)).map(([id]) => id));
  const deadEnd = new Set(cfg.deadEndStages.map(norm));
  const campaignList = cfg.campaignTags.map((t) => ({ raw: t, key: norm(t) }));
  const db = getDb();

  const contacts = db
    .prepare(`SELECT id, name, date_added, assigned_to, source, tags FROM contacts WHERE date_added >= ? AND date_added < ? ORDER BY date_added DESC`)
    .all(start, end) as unknown as { id: string; name: string | null; date_added: string; assigned_to: string | null; source: string | null; tags: string | null }[];
  if (contacts.length === 0) return [];

  // bulk-created (possible import): 25 or more contacts created within the same minute, same heuristic as the New Leads card
  const bulkMinutes = new Set(
    (db.prepare(`SELECT substr(date_added, 1, 16) AS minute FROM contacts WHERE date_added >= ? AND date_added < ? GROUP BY minute HAVING COUNT(*) >= 25`).all(start, end) as unknown as { minute: string }[]).map((r) => r.minute),
  );

  // live opportunities for these contacts (created in range, so their opportunities were too, but we match by contact id)
  const opps = new Map<string, LeadOpp & { updatedAt: string }>();
  for (const o of db
    .prepare(
      `SELECT o.id, o.contact_id, o.pipeline_id, o.stage_id, o.status, o.last_stage_change_at, o.assigned_to, o.updated_at
         FROM opportunities o JOIN contacts c ON c.id = o.contact_id
        WHERE o.missing_since IS NULL AND c.date_added >= ? AND c.date_added < ?`,
    )
    .all(start, end) as unknown as { id: string; contact_id: string; pipeline_id: string; stage_id: string; status: string; last_stage_change_at: string | null; assigned_to: string | null; updated_at: string | null }[]) {
    const st = stages.get(o.stage_id);
    const cand = { id: o.id, pipelineId: o.pipeline_id, pipelineName: st?.pipelineName ?? o.pipeline_id, stageId: o.stage_id, stageName: st?.name ?? o.stage_id, status: o.status, stageAt: o.last_stage_change_at, assignedTo: o.assigned_to, updatedAt: o.updated_at ?? "" };
    const cur = opps.get(o.contact_id);
    if (!cur) {
      opps.set(o.contact_id, cand);
      continue;
    }
    const curProgram = programPipelines.has(cur.pipelineId);
    const candProgram = programPipelines.has(cand.pipelineId);
    if ((candProgram && !curProgram) || (candProgram === curProgram && cand.updatedAt > cur.updatedAt)) opps.set(o.contact_id, cand);
  }

  // outbound touches since the range started (a touch before creation is impossible)
  const touch = new Map<string, { any: string; human: string | null }>();
  const bump = (cid: string, t: string, human: boolean) => {
    const cur = touch.get(cid) ?? { any: t, human: null };
    if (t > cur.any) cur.any = t;
    if (human && (cur.human === null || t > cur.human)) cur.human = t;
    touch.set(cid, cur);
  };
  for (const r of db.prepare(`SELECT contact_id, MAX(date_added) AS t FROM calls WHERE direction = 'outbound' AND automated = 0 AND contact_id IS NOT NULL AND date_added >= ? GROUP BY contact_id`).all(start) as unknown as { contact_id: string; t: string }[]) bump(r.contact_id, r.t, true);
  for (const r of db.prepare(`SELECT contact_id, COALESCE(source, '') AS source, MAX(date_added) AS t FROM messages WHERE direction = 'outbound' AND contact_id IS NOT NULL AND date_added >= ? GROUP BY contact_id, COALESCE(source, '')`).all(start) as unknown as { contact_id: string; source: string; t: string }[]) bump(r.contact_id, r.t, r.source !== "workflow");

  // appointments (first booking per contact)
  const appt = new Map<string, string>();
  for (const r of db.prepare(`SELECT contact_id, MIN(date_added) AS t FROM appointments WHERE deleted = 0 AND contact_id IS NOT NULL AND date_added >= ? GROUP BY contact_id`).all(start) as unknown as { contact_id: string; t: string }[]) appt.set(r.contact_id, r.t);

  // submissions: first CA 101 / FS2 milestone event per contact
  const sub = new Map<string, { label: string; at: string }>();
  const labels = new Map<string, string>([
    ["army_ca101", "CA 101 submitted"],
    ["vet_iau_app_submitted", "IAU App Submitted (FS2)"],
  ]);
  for (const r of db
    .prepare(`SELECT contact_id, milestone_key, MIN(event_time) AS t FROM milestone_events WHERE kind = 'milestone' AND contact_id IS NOT NULL AND milestone_key IN ('army_ca101', 'vet_iau_app_submitted') AND event_time >= ? GROUP BY contact_id, milestone_key`)
    .all(start) as unknown as { contact_id: string; milestone_key: string; t: string }[]) {
    const cur = sub.get(r.contact_id);
    if (!cur || r.t < cur.at) sub.set(r.contact_id, { label: labels.get(r.milestone_key) ?? r.milestone_key, at: r.t });
  }

  const windowStart = new Date(now.getTime() - cfg.touchWindowDays * 86400000).toISOString();
  return contacts.map((c) => {
    let tags: string[] = [];
    try {
      tags = c.tags ? (JSON.parse(c.tags) as string[]) : [];
    } catch {
      tags = [];
    }
    const tagKeys = new Set(tags.map(norm));
    const campaigns = campaignList.filter((t) => tagKeys.has(t.key)).map((t) => t.raw);
    const sourceLabel = (c.source ?? "").trim() || "Unknown";
    const opp = opps.get(c.id) ?? null;
    const stillNewLead = Boolean(opp && newLeadIds.has(opp.stageId));
    const working = Boolean(opp && opp.status === "open" && !stillNewLead && !deadEnd.has(norm(opp.stageName)));
    const t = touch.get(c.id);
    const stageTime = stillNewLead ? (opp?.stageAt ?? null) : null;
    const since = stillNewLead ? (stageTime ?? c.date_added) : null;
    const daysInNewLead = since ? (now.getTime() - Date.parse(since)) / 86400000 : null;
    const historyAvailable = Boolean(historyStart) && c.date_added >= (historyStart as string);
    return {
      id: c.id,
      name: c.name,
      createdAt: c.date_added,
      assignedTo: c.assigned_to || null,
      sourceKey: norm(sourceLabel),
      sourceLabel,
      cls: classifyTags(c.tags),
      tags,
      campaigns,
      bulk: bulkMinutes.has(c.date_added.slice(0, 16)),
      opp,
      working,
      stillNewLead,
      lastTouchAt: t?.any ?? null,
      lastHumanTouchAt: t?.human ?? null,
      touched: Boolean(t && t.any >= windowStart && t.any <= nowIso),
      touchedHuman: Boolean(t && t.human && t.human >= windowStart),
      appointmentAt: appt.get(c.id) ?? null,
      historyAvailable,
      submitted: historyAvailable ? (sub.get(c.id) ?? null) : null,
      won: opp?.status === "won",
      lost: opp?.status === "lost",
      stale: stillNewLead && daysInNewLead !== null && daysInNewLead > cfg.staleAfterDays,
      daysInNewLead,
      daysEstimated: stillNewLead && stageTime === null,
    };
  });
}

// ---- 1. headline cards + series ------------------------------------------------------------------

export interface ComparedSeries {
  grouping: Grouping;
  points: TimePoint[];
  prior: TimePoint[] | null;
  priorReason?: string;
  total: number;
}

function compared(range: DateRange, query: (start: string, end: string) => { t: string; c: number }[], historyStart: string | undefined, what: string): ComparedSeries {
  const b = buckets(range.start, range.end);
  const points = fill(b, query(iso(range.start), iso(range.end)));
  const total = points.reduce((s, p) => s + p.count, 0);
  if (!historyStart || iso(range.prevStart) < historyStart) {
    return { grouping: b.grouping, points, total, prior: null, priorReason: historyStart ? `${what} history starts ${fmtDay(new Date(historyStart))}, after the comparison period began.` : `${what} history has not started yet.` };
  }
  const pb = buckets(range.prevStart, range.prevEnd);
  return { grouping: b.grouping, points, total, prior: fill(pb, query(iso(range.prevStart), iso(range.prevEnd))) };
}

export interface LeadHeadlines {
  newLeads: KpiResult;
  assigned: KpiResult;
  newSeries: ComparedSeries;
  assignedSeries: ComparedSeries;
}

export function computeLeadHeadlines(range: DateRange): LeadHeadlines {
  const db = getDb();
  return {
    newLeads: kpiNewLeads(range),
    assigned: kpiLeadsAssigned(range),
    newSeries: compared(range, (s, e) => db.prepare(`SELECT date_added AS t, 1 AS c FROM contacts WHERE date_added >= ? AND date_added < ?`).all(s, e) as { t: string; c: number }[], HISTORY_START, "Contact"),
    assignedSeries: compared(
      range,
      (s, e) => db.prepare(`SELECT MIN(observed_at) AS t, 1 AS c FROM assignment_events WHERE to_user IS NOT NULL AND observed_at >= ? AND observed_at < ? GROUP BY contact_id`).all(s, e) as { t: string; c: number }[],
      coverage().firstCoreSyncAt,
      "Assignment",
    ),
  };
}

// ---- 2. program × campaign matrix ---------------------------------------------------------------------

export interface MatrixResult {
  columns: string[];
  /** rows[cls][column] = count; "total" row and a Total column included. */
  rows: { key: TagClass | "total"; label: string; cells: number[]; total: number }[];
  total: number;
  multiCampaign: number;
  noCampaign: number;
  split: Split;
  notes: string[];
}

export function computeMatrix(leads: Lead[]): MatrixResult {
  const cfg = leadsConfig();
  const columns = [...cfg.campaignTags, NO_CAMPAIGN];
  const classes: (TagClass | "total")[] = ["army", "veteran", "both", "untagged", "total"];
  const grid = new Map<string, number[]>(classes.map((c) => [c, columns.map(() => 0)]));
  const rowTotals = new Map<string, number>(classes.map((c) => [c, 0]));
  let multi = 0;
  let none = 0;
  for (const l of leads) {
    const cols = l.campaigns.length > 0 ? l.campaigns.map((c) => columns.indexOf(c)) : [columns.length - 1];
    if (l.campaigns.length > 1) multi += 1;
    if (l.campaigns.length === 0) none += 1;
    for (const key of [l.cls, "total"] as const) {
      const row = grid.get(key)!;
      for (const i of cols) row[i] += 1;
      rowTotals.set(key, (rowTotals.get(key) ?? 0) + 1);
    }
  }
  return {
    columns,
    rows: classes.map((c) => ({ key: c, label: c === "total" ? "Total" : TAG_CLASS_LABEL[c], cells: grid.get(c)!, total: rowTotals.get(c) ?? 0 })),
    total: leads.length,
    multiCampaign: multi,
    noCampaign: none,
    split: splitOf(leads),
    notes: [
      "New leads — contacts created in the period (GHL dateAdded), one per contact ID; the Total equals the New Leads Created card.",
      "Program — the contact's current tags: army, veteran, Both when it carries both, No tag when neither. The four rows add up to Total.",
      `Campaign columns — the contact's current tags that match config/leads.json (${cfg.campaignTags.join(", ")}); No campaign tag = none of them.`,
      `Several campaign tags — a lead with more than one campaign tag counts in each tag's column but once in the Total column, so the campaign columns can add up to more than Total (${n(multi)} such ${multi === 1 ? "lead" : "leads"} in this period).`,
      "Donut — the same four program buckets as the rows.",
    ],
  };
}

// ---- 3. outcomes -------------------------------------------------------------------------------------

export interface OutcomeRow {
  key: string;
  label: string;
  count: number;
  /** Per campaign tag (config order) then No campaign tag. */
  byCampaign: number[];
  detail?: string;
  /** "history unavailable" rows: the count covers only leads with history. */
  historyBasis?: number;
}

export interface OutcomesResult {
  cohort: number;
  columns: string[];
  rows: OutcomeRow[];
  withHistory: number;
  historyUnavailable: number;
  historyStart: string | undefined;
  asOf: string;
  touchWindowDays: number;
  notes: string[];
}

export function computeOutcomes(leads: Lead[]): OutcomesResult {
  const cfg = leadsConfig();
  const columns = [...cfg.campaignTags, NO_CAMPAIGN];
  const byCampaign = (f: (l: Lead) => boolean) => {
    const out = columns.map(() => 0);
    for (const l of leads) {
      if (!f(l)) continue;
      if (l.campaigns.length === 0) out[columns.length - 1] += 1;
      for (const c of l.campaigns) out[columns.indexOf(c)] += 1;
    }
    return out;
  };
  const row = (key: string, label: string, f: (l: Lead) => boolean, detail?: string, historyBasis?: number): OutcomeRow => ({ key, label, count: leads.filter(f).length, byCampaign: byCampaign(f), detail, historyBasis });
  const withHistory = leads.filter((l) => l.historyAvailable).length;
  const humanTouched = leads.filter((l) => l.touchedHuman).length;
  const noOpp = leads.filter((l) => !l.opp).length;
  const asOf = coverage().lastCoreSyncOkAt ?? new Date().toISOString();
  const deadEnd = leads.filter((l) => l.opp && l.opp.status === "open" && !l.stillNewLead && !l.working).length;
  return {
    cohort: leads.length,
    columns,
    rows: [
      row("created", "Total created", () => true),
      row("working", "In a working stage", (l) => l.working, `${n(deadEnd)} in a dead-end stage · ${n(noOpp)} with no opportunity`),
      row("touched", `Touched in last ${cfg.touchWindowDays} days`, (l) => l.touched, `${n(humanTouched)} by a person (call or manually sent message)`),
      row("appointment", "Appointment booked", (l) => l.appointmentAt !== null),
      row("submitted", "Submitted (CA 101 or IAU App FS2)", (l) => l.submitted !== null, withHistory < leads.length ? `history unavailable for ${n(leads.length - withHistory)}` : undefined, withHistory),
      row("won", "Won", (l) => l.won),
      row("lost", "Lost", (l) => l.lost),
      row("newLead", "Still in New Lead stage", (l) => l.stillNewLead),
    ],
    withHistory,
    historyUnavailable: leads.length - withHistory,
    historyStart: coverage().firstCoreSyncAt,
    asOf,
    touchWindowDays: cfg.touchWindowDays,
    notes: [
      "Cohort — contacts created in the period; every row counts cohort contacts on its own as of the last sync, so rows overlap and are not nested.",
      `In a working stage — the contact's live opportunity is open and its stage is neither ${cfg.newLeadStageName} nor a dead-end stage (${cfg.deadEndStages.join(", ")}); program pipelines are preferred when a contact has several opportunities.`,
      `Touched — any outbound human call, SMS, or email to the contact in the ${cfg.touchWindowDays} days before now (workflow sends included; the detail shows how many were touched by a person).`,
      "Appointment booked — any non-deleted appointment for the contact, whatever its status.",
      "Submitted — the first CA 101 submitted or IAU App Submitted (FS2) milestone event for the contact; the % uses only leads created after milestone tracking began.",
      "Won / Lost — the live opportunity's status. Still in New Lead — its stage is New Lead.",
      "By campaign — each row split by the contact's campaign tags (a lead with several counts under each) and No campaign tag.",
      `Limitation: milestone events exist only since the first sync (${coverage().firstCoreSyncAt ? fmtDay(new Date(coverage().firstCoreSyncAt as string)) : "not yet"}), so leads created before that show history unavailable on the Submitted step.`,
    ],
  };
}

// ---- 4. assigned by user --------------------------------------------------------------------------------

export interface UserRow {
  userId: string | null;
  name: string;
  kind: "rep" | "user" | "unassigned";
  count: number;
  split: Split;
  byCampaign: number[];
}

export interface AssignedResult {
  columns: string[];
  rows: UserRow[];
  total: UserRow;
  notes: string[];
}

export function computeAssignedByUser(leads: Lead[]): AssignedResult {
  const cfg = leadsConfig();
  const columns = [...cfg.campaignTags, NO_CAMPAIGN];
  const roster = repRoster();
  const names = userNames();
  const groups = new Map<string, Lead[]>();
  for (const l of leads) {
    const k = l.assignedTo ?? "__unassigned";
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  const mk = (userId: string | null, name: string, kind: UserRow["kind"], list: Lead[]): UserRow => {
    const byCampaign = columns.map(() => 0);
    for (const l of list) {
      if (l.campaigns.length === 0) byCampaign[columns.length - 1] += 1;
      for (const c of l.campaigns) byCampaign[columns.indexOf(c)] += 1;
    }
    return { userId, name, kind, count: list.length, split: splitOf(list), byCampaign };
  };
  const reps = [...roster.byUserId.entries()].map(([id, rep]) => mk(id, rep.name, "rep", groups.get(id) ?? [])).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const others = [...groups.keys()]
    .filter((k) => k !== "__unassigned" && !roster.byUserId.has(k))
    .map((k) => mk(k, names.get(k) ?? k, "user", groups.get(k) ?? []))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const unassigned = mk(null, "Unassigned", "unassigned", groups.get("__unassigned") ?? []);
  return {
    columns,
    rows: [...reps, ...others, unassigned],
    total: mk(null, "Team total", "user", leads),
    notes: [
      "Rows — new leads created in the period grouped by the contact's current assigned user (a snapshot as of the last sync, not the owner at creation); sales reps first, then other GHL users, then Unassigned. The total equals the New Leads Created card.",
      "Army / Veteran / Both / No tag — the contact's current tags; the four add up to the row's count.",
      "Campaign columns — a lead with several campaign tags counts under each, so campaign columns can add up to more than the row's count.",
      "Chart — Army, Veteran, and Both / No tag per user, the same figures as the table.",
    ],
  };
}

// ---- 5. stale new leads ---------------------------------------------------------------------------------

export interface StaleResult {
  count: number;
  split: Split;
  stillNewLead: number;
  estimated: number;
  byUser: { userId: string | null; name: string; count: number; oldestDays: number }[];
  staleAfterDays: number;
  notes: string[];
}

export function computeStaleLeads(leads: Lead[]): StaleResult {
  const cfg = leadsConfig();
  const names = userNames();
  const stale = leads.filter((l) => l.stale);
  const by = new Map<string, { userId: string | null; name: string; count: number; oldestDays: number }>();
  for (const l of stale) {
    const k = l.assignedTo ?? "__unassigned";
    const cur = by.get(k) ?? { userId: l.assignedTo, name: l.assignedTo ? (names.get(l.assignedTo) ?? l.assignedTo) : "Unassigned", count: 0, oldestDays: 0 };
    cur.count += 1;
    cur.oldestDays = Math.max(cur.oldestDays, l.daysInNewLead ?? 0);
    by.set(k, cur);
  }
  return {
    count: stale.length,
    split: splitOf(stale),
    stillNewLead: leads.filter((l) => l.stillNewLead).length,
    estimated: stale.filter((l) => l.daysEstimated).length,
    byUser: [...by.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    staleAfterDays: cfg.staleAfterDays,
    notes: [
      `Stale — new leads created in the period whose live opportunity is still in the ${cfg.newLeadStageName} stage and has been for more than ${cfg.staleAfterDays} days, as of the last sync.`,
      "Days waiting — from GHL's stage-entry time (lastStageChangeAt) when the opportunity has one; otherwise from the contact's creation time, marked estimated.",
      "Last outbound touch — the most recent outbound call, SMS, or email to the contact (workflow sends included), or none.",
      "Assigned user — the contact's current owner.",
      "Army / Veteran — the contact's current tags; Both and No tag count in the headline only.",
    ],
  };
}

// ---- 6. source report -----------------------------------------------------------------------------------

export interface SourceRow {
  key: string;
  label: string;
  leads: number;
  split: Split;
  appointment: number;
  submitted: number;
  withHistory: number;
  won: number;
  lost: number;
  /** submitted ÷ leads with history, or null when no lead has history. */
  conversion: number | null;
}

export interface SourceReport {
  by: "source" | "campaign";
  rows: SourceRow[];
  total: SourceRow;
  topSources: number;
  notes: string[];
}

function sourceRow(key: string, label: string, list: Lead[]): SourceRow {
  const withHistory = list.filter((l) => l.historyAvailable).length;
  const submitted = list.filter((l) => l.submitted !== null).length;
  return {
    key,
    label,
    leads: list.length,
    split: splitOf(list),
    appointment: list.filter((l) => l.appointmentAt !== null).length,
    submitted,
    withHistory,
    won: list.filter((l) => l.won).length,
    lost: list.filter((l) => l.lost).length,
    conversion: withHistory > 0 ? submitted / withHistory : null,
  };
}

export function computeSourceReport(leads: Lead[], by: "source" | "campaign"): SourceReport {
  const cfg = leadsConfig();
  const groups = new Map<string, { label: string; list: Lead[] }>();
  if (by === "source") {
    for (const l of leads) {
      const g = groups.get(l.sourceKey) ?? { label: l.sourceLabel, list: [] };
      g.list.push(l);
      groups.set(l.sourceKey, g);
    }
  } else {
    for (const t of [...cfg.campaignTags, NO_CAMPAIGN]) groups.set(norm(t), { label: t, list: [] });
    for (const l of leads) {
      if (l.campaigns.length === 0) groups.get(norm(NO_CAMPAIGN))!.list.push(l);
      for (const c of l.campaigns) groups.get(norm(c))!.list.push(l);
    }
  }
  const rows = [...groups.entries()].map(([key, g]) => sourceRow(key, g.label, g.list)).filter((r) => by === "source" || r.leads > 0 || r.key !== norm(NO_CAMPAIGN)).sort((a, b) => b.leads - a.leads || a.label.localeCompare(b.label));
  return {
    by,
    rows,
    total: sourceRow("__total", "All new leads", leads),
    topSources: cfg.topSources,
    notes:
      by === "source"
        ? [
            "Source — GHL's contact source field, trimmed and matched case-insensitively; blank = Unknown. Each lead has exactly one source, so the rows add up to the total.",
            "Appointment booked / won / lost — as on the New Lead Outcomes card, as of the last sync.",
            "Submitted — first CA 101 submitted or IAU App Submitted (FS2) milestone; conversion % = submitted ÷ leads created after milestone tracking began (the count shown under it), or — when none has history.",
            `Donut — the top ${cfg.topSources} sources by leads, the rest as Other. Bar chart — conversion % per source, sources with at least one lead with history.`,
          ]
        : [
            "Campaign tag — the contact's current tags that match config/leads.json; a lead with several campaign tags is counted under each, so the rows can add up to more than the total. No campaign tag = none matched.",
            "Appointment booked / submitted / won / lost / conversion — the same definitions as the source table.",
          ],
  };
}

// ---- drilldowns ------------------------------------------------------------------------------------

function leadRow(l: Lead, names: Map<string, string>, segments?: string[]): DrillRow {
  return {
    contactId: l.id,
    opportunityId: l.opp?.id ?? l.id,
    name: l.name,
    ghlUrl: contactUrl(l.id),
    source: l.sourceLabel,
    assignedUser: l.assignedTo ? (names.get(l.assignedTo) ?? l.assignedTo) : null,
    pipeline: l.opp?.pipelineName ?? null,
    status: l.opp ? (l.historyAvailable ? l.opp.status : `${l.opp.status} · history unavailable`) : "no opportunity",
    phone: null,
    email: null,
    value: null,
    stage: l.opp?.stageName ?? null,
    stageReached: "lead",
    milestoneKey: "lead",
    tags: l.tags,
    createdOn: l.createdAt,
    reachedOn: l.createdAt,
    tagClass: TAG_CLASS_LABEL[l.cls],
    campaigns: l.campaigns.length ? l.campaigns.join(", ") : null,
    lastTouchAt: l.lastTouchAt,
    daysWaiting: l.daysInNewLead === null ? null : Math.round(l.daysInNewLead * 10) / 10,
    daysEstimated: l.daysEstimated,
    outcomeStage: l.historyAvailable ? (l.submitted?.label ?? null) : "history unavailable",
    outcomeOn: l.submitted?.at ?? null,
    scheduledFor: l.appointmentAt,
    segments,
  };
}

/**
 * New-lead drilldowns. which: all | outcomes (segments per outcome row) |
 * user (arg = user id or "unassigned") | stale | source (arg = source key) |
 * campaign (arg = tag, or "none").
 */
export function leadsDrilldown(which: string, arg: string, range: DateRange): DrillResult | null {
  const leads = buildLeads(range);
  const names = userNames();
  const segs = (l: Lead): string[] => [
    "created",
    ...(l.working ? ["working"] : []),
    ...(l.touched ? ["touched"] : []),
    ...(l.appointmentAt ? ["appointment"] : []),
    ...(l.submitted ? ["submitted"] : []),
    ...(l.won ? ["won"] : []),
    ...(l.lost ? ["lost"] : []),
    ...(l.stillNewLead ? ["newLead"] : []),
    ...(l.stale ? ["stale"] : []),
    ...(l.historyAvailable ? [] : ["historyUnavailable"]),
  ];
  let list: Lead[];
  let title: string;
  if (which === "all" || which === "outcomes") {
    list = leads;
    title = "New leads created";
  } else if (which === "user") {
    list = leads.filter((l) => (arg === "unassigned" ? l.assignedTo === null : l.assignedTo === arg));
    title = arg === "unassigned" ? "Unassigned new leads" : `New leads assigned to ${names.get(arg) ?? arg}`;
  } else if (which === "stale") {
    list = leads.filter((l) => l.stale);
    title = "Stale new leads";
  } else if (which === "source") {
    list = leads.filter((l) => l.sourceKey === arg);
    title = `New leads from ${list[0]?.sourceLabel ?? arg}`;
  } else if (which === "campaign") {
    list = arg === norm(NO_CAMPAIGN) ? leads.filter((l) => l.campaigns.length === 0) : leads.filter((l) => l.campaigns.some((c) => norm(c) === arg));
    title = arg === norm(NO_CAMPAIGN) ? "New leads with no campaign tag" : `New leads tagged ${arg}`;
  } else return null;
  const rows = list.map((l) => leadRow(l, names, segs(l)));
  if (which === "stale") rows.sort((a, b) => (b.daysWaiting ?? 0) - (a.daysWaiting ?? 0));
  return { ok: true, title, rows, count: rows.length, detailsNote: null, fetchedAt: new Date().toISOString() };
}

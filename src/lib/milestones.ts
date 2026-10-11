// Program milestone metrics (brief sections 2, 3.7, 6, 7).
// "Achieved during period" counts EVENTS: the first verified entry into the
// milestone stage per contact, program, and reporting group. "Currently in
// stage" is a separate SNAPSHOT. The two are never mixed.

import { getDb } from "@/lib/db";
import type { DateRange } from "@/lib/dates";
import { fmtDay } from "@/lib/dates";
import { goalFor } from "@/lib/goals";
import { mappingConfig, type MilestoneMapping } from "@/lib/mapping-config";
import { coverage } from "@/lib/metrics";

export interface RepLine {
  userId: string | null;
  name: string;
  contacts: number;
  value: number;
}

export interface MilestoneResult {
  key: string;
  label: string;
  program: "army" | "veteran";
  programLabel: string;
  stageName: string;
  reportingGroup: string;
  groupBasis: string;
  /** Unique contacts achieving the milestone during the period (null = unavailable). */
  achieved: number | null;
  unavailableReason?: string;
  achievedOpps: number;
  /** Sum of Opportunity Value over the distinct opportunities behind the achievements. */
  value: number;
  valueMissing: number;
  /** Contacts that entered the stage in the period but could not be placed in a reporting group. */
  unclassified: number;
  prev: number | null;
  prevUnavailableReason?: string;
  goal: number | null;
  currentInStage: number;
  currentValue: number;
  currentValueMissing: number;
  currentWon: number;
  currentUnclassified: number;
  reps: RepLine[];
  partialHistory: boolean;
  notes: string[];
}

interface EventRow {
  who: string;
  contact_id: string | null;
  opportunity_id: string;
  event_time: string;
  assigned_to_at_event: string | null;
  value_at_event: number | null;
}

const FIRST_EVENTS = `
  SELECT COALESCE(e.contact_id, 'opp:' || e.opportunity_id) AS who, e.contact_id, e.opportunity_id, e.event_time,
         e.assigned_to_at_event, e.value_at_event
    FROM milestone_events e
    JOIN (SELECT COALESCE(contact_id, 'opp:' || opportunity_id) AS who, MIN(event_time) AS t
            FROM milestone_events WHERE kind = 'milestone' AND milestone_key = ? AND reporting_group = ? GROUP BY who) f
      ON COALESCE(e.contact_id, 'opp:' || e.opportunity_id) = f.who AND e.event_time = f.t
   WHERE e.kind = 'milestone' AND e.milestone_key = ? AND e.reporting_group = ? AND e.event_time >= ? AND e.event_time < ?`;

function firstEvents(key: string, group: string, start: string, end: string): EventRow[] {
  return getDb().prepare(FIRST_EVENTS).all(key, group, key, group, start, end) as unknown as EventRow[];
}

function userNames(): Map<string, string> {
  const rows = getDb().prepare(`SELECT id, name FROM users`).all() as { id: string; name: string | null }[];
  return new Map(rows.map((r) => [r.id, r.name ?? r.id]));
}

function tagFilterSql(group: string, m: MilestoneMapping): { sql: string; params: string[] } {
  // For tag-based groups, "currently in stage" is restricted to contacts carrying the group's tag.
  if (m.reportingGroupBasis !== "contact_tag") return { sql: "", params: [] };
  const tag = mappingConfig.reportingGroups[group]?.tag;
  if (!tag) return { sql: "", params: [] };
  return { sql: ` AND EXISTS (SELECT 1 FROM contacts c WHERE c.id = o.contact_id AND c.tags LIKE ?)`, params: [`%"${tag}"%`] };
}

export function computeMilestone(m: MilestoneMapping, range: DateRange, names: Map<string, string>): MilestoneResult {
  const cov = coverage();
  const group = m.reportingGroup;
  const start = range.start.toISOString();
  const end = range.end.toISOString();
  const base: MilestoneResult = {
    key: m.key,
    label: m.label,
    program: m.program,
    programLabel: mappingConfig.programs[m.program].label,
    stageName: m.stageName,
    reportingGroup: group,
    groupBasis: m.reportingGroupBasis === "contact_tag" ? `contact tag "${m.reportingGroupTag}"` : "stage name",
    achieved: null,
    achievedOpps: 0,
    value: 0,
    valueMissing: 0,
    unclassified: 0,
    prev: null,
    goal: goalFor(m.key, range.key),
    currentInStage: 0,
    currentValue: 0,
    currentValueMissing: 0,
    currentWon: 0,
    currentUnclassified: 0,
    reps: [],
    partialHistory: false,
    notes: [],
  };

  // ---- snapshot: currently in stage ----
  const tf = tagFilterSql(group, m);
  const cur = getDb()
    .prepare(
      `SELECT COUNT(*) AS c, COALESCE(SUM(o.monetary_value), 0) AS v,
              SUM(CASE WHEN o.monetary_value IS NULL THEN 1 ELSE 0 END) AS missing,
              SUM(CASE WHEN o.status = 'won' THEN 1 ELSE 0 END) AS won
         FROM opportunities o WHERE o.stage_id = ? AND o.missing_since IS NULL${tf.sql}`,
    )
    .get(m.stageId, ...tf.params) as { c: number; v: number; missing: number | null; won: number | null };
  base.currentInStage = cur.c;
  base.currentValue = cur.v;
  base.currentValueMissing = cur.missing ?? 0;
  base.currentWon = cur.won ?? 0;
  if (tf.sql) {
    const all = getDb().prepare(`SELECT COUNT(*) AS c FROM opportunities o WHERE o.stage_id = ? AND o.missing_since IS NULL`).get(m.stageId) as { c: number };
    base.currentUnclassified = all.c - cur.c;
  }

  if (!cov.firstCoreSyncAt) {
    return { ...base, unavailableReason: "Milestone tracking has not started yet (no completed sync).", prevUnavailableReason: "No milestone history." };
  }

  // ---- events: achieved during the period ----
  const rows = firstEvents(m.key, group, start, end);
  const contacts = new Set<string>();
  const opps = new Map<string, number | null>();
  const reps = new Map<string | null, RepLine>();
  for (const r of rows) {
    contacts.add(r.who);
    if (!opps.has(r.opportunity_id)) opps.set(r.opportunity_id, r.value_at_event);
    const line = reps.get(r.assigned_to_at_event) ?? {
      userId: r.assigned_to_at_event,
      name: r.assigned_to_at_event ? (names.get(r.assigned_to_at_event) ?? r.assigned_to_at_event) : "Unassigned",
      contacts: 0,
      value: 0,
    };
    line.contacts += 1;
    line.value += r.value_at_event ?? 0;
    reps.set(r.assigned_to_at_event, line);
  }
  let value = 0;
  let missing = 0;
  for (const v of opps.values()) {
    if (v === null) missing += 1;
    else value += v;
  }
  const unclassified = getDb()
    .prepare(
      `SELECT COUNT(DISTINCT COALESCE(contact_id, 'opp:' || opportunity_id)) AS c FROM milestone_events
        WHERE kind = 'milestone' AND milestone_key = ? AND reporting_group IN ('unclassified', 'ambiguous') AND event_time >= ? AND event_time < ?`,
    )
    .get(m.key, start, end) as { c: number };

  const prevRows = firstEvents(m.key, group, range.prevStart.toISOString(), range.prevEnd.toISOString());
  const partialHistory = start < cov.firstCoreSyncAt;
  const prevPartial = range.prevStart.toISOString() < cov.firstCoreSyncAt;

  const notes = [
    `Counts the first entry into "${m.stageName}" once per contact in reporting group ${group} (${base.groupBasis}). Re-entering the stage does not count again.`,
    "Opportunity Value is the sum over the distinct opportunities behind these contacts, using the value at the time of the event.",
  ];
  if (partialHistory) {
    notes.push(
      `Milestone tracking began ${fmtDay(new Date(cov.firstCoreSyncAt))}. Before that date only contacts still sitting in this stage at the first sync are known (dated by GHL's stage-entry time); contacts that had already moved on are not counted.`,
    );
  }

  return {
    ...base,
    achieved: contacts.size,
    achievedOpps: opps.size,
    value,
    valueMissing: missing,
    unclassified: unclassified.c,
    prev: new Set(prevRows.map((r) => r.who)).size,
    prevUnavailableReason: prevPartial ? "Comparison period predates full milestone tracking; prior-period count is partial." : undefined,
    reps: [...reps.values()].sort((a, b) => b.contacts - a.contacts || b.value - a.value),
    partialHistory,
    notes,
  };
}

export function computeMilestones(range: DateRange): MilestoneResult[] {
  const names = userNames();
  return mappingConfig.milestones.map((m) => computeMilestone(m, range, names));
}

export function fmtUsd(v: number): string {
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

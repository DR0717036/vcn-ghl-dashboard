// Data for the scorecard charts. Reads the local cache only.

import { getDb } from "@/lib/db";
import { addDays, dayKeysBetween, hourKeysBetween, nyDayKey, nyHourKey, startOfWeek, type DateRange } from "@/lib/dates";
import { mappingConfig, type MilestoneMapping } from "@/lib/mapping-config";
import { HISTORY_START } from "@/lib/sync/core";

export type Grouping = "hourly" | "daily" | "weekly";

export interface TimePoint {
  key: string; // bucket start: YYYY-MM-DD (New York) or YYYY-MM-DDTHH
  label: string;
  count: number;
  /** Optional second measure (e.g. Opportunity Value) for the same bucket. */
  value?: number;
}

export interface TimeSeries {
  grouping: Grouping;
  points: TimePoint[];
  total: number;
}

/** A series for the selected range plus the same measure over the comparison period, aligned bucket by bucket. */
export interface ComparedSeries extends TimeSeries {
  prior: TimePoint[] | null;
  priorReason?: string;
  priorTotal: number | null;
}

// Bucket keys are already New York calendar values ("YYYY-MM-DD" or
// "YYYY-MM-DDTHH"), so labels are built from the key's own numbers. (Until
// 2026-10-15 the hour label re-formatted the hour as a UTC instant in New
// York time, which printed every hourly label five hours early.)
const shortDayUtc = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
function hourLabel(h: number): string {
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
}

interface Buckets {
  grouping: Grouping;
  keys: string[];
  labels: string[];
  bucketOf: (d: Date) => string;
}

/** Hourly for a single day, daily up to 92 days, weekly (Monday start) beyond. */
function buckets(start: Date, end: Date): Buckets {
  const days = dayKeysBetween(start, end);
  const grouping: Grouping = days.length <= 1 ? "hourly" : days.length > 92 ? "weekly" : "daily";
  let keys: string[];
  if (grouping === "hourly") keys = hourKeysBetween(start, end);
  else if (grouping === "daily") keys = days;
  else {
    keys = [];
    let cur = startOfWeek(start);
    while (cur.getTime() < end.getTime()) {
      keys.push(nyDayKey(cur));
      cur = addDays(cur, 7);
    }
  }
  const labels = keys.map((k) => {
    const [y, m, d] = k.slice(0, 10).split("-").map(Number);
    if (grouping === "hourly") return hourLabel(Number(k.slice(11, 13)));
    const label = shortDayUtc.format(new Date(Date.UTC(y, m - 1, d)));
    return grouping === "weekly" ? `wk of ${label}` : label;
  });
  const bucketOf = (d: Date) => (grouping === "hourly" ? nyHourKey(d) : grouping === "daily" ? nyDayKey(d) : nyDayKey(startOfWeek(d)));
  return { grouping, keys, labels, bucketOf };
}

function fill(b: Buckets, rows: { t: string; c: number; v?: number }[]): TimePoint[] {
  const counts = new Map<string, { c: number; v: number }>();
  for (const k of b.keys) counts.set(k, { c: 0, v: 0 });
  for (const r of rows) {
    const k = b.bucketOf(new Date(r.t));
    const cur = counts.get(k);
    if (!cur) continue; // outside the bucket list (cannot happen for in-range rows)
    cur.c += r.c;
    cur.v += r.v ?? 0;
  }
  return b.keys.map((k, i) => {
    const c = counts.get(k)!;
    return { key: k, label: b.labels[i], count: c.c, value: c.v };
  });
}

/** New contacts per bucket (contact creation date). */
export function newLeadsSeries(range: DateRange): TimeSeries {
  const rows = getDb()
    .prepare(`SELECT date_added AS t, 1 AS c FROM contacts WHERE date_added >= ? AND date_added < ?`)
    .all(range.start.toISOString(), range.end.toISOString()) as { t: string; c: number }[];
  const b = buckets(range.start, range.end);
  return { grouping: b.grouping, points: fill(b, rows), total: rows.length };
}

function compared(range: DateRange, query: (start: string, end: string) => { t: string; c: number; v?: number }[], what: string): ComparedSeries {
  const b = buckets(range.start, range.end);
  const rows = query(range.start.toISOString(), range.end.toISOString());
  const points = fill(b, rows);
  const total = points.reduce((s, p) => s + p.count, 0);
  if (range.prevStart.toISOString() < HISTORY_START) {
    return { grouping: b.grouping, points, total, prior: null, priorTotal: null, priorReason: `${what} history starts ${HISTORY_START.slice(0, 10)}, after the comparison period began.` };
  }
  // The comparison period is bucketed on its own calendar, then aligned by position (day 1 ↔ day 1).
  const pb = buckets(range.prevStart, range.prevEnd);
  const prior = fill(pb, query(range.prevStart.toISOString(), range.prevEnd.toISOString()));
  return { grouping: b.grouping, points, total, prior, priorTotal: prior.reduce((s, p) => s + p.count, 0) };
}

/** Human call attempts per bucket, with the comparison period. */
export function callsSeries(range: DateRange): ComparedSeries {
  return compared(
    range,
    (start, end) =>
      getDb()
        .prepare(
          `SELECT MIN(date_added) AS t, 1 AS c FROM calls WHERE automated = 0 AND date_added >= ? AND date_added < ? GROUP BY COALESCE(alt_id, id)`,
        )
        .all(start, end) as { t: string; c: number }[],
    "Call",
  );
}

/** Recorded call minutes per bucket (completed/answered human calls), with the comparison period. */
export function talkTimeSeries(range: DateRange): ComparedSeries {
  const s = compared(
    range,
    (start, end) =>
      getDb()
        .prepare(
          `SELECT MIN(date_added) AS t, MAX(duration) AS c FROM calls
            WHERE automated = 0 AND call_status IN ('completed', 'answered') AND duration > 0 AND date_added >= ? AND date_added < ?
            GROUP BY COALESCE(alt_id, id)`,
        )
        .all(start, end) as { t: string; c: number }[],
    "Call",
  );
  const toMin = (p: TimePoint) => ({ ...p, count: Math.round(p.count / 60) });
  return {
    ...s,
    points: s.points.map(toMin),
    prior: s.prior ? s.prior.map(toMin) : null,
    total: Math.round(s.total / 60),
    priorTotal: s.priorTotal === null ? null : Math.round(s.priorTotal / 60),
  };
}

/**
 * First entries into a milestone stage per bucket: contacts (count) and the
 * Opportunity Value of the distinct opportunities behind them (value).
 */
export function milestoneSeries(m: MilestoneMapping, range: DateRange): TimeSeries {
  const rows = getDb()
    .prepare(
      `SELECT f.t, 1 AS c, COALESCE(MAX(e.value_at_event), 0) AS v
         FROM (SELECT COALESCE(contact_id, 'opp:' || opportunity_id) AS who, MIN(event_time) AS t
                 FROM milestone_events WHERE kind = 'milestone' AND milestone_key = ? AND reporting_group = ? GROUP BY who) f
         JOIN milestone_events e
           ON COALESCE(e.contact_id, 'opp:' || e.opportunity_id) = f.who AND e.event_time = f.t
          AND e.kind = 'milestone' AND e.milestone_key = ? AND e.reporting_group = ?
        WHERE f.t >= ? AND f.t < ? GROUP BY f.who, f.t`,
    )
    .all(m.key, m.reportingGroup, m.key, m.reportingGroup, range.start.toISOString(), range.end.toISOString()) as { t: string; c: number; v: number }[];
  const b = buckets(range.start, range.end);
  return { grouping: b.grouping, points: fill(b, rows), total: rows.length };
}

export interface FunnelStep {
  stageId: string;
  stageName: string;
  label: string;
  count: number;
  value: number;
  milestone: boolean;
}

export interface Funnel {
  program: "army" | "veteran";
  label: string;
  reportingGroup: string;
  steps: FunnelStep[];
}

/** Current-in-stage counts for each program's milestone path (snapshot, all statuses). */
export function programFunnels(): Funnel[] {
  const db = getDb();
  const countStage = db.prepare(
    `SELECT COUNT(*) AS c, COALESCE(SUM(monetary_value), 0) AS v FROM opportunities WHERE stage_id = ? AND missing_since IS NULL`,
  );
  const pipelineOrder = (pipelineId: string) =>
    new Map(mappingConfig.pipelines.find((p) => p.id === pipelineId)?.stages.map((s, i) => [s.id, i]) ?? []);

  return (["army", "veteran"] as const).map((program) => {
    const pipelineId = mappingConfig.programs[program].pipelineId;
    const order = pipelineOrder(pipelineId);
    const steps: FunnelStep[] = [
      ...mappingConfig.milestones
        .filter((m) => m.program === program)
        .map((m) => ({ stageId: m.stageId, stageName: m.stageName, label: m.label, milestone: true })),
      ...mappingConfig.funnelOnlyStages
        .filter((s) => s.program === program)
        .map((s) => ({ stageId: s.stageId, stageName: s.stageName, label: s.stageName, milestone: false })),
    ]
      .sort((a, b) => (order.get(a.stageId) ?? 999) - (order.get(b.stageId) ?? 999))
      .map((s) => {
        const r = countStage.get(s.stageId) as { c: number; v: number };
        return { ...s, count: r.c, value: r.v };
      });
    const group = mappingConfig.milestones.find((m) => m.program === program)?.reportingGroup ?? "";
    return { program, label: mappingConfig.programs[program].label, reportingGroup: group, steps };
  });
}

// Data for the scorecard charts. Reads the local cache only.

import { getDb } from "@/lib/db";
import { addDays, dayKeysBetween, nyDayKey, startOfWeek, type DateRange } from "@/lib/dates";
import { mappingConfig } from "@/lib/mapping-config";

export interface TimePoint {
  key: string; // YYYY-MM-DD (New York) of the bucket start
  label: string;
  count: number;
}

export interface TimeSeries {
  grouping: "daily" | "weekly";
  points: TimePoint[];
  total: number;
}

const shortDay = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });

/** New contacts per New York day (or per Monday-start week when the range is long). */
export function newLeadsSeries(range: DateRange): TimeSeries {
  const rows = getDb()
    .prepare(`SELECT date_added FROM contacts WHERE date_added >= ? AND date_added < ?`)
    .all(range.start.toISOString(), range.end.toISOString()) as { date_added: string }[];
  const days = dayKeysBetween(range.start, range.end);
  const grouping: TimeSeries["grouping"] = days.length > 92 ? "weekly" : "daily";

  const bucketOf = (d: Date) => (grouping === "daily" ? nyDayKey(d) : nyDayKey(startOfWeek(d)));
  const counts = new Map<string, number>();
  const keys: string[] = [];
  if (grouping === "daily") {
    for (const k of days) keys.push(k);
  } else {
    let cur = startOfWeek(range.start);
    while (cur.getTime() < range.end.getTime()) {
      keys.push(nyDayKey(cur));
      cur = addDays(cur, 7);
    }
  }
  for (const k of keys) counts.set(k, 0);
  for (const r of rows) {
    const k = bucketOf(new Date(r.date_added));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const points = keys.map((k) => {
    const [y, m, d] = k.split("-").map(Number);
    const label = shortDay.format(new Date(Date.UTC(y, m - 1, d, 12)));
    return { key: k, label: grouping === "weekly" ? `wk of ${label}` : label, count: counts.get(k) ?? 0 };
  });
  return { grouping, points, total: rows.length };
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

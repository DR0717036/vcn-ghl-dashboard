// Reads config/goals.json. A goal is a plain number per KPI per range key;
// anything missing is "Goal not set". Edit the JSON, not this file.

import raw from "../../config/goals.json";
import type { RangeKey } from "@/lib/dates";

type GoalsFile = Record<string, Partial<Record<RangeKey, number>> | string>;

const goals = raw as unknown as GoalsFile;

export function goalFor(kpiKey: string, range: RangeKey): number | null {
  const entry = goals[kpiKey];
  if (!entry || typeof entry === "string") return null;
  const v = entry[range];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

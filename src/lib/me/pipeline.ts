// "My pipeline" for one rep: their live opportunities in the Army CA and
// Veteran G.I. Bill pipelines by stage (a snapshot as of the last sync),
// counted by opportunity id, with Opportunity Value (never revenue). Stage
// order follows the pipeline's own order in config/ghl-mapping.json.

import { getDb } from "@/lib/db";
import { mappingConfig, type ProgramKey } from "@/lib/mapping-config";
import type { Rep } from "@/lib/reps";

export interface StageRow {
  stageId: string;
  name: string;
  open: number;
  won: number;
  lost: number;
  total: number;
  /** Sum of Opportunity Value on the open opportunities in the stage. */
  openValue: number;
  valueMissing: number;
}

export interface ProgramPipeline {
  program: ProgramKey;
  label: string;
  pipelineName: string;
  stages: StageRow[];
  totals: { open: number; won: number; lost: number; total: number; openValue: number };
}

export interface RepPipelineData {
  programs: ProgramPipeline[];
  /** The rep's live opportunities outside the two program pipelines. */
  otherPipelines: number;
  notes: string[];
}

export function computeRepPipeline(rep: Rep): RepPipelineData {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT pipeline_id, stage_id, status, COUNT(*) AS c, COALESCE(SUM(CASE WHEN status = 'open' THEN monetary_value END), 0) AS v,
              SUM(CASE WHEN status = 'open' AND monetary_value IS NULL THEN 1 ELSE 0 END) AS missing
         FROM opportunities WHERE assigned_to = ? AND missing_since IS NULL GROUP BY pipeline_id, stage_id, status`,
    )
    .all(rep.userId) as unknown as { pipeline_id: string; stage_id: string; status: string; c: number; v: number; missing: number | null }[];
  const programs: ProgramPipeline[] = (["army", "veteran"] as ProgramKey[]).map((program) => {
    const p = mappingConfig.programs[program];
    const def = mappingConfig.pipelines.find((x) => x.id === p.pipelineId);
    const ordered = [...(def?.stages ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const stages: StageRow[] = ordered.map((s) => {
      const mine = rows.filter((r) => r.pipeline_id === p.pipelineId && r.stage_id === s.id);
      const by = (status: string) => mine.filter((r) => r.status === status).reduce((t, r) => t + r.c, 0);
      const open = by("open");
      const won = by("won");
      const lost = by("lost");
      return { stageId: s.id, name: s.name, open, won, lost, total: mine.reduce((t, r) => t + r.c, 0), openValue: mine.reduce((t, r) => t + (r.v ?? 0), 0), valueMissing: mine.reduce((t, r) => t + (r.missing ?? 0), 0) };
    });
    // Stages GHL reports that are missing from the mapping dump are still listed, so nothing is silently dropped.
    for (const r of rows.filter((x) => x.pipeline_id === p.pipelineId && !ordered.some((s) => s.id === x.stage_id))) {
      let s = stages.find((x) => x.stageId === r.stage_id);
      if (!s) {
        s = { stageId: r.stage_id, name: `Unmapped stage ${r.stage_id.slice(0, 8)}`, open: 0, won: 0, lost: 0, total: 0, openValue: 0, valueMissing: 0 };
        stages.push(s);
      }
      if (r.status === "open") s.open += r.c;
      else if (r.status === "won") s.won += r.c;
      else if (r.status === "lost") s.lost += r.c;
      s.total += r.c;
      s.openValue += r.v ?? 0;
      s.valueMissing += r.missing ?? 0;
    }
    const sum = (f: (s: StageRow) => number) => stages.reduce((t, s) => t + f(s), 0);
    return { program, label: p.label, pipelineName: p.pipelineName, stages, totals: { open: sum((s) => s.open), won: sum((s) => s.won), lost: sum((s) => s.lost), total: sum((s) => s.total), openValue: sum((s) => s.openValue) } };
  });
  const programIds = new Set(Object.values(mappingConfig.programs).map((p) => p.pipelineId));
  const otherPipelines = rows.filter((r) => !programIds.has(r.pipeline_id)).reduce((t, r) => t + r.c, 0);
  return {
    programs,
    otherPipelines,
    notes: [
      "Snapshot — your live opportunities (assigned to you in GHL) by pipeline stage as of the last sync, counted by opportunity id; a contact with an opportunity in both pipelines appears in both.",
      "Open / Won / Lost — the opportunity's status, not its stage name; Won means status = won.",
      "Opportunity Value — the value on the open opportunities in the stage; never revenue, cash, or commission. Opportunities with no value add nothing and are counted in the tooltip.",
      "Stage occupancy is a snapshot; milestone counts on the scorecard are events. The two are never mixed.",
    ],
  };
}

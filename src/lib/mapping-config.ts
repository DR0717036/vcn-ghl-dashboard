// Loads config/ghl-mapping.json, the single place where display labels are
// tied to real pipeline and stage IDs. Edit the JSON, not the code, when a
// fiscal year, semester, pipeline, or stage changes.

import raw from "../../config/ghl-mapping.json";

export type ProgramKey = "army" | "veteran";

export interface MilestoneMapping {
  key: string;
  program: ProgramKey;
  label: string;
  pipelineId: string;
  stageId: string;
  stageName: string;
  reportingGroup: string;
  reportingGroupBasis: "stage_name" | "contact_tag" | "unverified" | string;
  /** Contact tag that assigns the reporting group, when basis is contact_tag. */
  reportingGroupTag?: string;
  note?: string;
}

export interface StageRef {
  stageId: string;
  stageName: string;
}

export interface MappingConfig {
  timezone: string;
  programs: Record<ProgramKey, { label: string; pipelineId: string; pipelineName: string }>;
  nonProgramPipelines: {
    pipelineId: string;
    pipelineName: string;
    includedIn: string[];
    excludedFrom: string[];
    decision?: string;
  }[];
  milestones: MilestoneMapping[];
  funnelOnlyStages: (StageRef & {
    program: ProgramKey;
    pipelineId: string;
    reportingGroup: string;
    note?: string;
  })[];
  reportingGroups: Record<
    string,
    {
      program: ProgramKey;
      label: string;
      status: string;
      stages?: StageRef[];
      tag?: string;
      relatedTag?: string;
      relatedTags?: string[];
      basis?: string;
    }
  >;
  classificationTags: { army: string[]; veteran: string[]; rule: string };
  calendars: { excludedCalendarIds: string[]; note: string };
  wonRule: string;
  valueLabel: string;
}

/** Every contact tag the dashboard relies on, with what it is used for. */
export function mappedTags(): { tag: string; use: string }[] {
  const out: { tag: string; use: string }[] = [];
  for (const t of mappingConfig.classificationTags.army) out.push({ tag: t, use: "Classification: Army" });
  for (const t of mappingConfig.classificationTags.veteran) out.push({ tag: t, use: "Classification: Veteran" });
  for (const [key, g] of Object.entries(mappingConfig.reportingGroups)) {
    if (g.tag) out.push({ tag: g.tag, use: `Reporting group ${key} (${g.label})` });
    if (g.relatedTag) out.push({ tag: g.relatedTag, use: `Related to ${key} (informational; group comes from stage name)` });
    for (const t of g.relatedTags ?? []) out.push({ tag: t, use: `Related to ${key} (informational; group comes from stage name)` });
  }
  return out;
}

export const mappingConfig = raw as unknown as MappingConfig;

export function milestoneForStage(stageId: string): MilestoneMapping | undefined {
  return mappingConfig.milestones.find((m) => m.stageId === stageId);
}

export function funnelOnlyForStage(stageId: string) {
  return mappingConfig.funnelOnlyStages.find((s) => s.stageId === stageId);
}

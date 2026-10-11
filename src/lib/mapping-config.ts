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
  reportingGroupBasis: "stage_name" | "unverified" | string;
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
  reportingGroups: Record<string, { program: ProgramKey; label: string; status: string; stages?: StageRef[] }>;
  wonRule: string;
  valueLabel: string;
}

export const mappingConfig = raw as unknown as MappingConfig;

export function milestoneForStage(stageId: string): MilestoneMapping | undefined {
  return mappingConfig.milestones.find((m) => m.stageId === stageId);
}

export function funnelOnlyForStage(stageId: string) {
  return mappingConfig.funnelOnlyStages.find((s) => s.stageId === stageId);
}

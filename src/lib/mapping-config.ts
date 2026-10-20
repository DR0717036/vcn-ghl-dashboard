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
  /** Event-tracked stages shown as Primary KPI cards, not as program milestone cards. */
  kpiMilestones: MilestoneMapping[];
  /** Stages read as current-occupancy snapshots (never events). */
  snapshotStages: {
    appointmentConfirmed: (StageRef & { program: ProgramKey; pipelineId: string })[];
  };
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
  /** Live dump of every pipeline and stage at generation time. */
  pipelines: { id: string; name: string; stages: { id: string; name: string; position?: number }[] }[];
  /** Veteran semesters the Submissions section can switch between. */
  semesters: { _comment?: string; list: Semester[] };
}

/** One Veteran G.I. Bill semester: its reporting group and the milestone keys of its application path. */
export interface Semester {
  /** Reporting group key, e.g. "FS2" or "SS1-2027". Also the ?semester= URL value. */
  key: string;
  label: string;
  /** Short label for column headers and chart bars. */
  short: string;
  submittedKey: string;
  acceptedKey: string;
  wonKey: string;
  signedStageId: string;
  default?: boolean;
}

/** Every configured semester, default first. */
export function semesters(): Semester[] {
  const list = mappingConfig.semesters?.list ?? [];
  return [...list].sort((a, b) => Number(Boolean(b.default)) - Number(Boolean(a.default)));
}

export function defaultSemester(): Semester {
  const list = semesters();
  if (list.length === 0) throw new Error("config/ghl-mapping.json has no semesters.list entry.");
  return list[0];
}

/** The semester named by a ?semester= value, or the default when missing or unknown. */
export function semesterFor(key: string | undefined | null): Semester {
  if (!key) return defaultSemester();
  const k = key.trim().toLowerCase();
  return semesters().find((s) => s.key.toLowerCase() === k) ?? defaultSemester();
}

/** Query-string fragment naming a semester, empty for the default (keeps default URLs clean). */
export function semesterQuery(s: Semester): string {
  return s.default ? "" : `&semester=${encodeURIComponent(s.key)}`;
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

/** Every stage whose entries are recorded as milestone events: the six program milestones plus KPI-only ones. */
export function trackedMilestones(): MilestoneMapping[] {
  return [...mappingConfig.milestones, ...mappingConfig.kpiMilestones];
}

export function milestoneForStage(stageId: string): MilestoneMapping | undefined {
  return trackedMilestones().find((m) => m.stageId === stageId);
}

export function funnelOnlyForStage(stageId: string) {
  return mappingConfig.funnelOnlyStages.find((s) => s.stageId === stageId);
}

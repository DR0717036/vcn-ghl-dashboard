// Template → workflow names. GHL does not put a workflow id on a message
// (verified 2026-10-15), so the only honest way to show which workflow uses
// a message template is a mapping the owner maintains in
// config/workflow-templates.json: each entry pairs the opening words of a
// template (as they appear on the Conversations cards, names and numbers
// removed) with the workflow's name. Unmapped templates say so in the UI.

import raw from "../../config/workflow-templates.json";

export interface WorkflowMapping {
  workflow: string;
  /** Opening words of the template, matched after the same normalization the cards use. */
  templateStartsWith: string;
  note?: string;
}

const mappings: WorkflowMapping[] = ((raw as { mappings?: WorkflowMapping[] }).mappings ?? []).filter((m) => m && typeof m.templateStartsWith === "string");

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/https?:\/\/\S+|www\.\S+/g, " ")
    .replace(/[0-9]+/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

const prepared = mappings.map((m) => ({ ...m, key: norm(m.templateStartsWith) })).filter((m) => m.key.length > 0);

/** The workflow name mapped to a template key ("w:…" / "m:…"), or null when the owner has not mapped it (or left the name blank). */
export function workflowFor(templateKey: string): string | null {
  const key = templateKey.replace(/^[wm]:/, "");
  if (!key) return null;
  let best: { key: string; workflow: string } | null = null;
  for (const m of prepared) {
    if (key.startsWith(m.key) && (!best || m.key.length > best.key.length)) best = m;
  }
  return best && best.workflow.trim() ? best.workflow.trim() : null;
}

export function mappingCount(): { total: number; named: number } {
  return { total: prepared.length, named: prepared.filter((m) => m.workflow.trim()).length };
}

// Template → workflow names. GHL does not put a workflow id on a message
// (verified 2026-10-15), so the only honest way to show which workflow uses
// a message template is a mapping the owner maintains in
// config/workflow-templates.json: each entry pairs the template text as it
// is written in the workflow (merge fields allowed) with the workflow's
// name. Unmapped templates say so in the UI.
//
// Matching: the template text is normalized exactly like a sent message
// (lower case; links, numbers, and punctuation removed), with
// {{contact.first_name}} treated as "a name that was removed" (zero or one
// word) and {{user.first_name}} / {{user.name}} as "any one word" (the rep's
// name differs per send). The normalized opening of the template is then
// compared word by word with the sent message's ten-word key.

import raw from "../../config/workflow-templates.json";

export interface WorkflowMapping {
  workflow: string;
  /** The template's opening text as written in the workflow; merge fields like {{contact.first_name}} are allowed. */
  templateStartsWith: string;
  note?: string;
}

const CONTACT = "__contact__";
const USER = "__user__";

const mappings: WorkflowMapping[] = ((raw as { mappings?: WorkflowMapping[] }).mappings ?? []).filter((m) => m && typeof m.templateStartsWith === "string");

/** Normalize template text into tokens, keeping merge fields as placeholder tokens. */
export function templateTokens(text: string): string[] {
  return text
    .replace(/\{\{\s*contact\.(first_name|name|last_name)\s*\}\}/gi, ` ${CONTACT} `)
    .replace(/\{\{\s*user\.(first_name|name|last_name)\s*\}\}/gi, ` ${USER} `)
    .replace(/\{\{[^}]*\}\}/g, " ")
    .toLowerCase()
    .replace(/https?:\/\/\S+|www\.\S+/g, " ")
    .replace(/[0-9]+/g, " ")
    .replace(/[^a-z\s_]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** True when the sent message's key words follow the template's opening tokens (with merge-field wildcards). */
export function keyMatchesTemplate(keyWords: string[], tokens: string[]): boolean {
  let i = 0; // key index
  let j = 0; // token index
  let matched = 0;
  while (i < keyWords.length && j < tokens.length) {
    const t = tokens[j];
    if (t === USER) {
      i += 1;
      j += 1;
      matched += 1;
      continue;
    }
    if (t === CONTACT) {
      // the name is normally removed from the key; if the next template word does not match here, assume one name word remains
      const next = tokens[j + 1];
      if (next !== undefined && keyWords[i] !== next && keyWords[i + 1] === next) i += 1;
      j += 1;
      continue;
    }
    if (keyWords[i] !== t) return false;
    i += 1;
    j += 1;
    matched += 1;
  }
  // need a meaningful overlap: at least 4 real words, and either side fully consumed
  return matched >= 4 && (i === keyWords.length || j === tokens.length);
}

const prepared = mappings.map((m) => ({ ...m, tokens: templateTokens(m.templateStartsWith) })).filter((m) => m.tokens.filter((t) => t !== USER && t !== CONTACT).length >= 4);

/** The workflow name mapped to a template key ("w:…" / "m:…"), or null when not mapped (or the name is blank). */
export function workflowFor(templateKey: string): string | null {
  const key = templateKey.replace(/^[wm]:/, "");
  if (!key) return null;
  const words = key.split(" ").filter(Boolean);
  let best: { workflow: string; len: number } | null = null;
  for (const m of prepared) {
    if (!m.workflow.trim()) continue;
    if (keyMatchesTemplate(words, m.tokens) && (!best || m.tokens.length > best.len)) best = { workflow: m.workflow.trim(), len: m.tokens.length };
  }
  return best?.workflow ?? null;
}

export function mappingCount(): { total: number; named: number } {
  return { total: prepared.length, named: prepared.filter((m) => m.workflow.trim()).length };
}

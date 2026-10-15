// Matching a message cluster to an email builder template (by opening text)
// and a template to a workflow (by normalized name). Reads the local cache
// only, so the cards can call it synchronously.
//
// Workflow names are "best match by template name": GHL does not record the
// workflow on a message, and the Workflows API exposes no steps, so the only
// link is that the email builder templates are named like the workflows that
// send them (e.g. "Tier 1 Army" ↔ "Tier 1 *Army"). Entries in
// config/workflow-templates.json always win over this match.

import { getDb } from "@/lib/db";

export interface CachedTemplate {
  id: string;
  name: string;
  path: string | null;
  html: string | null;
  body_key: string | null;
}

export const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** How many of the cluster's opening words appear, in order, near the start of the template's text. */
function openingOverlap(templateKey: string | null, words: string[]): number {
  if (!templateKey) return 0;
  const kw = templateKey.split(" ").slice(0, 80);
  let i = 0;
  for (const w of kw) if (w === words[i]) i += 1;
  return i;
}

let templateCache: { at: number; rows: CachedTemplate[] } | null = null;
function cachedTemplates(): CachedTemplate[] {
  if (templateCache && Date.now() - templateCache.at < 60_000) return templateCache.rows;
  const rows = getDb().prepare(`SELECT id, name, path, html, body_key FROM email_templates WHERE body_key IS NOT NULL`).all() as unknown as CachedTemplate[];
  templateCache = { at: Date.now(), rows };
  return rows;
}

/**
 * Best cached builder template for a cluster: a template whose rendered text
 * opens like the cluster's messages (at least six opening words in order);
 * among several, prefer the one whose name matches the given workflow.
 */
export function matchBuilderTemplate(workflow: string | null, clusterKey: string): { item: CachedTemplate; html: string | null } | null {
  const words = clusterKey.replace(/^[wm]:/, "").split(" ").filter(Boolean).slice(0, 10);
  const need = Math.min(6, words.length);
  if (need < 4) return null;
  const w = workflow ? normName(workflow.replace(/\*/g, " ")) : null;
  let best: { item: CachedTemplate; score: number } | null = null;
  for (const t of cachedTemplates()) {
    const overlap = openingOverlap(t.body_key, words);
    if (overlap < need) continue;
    const tn = normName(t.name);
    const nameBonus = w && (tn === w || tn.includes(w) || w.includes(tn)) ? 100 : 0;
    const score = overlap + nameBonus;
    if (!best || score > best.score) best = { item: t, score };
  }
  return best ? { item: best.item, html: best.item.html } : null;
}

let workflowCache: { at: number; names: string[] } | null = null;
/** Workflow names known to GHL (synced read-only into the workflows table). */
export function workflowNames(): string[] {
  if (workflowCache && Date.now() - workflowCache.at < 60_000) return workflowCache.names;
  let names: string[] = [];
  try {
    names = (getDb().prepare(`SELECT name FROM workflows`).all() as { name: string }[]).map((r) => r.name);
  } catch {
    names = [];
  }
  workflowCache = { at: Date.now(), names };
  return names;
}

/**
 * The workflow whose normalized name equals the template's normalized name
 * (punctuation, case, and extra spaces ignored). "Tier 1 Army" matches
 * "Tier 1 *Army". Returns null when no workflow name matches exactly.
 */
export function workflowByTemplateName(templateName: string): string | null {
  const t = normName(templateName);
  if (!t) return null;
  for (const name of workflowNames()) if (normName(name) === t) return name;
  // allow a trailing qualifier on either side, e.g. "Tier 2 Veteran" ↔ "Tier 2" when nothing else matches
  const candidates = workflowNames().filter((name) => {
    const n = normName(name);
    return n.length >= 6 && (t.startsWith(n + " ") || n.startsWith(t + " "));
  });
  return candidates.length === 1 ? candidates[0] : null;
}

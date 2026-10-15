// Email template drilldown (owner edits 2026-10-15, Part 2). Read-only.
//
// VERIFIED against the official docs and this account on 2026-10-15:
// - Engagement statistics (delivered / opened / clicked / bounced /
//   unsubscribed / spam) are NOT exposed through the API for this account's
//   emails: the message export leaves 99.9% of emails at status "sent";
//   GET /emails/schedule (email campaign stats) returns an empty list because
//   these emails are sent by workflows, not campaigns; GET /campaigns is
//   empty; workflows expose only id/name/status. No scope is missing; the
//   data simply is not there. Only sends and replies (computed here) exist.
// - Template HTML IS readable: the email builder list (GET /emails/builder)
//   returns a signed previewUrl per template that serves the rendered HTML.
//   Templates are matched to a message cluster by name through
//   config/workflow-templates.json (workflow name ↔ builder template name)
//   or by the template's own text; when no builder template matches, the
//   body of the most recent send is shown as "preview from last send".
// - Subjects are not in the local cache; the single-message endpoint
//   rejects email ids, so the subject of the latest send is read with a
//   narrow message export around its send time (one read-only call).

import { getDb } from "@/lib/db";
import { dayKeysBetween, nyDayKey, type DateRange } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { exportMessages } from "@/lib/ghl/read";
import { analyzeMessaging, dedupeByContact, templateStats, type TemplateRow } from "@/lib/messaging";

export interface EmailStat {
  key: "delivered" | "opened" | "clicked" | "softBounced" | "hardBounced" | "unsubscribed" | "spam" | "replied";
  label: string;
  /** null = unavailable in API */
  count: number | null;
  pct: number | null;
  reason?: string;
}

export interface EmailTemplateDrill {
  ok: true;
  row: TemplateRow;
  title: string;
  workflow: string | null;
  sends: number;
  rangeLabel: string;
  stats: EmailStat[];
  statusCounts: Record<string, number>;
  /** Per New York day in the range. */
  daily: { day: string; label: string; sends: number; replies: number }[];
  preview: { source: "template" | "last_send" | "none"; html: string | null; subject: string | null; templateName: string | null; sentAt: string | null; note: string };
  ghlUrl: string | null;
  notes: string[];
  fetchedAt: string;
}

const shortDay = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });

interface CachedTemplate {
  id: string;
  name: string;
  path: string | null;
  html: string | null;
  body_key: string | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** How many of the cluster's opening words appear, in order, near the start of the template's text. */
function openingOverlap(templateKey: string | null, words: string[]): number {
  if (!templateKey) return 0;
  const kw = templateKey.split(" ").slice(0, 80);
  let i = 0;
  for (const w of kw) if (w === words[i]) i += 1;
  return i;
}

/**
 * Best cached builder template for a cluster (no network): a template whose
 * rendered text opens like the cluster's messages; among several, prefer the
 * one whose name matches the mapped workflow. Needs at least six opening words
 * in order so an unrelated template is never shown.
 */
function matchBuilderTemplate(workflow: string | null, clusterKey: string): { item: CachedTemplate; html: string } | null {
  const templates = getDb().prepare(`SELECT id, name, path, html, body_key FROM email_templates WHERE html IS NOT NULL`).all() as unknown as CachedTemplate[];
  const words = clusterKey.replace(/^[wm]:/, "").split(" ").filter(Boolean).slice(0, 10);
  const need = Math.min(6, words.length);
  const w = workflow ? norm(workflow.replace(/\*/g, " ")) : null;
  let best: { item: CachedTemplate; score: number } | null = null;
  for (const t of templates) {
    const overlap = openingOverlap(t.body_key, words);
    if (overlap < need) continue;
    const tn = norm(t.name);
    const nameBonus = w && (tn === w || tn.includes(w) || w.includes(tn)) ? 100 : 0;
    const score = overlap + nameBonus;
    if (!best || score > best.score) best = { item: t, score };
  }
  return best && best.item.html ? { item: best.item, html: best.item.html } : null;
}

/** Subject of one sent email, via a narrow read-only export around its send time. */
async function subjectOf(messageId: string, sentAt: string): Promise<string | null> {
  const t = Date.parse(sentAt);
  const r = await exportMessages({ channel: "Email", limit: 100, startDate: new Date(t - 60_000).toISOString(), endDate: new Date(t + 60_000).toISOString(), sortBy: "createdAt", sortOrder: "asc" });
  if (!r.ok) return null;
  const m = (r.data.messages ?? []).find((x) => x.id === messageId) as { subject?: string } | undefined;
  return m?.subject?.trim() || null;
}

export async function emailTemplateDrilldown(templateKey: string, range: DateRange): Promise<EmailTemplateDrill | null> {
  const a = analyzeMessaging(range);
  const stats = templateStats(a, dedupeByContact(a.replies.filter((r) => r.optOut)), dedupeByContact(a.replies.filter((r) => r.interest)), "email");
  const row = stats.get(templateKey);
  if (!row) return null;
  const sends = a.sends.filter((s) => s.channel === "email" && s.templateKey === templateKey);
  const statusCounts: Record<string, number> = {};
  for (const s of sends) statusCounts[s.status ?? "none"] = (statusCounts[s.status ?? "none"] ?? 0) + 1;

  // daily sends / replies
  const days = dayKeysBetween(range.start, range.end);
  const byDay = new Map(days.map((d) => [d, { sends: 0, replies: 0 }]));
  for (const s of sends) {
    const d = byDay.get(nyDayKey(new Date(s.at)));
    if (!d) continue;
    d.sends += 1;
    if (s.repliedAt) d.replies += 1;
  }
  const daily = days.map((d) => {
    const [y, m, dd] = d.split("-").map(Number);
    return { day: d, label: shortDay.format(new Date(Date.UTC(y, m - 1, dd, 12))), ...byDay.get(d)! };
  });

  const unavailable = "unavailable in API";
  const reason = "GHL does not report this for workflow emails through the API (message status stays \"sent\"; no campaign statistics exist for workflow sends).";
  const statList: EmailStat[] = [
    { key: "delivered", label: "Delivered", count: null, pct: null, reason },
    { key: "opened", label: "Opened", count: null, pct: null, reason },
    { key: "clicked", label: "Clicked", count: null, pct: null, reason },
    { key: "softBounced", label: "Soft bounced", count: null, pct: null, reason },
    { key: "hardBounced", label: "Hard bounced", count: null, pct: null, reason },
    { key: "unsubscribed", label: "Unsubscribed", count: null, pct: null, reason },
    { key: "spam", label: "Spam", count: null, pct: null, reason },
    { key: "replied", label: "Replied", count: row.replies, pct: row.sends ? row.replies / row.sends : null },
  ];

  // preview
  let preview: EmailTemplateDrill["preview"] = { source: "none", html: null, subject: null, templateName: null, sentAt: null, note: "No preview available." };
  const latest = [...sends].sort((x, y) => (x.at < y.at ? 1 : -1))[0];
  if (templateKey.startsWith("w:") || templateKey.startsWith("m:")) {
    const match = matchBuilderTemplate(row.workflow, templateKey);
    if (match) {
      preview = { source: "template", html: match.html, subject: null, templateName: match.item.name, sentAt: null, note: `Rendered from the email builder template "${match.item.name}"${match.item.path ? ` (${match.item.path.replace(/^\//, "")})` : ""}, read from GHL by the sync.` };
    }
  }
  if (preview.source === "none" && latest) {
    const body = (getDb().prepare(`SELECT body FROM messages WHERE id = ?`).get(latest.id) as { body: string | null } | undefined)?.body ?? null;
    if (body) preview = { source: "last_send", html: body, subject: null, templateName: null, sentAt: latest.at, note: "Preview from last send: the body of the most recent email in this cluster, as delivered to that contact (merge fields already filled in)." };
  }
  if (latest) preview.subject = await subjectOf(latest.id, latest.at);

  const { locationId } = getEnv();
  const base = (process.env.GHL_APP_BASE_URL?.trim() || "https://app.gohighlevel.com").replace(/\/+$/, "");
  const ghlUrl = `${base}/v2/location/${encodeURIComponent(locationId)}/marketing/emails`;

  return {
    ok: true,
    row,
    title: row.label,
    workflow: row.workflow,
    sends: row.sends,
    rangeLabel: range.label,
    stats: statList,
    statusCounts,
    daily,
    preview,
    ghlUrl,
    notes: [
      "Sends — outbound emails in this cluster during the selected range (best match: emails whose first ten normalized words match).",
      "Replied — the first inbound message from the contact after the send, within the reply window and before the next outbound; rate = replies ÷ sends.",
      `${unavailable} — GHL's API does not expose delivery, open, click, bounce, unsubscribe, or spam figures for workflow-sent emails: the message export keeps them at status "sent" (${Object.entries(statusCounts).map(([k, v]) => `${k} ${v}`).join(", ")} in this range) and the email campaign statistics endpoint only covers campaigns, of which this account has none. Use "View in GHL" for GHL's own reporting.`,
      "Preview — the email builder template when one matches the workflow name or the opening text; otherwise the body of the most recent send. Rendered in a sandbox: no scripts, no forms, images only.",
      "Daily chart — sends per New York day in the range, with replies to those sends.",
      "Limitation: template matching is best match (opening words), and GHL does not record which workflow sent a message; the workflow name comes from config/workflow-templates.json.",
    ],
    fetchedAt: new Date().toISOString(),
  };
}

/** Sandbox-safe HTML: strip scripts, event handlers, forms, and anything that would load non-image resources. */
export function sanitizeEmailHtml(html: string): string {
  let h = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<(object|embed|form|input|button|textarea|select|link|base|meta)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:;">`;
  if (/<head[^>]*>/i.test(h)) h = h.replace(/<head[^>]*>/i, (m) => `${m}${csp}`);
  else h = `<!doctype html><html><head>${csp}</head><body>${h}</body></html>`;
  return h;
}

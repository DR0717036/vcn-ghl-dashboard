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
import { matchBuilderTemplate } from "@/lib/emailTemplateMatch";
import { analyzeMessaging, dedupeByContact, emptyEngagement, templateStats, type EmailEngagement, type TemplateRow } from "@/lib/messaging";

export interface EmailStat {
  key: "delivered" | "opened" | "clicked" | "bounced" | "pending" | "unsubscribed" | "spam" | "replied";
  label: string;
  /** null = unavailable in API */
  count: number | null;
  pct: number | null;
  reason?: string;
  /** Second caption line, e.g. the hard/soft split. */
  detail?: string;
  /** What the percentage is a share of. */
  of: "sends" | "delivered" | "none";
}

export interface EmailTemplateDrill {
  ok: true;
  row: TemplateRow;
  engagement: EmailEngagement;
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

  const e: EmailEngagement = row.engagement ?? emptyEngagement();
  const naReason = "GHL's API exposes no unsubscribe or spam-complaint figures for workflow emails.";
  const share = (c: number, base: number) => (base > 0 ? c / base : null);
  const statList: EmailStat[] = [
    { key: "delivered", label: "Delivered", count: e.delivered, pct: share(e.delivered, e.sends), of: "sends" },
    { key: "opened", label: "Opened", count: e.opened, pct: share(e.opened, e.delivered), of: "delivered" },
    { key: "clicked", label: "Clicked", count: e.clicked, pct: share(e.clicked, e.delivered), of: "delivered" },
    { key: "bounced", label: "Bounced", count: e.bounced, pct: share(e.bounced, e.sends), of: "sends", detail: e.bounced ? `hard ${e.hard} · soft ${e.soft}${e.unknownBounce ? ` · unclassified ${e.unknownBounce}` : ""}` : undefined },
    { key: "pending", label: "Pending", count: e.pending, pct: share(e.pending, e.sends), of: "sends", detail: e.checked < e.sends ? `${e.sends - e.checked} not read yet` : undefined },
    { key: "unsubscribed", label: "Unsubscribed", count: null, pct: null, reason: naReason, of: "none" },
    { key: "spam", label: "Spam", count: null, pct: null, reason: naReason, of: "none" },
    { key: "replied", label: "Replied", count: row.replies, pct: share(row.replies, row.sends), of: "sends" },
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
    engagement: e,
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
      "Delivered / Opened / Clicked / Bounced — GHL's status for each email, read one email at a time from the single-email endpoint by the sync (the export never updates it); delivered counts delivered, opened, clicked, and read; opened and clicked are shares of delivered; bounced is failed or undelivered as a share of sends, split hard (address does not exist) vs soft (temporary) from the provider's error text.",
      "Pending — sends GHL has not yet reported as delivered or bounced, or that the sync has not read yet; delivered + bounced + pending = sends.",
      `As of — the latest status check among these sends; emails sent in the last ${a.cfg.emailStatus.lookbackDays} days are re-read every ${a.cfg.emailStatus.refreshHours} hours, older ones are frozen as final.`,
      "Unavailable in API — GHL exposes no unsubscribe or spam-complaint figures for workflow emails (the per-contact unsubscription endpoint needs a scope this token lacks and is per contact, not per email). Use \"View in GHL\" for GHL's own reporting.",
      "Preview — the email builder template when one matches the workflow name or the opening text; otherwise the body of the most recent send. Rendered in a sandbox: no scripts, no forms, images only.",
      "Daily chart — sends per New York day in the range, with replies to those sends.",
      "Limitation: template matching is best match (opening words), and GHL does not record which workflow sent a message; the workflow name comes from config/workflow-templates.json or a best match by template name.",
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

// Conversations section, stage 2: opt-outs, interest replies, reply rate
// by template, and inbound by channel (selected range). Reads the local
// message cache only.
//
// ATTRIBUTION (best match). GHL does not put a workflow, campaign, or
// template id on a message (verified 2026-10-15), and this location has no
// saved templates, so "templates" are clusters of outbound text: the first
// ten words of the message after lower-casing and removing URLs, numbers,
// punctuation, and the contact's name. A reply is attributed to the most
// recent outbound message in the same conversation before it (within
// replyWindowDays). The sender type comes from GHL's message source:
// "workflow" (automated) or "app" (a person). Workflow NAMES cannot be
// linked to messages, so the UI says so instead of guessing.
//
// Message bodies appear only in drilldowns; template labels are the
// normalized opening words of outbound copy with names removed.

import { getDb } from "@/lib/db";
import { nyParts, type DateRange } from "@/lib/dates";
import { contactUrl, type DrillResult, type DrillRow } from "@/lib/drilldown";
import { mappingConfig } from "@/lib/mapping-config";
import { userNames } from "@/lib/milestones";
import { businessMinutesBetween, businessWindowLabel, conversationsConfig, type ConversationsConfig } from "@/lib/conversations";
import { mappingCount, workflowFor } from "@/lib/workflowMap";

export type TagClass = "army" | "veteran" | "both" | "untagged";
export const TAG_CLASS_LABEL: Record<TagClass, string> = { army: "Army", veteran: "Veteran", both: "Both (army + veteran)", untagged: "No tag" };
const CLASSES: TagClass[] = ["army", "veteran", "both", "untagged"];

export const MANUAL_KEY = "__manual";
export const NOTEXT_KEY = "__notext";
export const UNATTRIBUTED_KEY = "__none";
const TEMPLATE_WORDS = 10;
/** A text cluster with fewer sends than this, sent by a person, is a one-off manual message rather than a template. */
const MIN_TEMPLATE_SENDS = 3;

export function templateKeyOf(bodyKey: string | null, source: string | null): string {
  if (!bodyKey) return NOTEXT_KEY;
  const k = bodyKey.split(" ").slice(0, TEMPLATE_WORDS).join(" ");
  return source === "workflow" || source === "campaign" || source === "bulk_actions" ? `w:${k}` : `m:${k}`;
}

export function templateLabel(key: string, body: string | null): string {
  if (key === MANUAL_KEY) return "Manual messages (typed by a rep)";
  if (key === NOTEXT_KEY) return "No text (media or attachment only)";
  if (key === UNATTRIBUTED_KEY) return "No prior outbound message found";
  // Label from the normalized key (names, numbers, links, and HTML already removed), never from a raw message.
  void body;
  const words = key.slice(2).split(" ").slice(0, 9).join(" ");
  const w = words.charAt(0).toUpperCase() + words.slice(1);
  return `“${w}…”`;
}

export function classifyTags(tagsJson: string | null): TagClass {
  let tags: string[] = [];
  try {
    tags = tagsJson ? (JSON.parse(tagsJson) as string[]) : [];
  } catch {
    tags = [];
  }
  const a = mappingConfig.classificationTags.army.some((t) => tags.includes(t));
  const v = mappingConfig.classificationTags.veteran.some((t) => tags.includes(t));
  return a && v ? "both" : a ? "army" : v ? "veteran" : "untagged";
}

/** Whole-word keyword matcher. Keywords written in ALL CAPS in config (e.g. "IT") match case-sensitively; others ignore case. */
export function keywordMatcher(words: string[]): (text: string) => boolean {
  const esc = (w: string) => w.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const caseSensitive = words.filter((w) => w.trim() && w === w.toUpperCase() && /[A-Z]/.test(w));
  const caseInsensitive = words.filter((w) => w.trim() && !caseSensitive.includes(w));
  const reI = caseInsensitive.length ? new RegExp(`(^|[^a-z0-9])(${caseInsensitive.map(esc).join("|")})(?![a-z0-9])`, "i") : null;
  const reS = caseSensitive.length ? new RegExp(`(^|[^A-Za-z0-9])(${caseSensitive.map(esc).join("|")})(?![A-Za-z0-9])`) : null;
  return (text: string) => Boolean((reI && reI.test(text)) || (reS && reS.test(text)));
}

interface Msg {
  id: string;
  conversation_id: string;
  contact_id: string | null;
  direction: string;
  channel: string;
  date_added: string;
  user_id: string | null;
  source: string | null;
  body: string | null;
  body_key: string | null;
}

export interface Send {
  id: string;
  conversationId: string;
  contactId: string | null;
  channel: string;
  at: string;
  userId: string | null;
  source: string | null;
  templateKey: string;
  cls: TagClass;
  /** First inbound (any text) within the reply window and before the next outbound. */
  repliedAt: string | null;
}

export interface Reply {
  id: string;
  conversationId: string;
  contactId: string | null;
  channel: string;
  at: string;
  body: string | null;
  cls: TagClass;
  optOut: boolean;
  interest: boolean;
  /** The outbound message this reply answers (best match), if any within the window. */
  templateKey: string;
  sentBy: "workflow" | "rep" | "none";
  senderUserId: string | null;
  sentAt: string | null;
  afterHours: boolean;
  /** Business minutes to the next human reply (null when none within the window). */
  replyBusinessMinutes: number | null;
  replyClockMinutes: number | null;
}

export interface MessagingAnalysis {
  range: DateRange;
  cfg: ConversationsConfig;
  sends: Send[];
  replies: Reply[];
  /** Representative body per template key (for labels). */
  sample: Map<string, string | null>;
  inboundCalls: number;
}

function sameClass(cls: TagClass): Record<TagClass, number> {
  const o: Record<TagClass, number> = { army: 0, veteran: 0, both: 0, untagged: 0 };
  o[cls] = 1;
  return o;
}

export function analyzeMessaging(range: DateRange): MessagingAnalysis {
  const cfg = conversationsConfig();
  const db = getDb();
  const start = range.start.toISOString();
  const end = range.end.toISOString();
  const windowMs = cfg.replyWindowDays * 86400000;
  const lookback = new Date(range.start.getTime() - windowMs).toISOString();
  const horizon = new Date(Math.min(range.asOf.getTime(), range.end.getTime() + windowMs)).toISOString();
  const convIds = (db.prepare(`SELECT DISTINCT conversation_id FROM messages WHERE date_added >= ? AND date_added < ?`).all(start, end) as { conversation_id: string }[]).map((r) => r.conversation_id);

  // contact classes for everyone involved
  const contactIds = new Set<string>();
  const sel = db.prepare(`SELECT id, conversation_id, contact_id, direction, channel, date_added, user_id, source, body, body_key FROM messages WHERE conversation_id = ? AND date_added >= ? AND date_added < ? ORDER BY date_added ASC, id ASC`);
  const perConv = new Map<string, Msg[]>();
  for (const cid of convIds) {
    const msgs = sel.all(cid, lookback, horizon) as unknown as Msg[];
    perConv.set(cid, msgs);
    for (const m of msgs) if (m.contact_id) contactIds.add(m.contact_id);
  }
  const cls = new Map<string, TagClass>();
  const ids = [...contactIds];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    for (const c of db.prepare(`SELECT id, tags FROM contacts WHERE id IN (${chunk.map(() => "?").join(",")})`).all(...chunk) as unknown as { id: string; tags: string | null }[]) cls.set(c.id, classifyTags(c.tags));
  }
  const classOf = (contactId: string | null): TagClass => (contactId ? (cls.get(contactId) ?? "untagged") : "untagged");

  const isOptOut = keywordMatcher(cfg.optOutKeywords);
  const isInterest = keywordMatcher(cfg.interestKeywords);
  const isHuman = (m: Msg) => m.source !== "workflow" && m.source !== "campaign" && m.source !== "bulk_actions";
  const inWindow = (iso: string) => {
    const p = nyParts(new Date(iso));
    return cfg.businessHours.days.includes(p.wd) && p.h >= cfg.businessHours.startHour && p.h < cfg.businessHours.endHour;
  };

  // pass 1: cluster sizes, to tell templates from one-off manual texts
  const clusterSize = new Map<string, number>();
  for (const msgs of perConv.values()) for (const m of msgs) if (m.direction === "outbound" && m.date_added >= start && m.date_added < end) clusterSize.set(templateKeyOf(m.body_key, m.source), (clusterSize.get(templateKeyOf(m.body_key, m.source)) ?? 0) + 1);
  const finalKey = (m: Msg): string => {
    const k = templateKeyOf(m.body_key, m.source);
    if (k === NOTEXT_KEY) return k;
    if (k.startsWith("m:") && (clusterSize.get(k) ?? 0) < MIN_TEMPLATE_SENDS) return MANUAL_KEY;
    return k;
  };

  const sends: Send[] = [];
  const replies: Reply[] = [];
  const sample = new Map<string, string | null>();
  for (const [cid, msgs] of perConv) {
    let lastOut: { m: Msg; key: string } | null = null;
    let openSend: Send | null = null;
    const pendingReplies: Reply[] = [];
    for (const m of msgs) {
      if (m.direction === "outbound") {
        const key = finalKey(m);
        if (!sample.has(key)) sample.set(key, m.body);
        lastOut = { m, key };
        const human = isHuman(m);
        if (human && pendingReplies.length) {
          for (const r of pendingReplies) {
            if (Date.parse(m.date_added) - Date.parse(r.at) <= windowMs) {
              r.replyBusinessMinutes = businessMinutesBetween(new Date(r.at), new Date(m.date_added), cfg);
              r.replyClockMinutes = (Date.parse(m.date_added) - Date.parse(r.at)) / 60000;
            }
          }
          pendingReplies.length = 0;
        }
        if (m.date_added >= start && m.date_added < end) {
          openSend = { id: m.id, conversationId: cid, contactId: m.contact_id, channel: m.channel, at: m.date_added, userId: m.user_id, source: m.source, templateKey: key, cls: classOf(m.contact_id), repliedAt: null };
          sends.push(openSend);
        } else openSend = null;
      } else {
        // inbound
        if (openSend && openSend.repliedAt === null && Date.parse(m.date_added) - Date.parse(openSend.at) <= windowMs) openSend.repliedAt = m.date_added;
        if (m.date_added >= start && m.date_added < end) {
          const attributed = lastOut && Date.parse(m.date_added) - Date.parse(lastOut.m.date_added) <= windowMs ? lastOut : null;
          const text = (m.body ?? "").trim();
          const r: Reply = {
            id: m.id,
            conversationId: cid,
            contactId: m.contact_id,
            channel: m.channel,
            at: m.date_added,
            body: m.body,
            cls: classOf(m.contact_id),
            optOut: text.length > 0 && isOptOut(text),
            interest: text.length > 0 && isInterest(text),
            templateKey: attributed ? attributed.key : UNATTRIBUTED_KEY,
            sentBy: attributed ? (isHuman(attributed.m) ? "rep" : "workflow") : "none",
            senderUserId: attributed ? attributed.m.user_id : null,
            sentAt: attributed ? attributed.m.date_added : null,
            afterHours: !inWindow(m.date_added),
            replyBusinessMinutes: null,
            replyClockMinutes: null,
          };
          replies.push(r);
          pendingReplies.push(r);
        }
      }
    }
  }

  const inboundCalls = (
    db.prepare(`SELECT COUNT(DISTINCT COALESCE(alt_id, id)) AS c FROM calls WHERE automated = 0 AND direction = 'inbound' AND date_added >= ? AND date_added < ?`).get(start, end) as { c: number }
  ).c;
  return { range, cfg, sends, replies, sample, inboundCalls };
}

// ---------------- card results ----------------

export interface TemplateRow {
  key: string;
  label: string;
  sentBy: "workflow" | "rep" | "mixed" | "none";
  /** Workflow name from config/workflow-templates.json, or null when not mapped. */
  workflow: string | null;
  sends: number;
  sendsBy: Record<TagClass, number>;
  replies: number;
  repliesBy: Record<TagClass, number>;
  optOuts: number;
  interests: number;
  replyRate: number | null;
  optOutRate: number | null;
  interestRate: number | null;
}

/** Rows shown on a card; everything past the cap is summed into `rest`. */
export function capRows(rows: TemplateRow[], max: number): { rows: TemplateRow[]; rest: TemplateRow | null } {
  if (rows.length <= max) return { rows, rest: null };
  const tail = rows.slice(max);
  const rest: TemplateRow = { key: "__rest", label: `Other templates (${tail.length} more, each with fewer sends)`, sentBy: "mixed", workflow: null, sends: 0, sendsBy: emptyBy(), replies: 0, repliesBy: emptyBy(), optOuts: 0, interests: 0, replyRate: null, optOutRate: null, interestRate: null };
  for (const t of tail) {
    rest.sends += t.sends;
    rest.replies += t.replies;
    rest.optOuts += t.optOuts;
    rest.interests += t.interests;
    for (const c of CLASSES) {
      rest.sendsBy[c] += t.sendsBy[c];
      rest.repliesBy[c] += t.repliesBy[c];
    }
  }
  rest.replyRate = rest.sends ? rest.replies / rest.sends : null;
  rest.optOutRate = rest.sends ? rest.optOuts / rest.sends : null;
  rest.interestRate = rest.sends ? rest.interests / rest.sends : null;
  return { rows: rows.slice(0, max), rest };
}

export const KEYWORD_ROWS_MAX = 15;
export const REPLY_ROWS_MAX = 25;

export interface KeywordResult {
  kind: "optout" | "interest";
  title: string;
  keywords: string[];
  /** Distinct contacts (first matching inbound per contact in the range). */
  contacts: number;
  byClass: Record<TagClass, number>;
  /** Matching inbound messages before de-duplication. */
  messages: number;
  rows: TemplateRow[];
  /** Templates beyond the cap, summed. */
  rest: TemplateRow | null;
  notes: string[];
}

function emptyBy(): Record<TagClass, number> {
  return { army: 0, veteran: 0, both: 0, untagged: 0 };
}

/** Sends grouped by template over the range, with replies/opt-outs/interest attributed to them. */
export type Channel = "sms" | "email";

export function templateStats(a: MessagingAnalysis, dedupedOptOuts: Reply[], dedupedInterests: Reply[], channel?: Channel): Map<string, TemplateRow> {
  const rows = new Map<string, TemplateRow>();
  const sendsIn = channel ? a.sends.filter((s) => s.channel === channel) : a.sends;
  const optOutsIn = channel ? dedupedOptOuts.filter((r) => r.channel === channel) : dedupedOptOuts;
  const interestsIn = channel ? dedupedInterests.filter((r) => r.channel === channel) : dedupedInterests;
  const get = (key: string): TemplateRow => {
    let r = rows.get(key);
    if (!r) {
      r = { key, label: templateLabel(key, a.sample.get(key) ?? null), sentBy: "none", workflow: key.startsWith("w:") || key.startsWith("m:") ? workflowFor(key) : null, sends: 0, sendsBy: emptyBy(), replies: 0, repliesBy: emptyBy(), optOuts: 0, interests: 0, replyRate: null, optOutRate: null, interestRate: null };
      rows.set(key, r);
    }
    return r;
  };
  const sentByOf = new Map<string, Set<string>>();
  for (const s of sendsIn) {
    const r = get(s.templateKey);
    r.sends += 1;
    r.sendsBy[s.cls] += 1;
    if (s.repliedAt) {
      r.replies += 1;
      r.repliesBy[s.cls] += 1;
    }
    const set = sentByOf.get(s.templateKey) ?? new Set<string>();
    set.add(s.source === "workflow" || s.source === "campaign" || s.source === "bulk_actions" ? "workflow" : "rep");
    sentByOf.set(s.templateKey, set);
  }
  for (const r of optOutsIn) get(r.templateKey).optOuts += 1;
  for (const r of interestsIn) get(r.templateKey).interests += 1;
  // Two templates can open with the same nine words; number the duplicates so rows and drilldowns stay distinct.
  const seenLabel = new Map<string, number>();
  for (const r of [...rows.values()].sort((x, y) => y.sends - x.sends || x.key.localeCompare(y.key))) {
    const c = (seenLabel.get(r.label) ?? 0) + 1;
    seenLabel.set(r.label, c);
    if (c > 1) r.label = `${r.label} (variant ${c})`;
  }
  for (const r of rows.values()) {
    const set = sentByOf.get(r.key);
    r.sentBy = r.key === UNATTRIBUTED_KEY ? "none" : !set || set.size === 0 ? "none" : set.size === 2 ? "mixed" : set.has("workflow") ? "workflow" : "rep";
    r.replyRate = r.sends > 0 ? r.replies / r.sends : null;
    r.optOutRate = r.sends > 0 ? r.optOuts / r.sends : null;
    r.interestRate = r.sends > 0 ? r.interests / r.sends : null;
  }
  return rows;
}

/** First matching inbound per contact in the range. */
export function dedupeByContact(list: Reply[]): Reply[] {
  const seen = new Set<string>();
  const out: Reply[] = [];
  for (const r of [...list].sort((x, y) => (x.at < y.at ? -1 : 1))) {
    const k = r.contactId ?? `conv:${r.conversationId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export function keywordCard(a: MessagingAnalysis, kind: "optout" | "interest"): KeywordResult {
  const matches = a.replies.filter((r) => (kind === "optout" ? r.optOut : r.interest));
  const deduped = dedupeByContact(matches);
  const optOuts = kind === "optout" ? deduped : dedupeByContact(a.replies.filter((r) => r.optOut));
  const interests = kind === "interest" ? deduped : dedupeByContact(a.replies.filter((r) => r.interest));
  const stats = templateStats(a, optOuts, interests);
  const byClass = emptyBy();
  for (const r of deduped) byClass[r.cls] += 1;
  const metric = (t: TemplateRow) => (kind === "optout" ? t.optOuts : t.interests);
  const ranked = [...stats.values()].filter((t) => metric(t) > 0).sort((x, y) => metric(y) - metric(x) || y.sends - x.sends);
  const { rows, rest } = capRows(ranked, KEYWORD_ROWS_MAX);
  const keywords = kind === "optout" ? a.cfg.optOutKeywords : a.cfg.interestKeywords;
  const what = kind === "optout" ? "opt-out" : "interest reply";
  return {
    kind,
    title: kind === "optout" ? "Opt-outs (STOP)" : "Interest Replies (Cyber / IT)",
    keywords,
    contacts: deduped.length,
    byClass,
    messages: matches.length,
    rows,
    rest,
    notes: [
      `${kind === "optout" ? "Opt-out" : "Interest reply"} — an inbound SMS or email in the selected range containing one of these words as a whole word: ${keywords.join(", ")} (config/conversations.json). Words written in capitals, like IT, must match in capitals; the others ignore case.`,
      "Contacts — each contact counts once, on their first matching message in the range; the message count before de-duplication is shown for reference.",
      "Army / Veteran / Both / No tag — from the contact's current tags.",
      `Template (best match) — the most recent outbound message in the same conversation before the ${what}, within ${a.cfg.replyWindowDays} days; sends are the messages of that template in the range; rate = ${what === "opt-out" ? "opt-outs" : "interest replies"} ÷ sends.`,
      workflowMappingNote(),
      `${kind === "optout" ? "Opt-out level" : "Interest level"} — the template's rate against the thresholds in config/conversations.json (${kind === "optout" ? "optOutRateLevels" : "interestRateLevels"}): High at or above ${(a.cfg[kind === "optout" ? "optOutRateLevels" : "interestRateLevels"].high * 100).toFixed(1)}%, Medium at or above ${(a.cfg[kind === "optout" ? "optOutRateLevels" : "interestRateLevels"].medium * 100).toFixed(1)}%, otherwise Low.`,
      "Drilldown — click a template row for the contacts and their messages.",
      "Limitation: templates are clusters of the first ten words of outbound text with names, numbers, and links removed (best match, not a GHL template id), and a reply is attributed to the last outbound before it even if the contact was answering something older.",
    ],
  };
}

export interface ReplyRateResult {
  channel: Channel;
  channelLabel: string;
  rows: TemplateRow[];
  rest: TemplateRow | null;
  templateCount: number;
  totals: { sends: number; replies: number; optOuts: number; interests: number };
  notes: string[];
}

export function replyRateCard(a: MessagingAnalysis, channel: Channel): ReplyRateResult {
  const optOuts = dedupeByContact(a.replies.filter((r) => r.optOut));
  const interests = dedupeByContact(a.replies.filter((r) => r.interest));
  const stats = templateStats(a, optOuts, interests, channel);
  const word = channel === "email" ? "emails" : "SMS messages";
  for (const t of stats.values()) {
    if (t.key === MANUAL_KEY) t.label = `Manual ${word} (typed by a rep)`;
    if (t.key === NOTEXT_KEY) t.label = channel === "email" ? "No text (media or attachment only)" : "No text (MMS media only)";
  }
  const ranked = [...stats.values()].filter((t) => t.sends > 0).sort((x, y) => y.sends - x.sends);
  const { rows, rest } = capRows(ranked, REPLY_ROWS_MAX);
  const totals = ranked.reduce((t, r) => ({ sends: t.sends + r.sends, replies: t.replies + r.replies, optOuts: t.optOuts + r.optOuts, interests: t.interests + r.interests }), { sends: 0, replies: 0, optOuts: 0, interests: 0 });
  return {
    channel,
    channelLabel: channel === "email" ? "Email" : "SMS",
    rows,
    rest,
    templateCount: ranked.length,
    totals,
    notes: [
      `Channel — this card covers outbound ${channel === "email" ? "emails" : "SMS messages"} only; the other channel has its own card.`,
      `Rows — the ${REPLY_ROWS_MAX} templates with the most sends; the rest are summed into one row.`,
      "Sends — outbound SMS and email messages in the selected range, grouped into templates by their opening words (best match); one-off messages typed by a rep are grouped as manual messages; messages with no text as media only.",
      `Reply — the first inbound message from the contact after the send, within ${a.cfg.replyWindowDays} days and before the next outbound; reply rate = replies ÷ sends.`,
      "Opt-out rate and interest rate — opt-outs (or interest replies) attributed to the template ÷ its sends, each contact counted once.",
      "Army / Veteran — sends and reply rate split by the contact's current tags (Both and No tag are in the totals only).",
      workflowMappingNote(),
      "Manual messages — texts typed by a rep, grouped on one row; they belong to no workflow.",
      "Limitation: a template is the first ten normalized words of the text, so two workflows that open the same way share a row, and personalized openings can split one template into several rows.",
    ],
  };
}

export interface ChannelRow {
  channel: string;
  inbound: number;
  share: number;
}

export interface InboundChannelResult {
  rows: ChannelRow[];
  total: number;
  afterHours: { count: number; share: number; medianBusinessMinutes: number | null; medianClockMinutes: number | null; replied: number };
  businessHours: { count: number; medianBusinessMinutes: number | null; replied: number };
  windowLabel: string;
  notes: string[];
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function inboundChannelCard(a: MessagingAnalysis): InboundChannelResult {
  const counts = new Map<string, number>();
  for (const r of a.replies) counts.set(r.channel, (counts.get(r.channel) ?? 0) + 1);
  const sms = counts.get("sms") ?? 0;
  const email = counts.get("email") ?? 0;
  const other = [...counts.entries()].filter(([k]) => k !== "sms" && k !== "email").reduce((s, [, v]) => s + v, 0);
  const total = sms + email + a.inboundCalls + other;
  const rows: ChannelRow[] = [
    { channel: "SMS", inbound: sms, share: total ? sms / total : 0 },
    { channel: "Email", inbound: email, share: total ? email / total : 0 },
    { channel: "Call", inbound: a.inboundCalls, share: total ? a.inboundCalls / total : 0 },
    { channel: "Other", inbound: other, share: total ? other / total : 0 },
  ];
  const after = a.replies.filter((r) => r.afterHours);
  const during = a.replies.filter((r) => !r.afterHours);
  const afterReplied = after.filter((r) => r.replyBusinessMinutes !== null);
  const duringReplied = during.filter((r) => r.replyBusinessMinutes !== null);
  return {
    rows,
    total,
    afterHours: {
      count: after.length,
      share: a.replies.length ? after.length / a.replies.length : 0,
      medianBusinessMinutes: median(afterReplied.map((r) => r.replyBusinessMinutes as number)),
      medianClockMinutes: median(afterReplied.map((r) => r.replyClockMinutes as number)),
      replied: afterReplied.length,
    },
    businessHours: { count: during.length, medianBusinessMinutes: median(duringReplied.map((r) => r.replyBusinessMinutes as number)), replied: duringReplied.length },
    windowLabel: businessWindowLabel(a.cfg),
    notes: [
      "Inbound — inbound SMS and email messages in the selected range (every message, not de-duplicated), plus inbound human calls (one per call id) from the call records.",
      "Share — that channel's inbound ÷ all inbound.",
      `After hours — inbound SMS/email that arrived outside ${businessWindowLabel(a.cfg)}.`,
      `Time to first reply — from the inbound message to the next human outbound in the same conversation within ${a.cfg.replyWindowDays} days; business time counts only window minutes (so an evening text answered at opening shows a few minutes), clock time is wall-clock.`,
      "Limitation: Other covers channels this dashboard does not sync (for example WhatsApp or web chat), so it is 0 unless those are added.",
    ],
  };
}

// ---------------- drilldowns ----------------

const SENT_BY_LABEL: Record<Reply["sentBy"], string> = { workflow: "Workflow", rep: "Rep", none: "—" };

/** Contacts behind a keyword card (`which` = optout | interest | reply) for one template key or "all". */
export function keywordDrilldown(range: DateRange, which: "optout" | "interest" | "reply", template: string): DrillResult {
  const a = analyzeMessaging(range);
  const names = userNames();
  const labels = templateStats(a, dedupeByContact(a.replies.filter((r) => r.optOut)), dedupeByContact(a.replies.filter((r) => r.interest)));
  const labelOf = (key: string) => labels.get(key)?.label ?? templateLabel(key, a.sample.get(key) ?? null);
  let list: Reply[];
  if (which === "reply") {
    // every attributed reply to the template's sends (first inbound per send), one row per send that got a reply
    const replied = a.sends.filter((s) => s.repliedAt && (template === "all" || s.templateKey === template));
    const byConv = new Map<string, Reply[]>();
    for (const r of a.replies) byConv.set(r.conversationId, [...(byConv.get(r.conversationId) ?? []), r]);
    list = replied
      .map((s) => (byConv.get(s.conversationId) ?? []).find((r) => r.at === s.repliedAt))
      .filter((r): r is Reply => Boolean(r))
      .map((r) => ({ ...r, templateKey: template === "all" ? r.templateKey : template }));
  } else {
    list = dedupeByContact(a.replies.filter((r) => (which === "optout" ? r.optOut : r.interest))).filter((r) => template === "all" || r.templateKey === template);
  }
  const contactIds = [...new Set(list.map((r) => r.contactId).filter((x): x is string => Boolean(x)))];
  const contactName = new Map<string, string | null>();
  for (let i = 0; i < contactIds.length; i += 500) {
    const chunk = contactIds.slice(i, i + 500);
    for (const c of getDb().prepare(`SELECT id, name FROM contacts WHERE id IN (${chunk.map(() => "?").join(",")})`).all(...chunk) as unknown as { id: string; name: string | null }[]) contactName.set(c.id, c.name);
  }
  const rows: DrillRow[] = list
    .map((r) => ({
      contactId: r.contactId,
      opportunityId: r.id,
      name: r.contactId ? (contactName.get(r.contactId) ?? null) : null,
      ghlUrl: r.contactId ? contactUrl(r.contactId) : null,
      source: null,
      assignedUser: r.senderUserId ? (names.get(r.senderUserId) ?? r.senderUserId) : null,
      pipeline: null,
      status: null,
      phone: null,
      email: null,
      value: null,
      stage: null,
      stageReached: which,
      milestoneKey: which,
      tags: [],
      createdOn: null,
      reachedOn: r.at,
      channel: r.channel === "sms" ? "SMS" : r.channel === "email" ? "Email" : r.channel,
      preview: r.body ? r.body.replace(/\s+/g, " ").trim().slice(0, 140) : null,
      tagClass: TAG_CLASS_LABEL[r.cls],
      template: labelOf(r.templateKey),
      sentBy: SENT_BY_LABEL[r.sentBy],
      repliedAt: r.sentAt,
    }))
    .sort((x, y) => (x.reachedOn < y.reachedOn ? 1 : -1));
  const label = template === "all" ? "all templates" : labelOf(template);
  const title = which === "optout" ? `Opt-outs · ${label}` : which === "interest" ? `Interest replies · ${label}` : `Replies · ${label}`;
  return { ok: true, title, rows, count: rows.length, detailsNote: null, fetchedAt: new Date().toISOString() };
}


export type RateLevel = "high" | "medium" | "low";

/** High / medium / low against the configured thresholds (null when there is no rate). */
export function rateLevel(rate: number | null, levels: { high: number; medium: number }): RateLevel | null {
  if (rate === null) return null;
  if (rate >= levels.high) return "high";
  if (rate >= levels.medium) return "medium";
  return "low";
}

/** One sentence for How this is counted about the workflow mapping's coverage. */
export function workflowMappingNote(): string {
  const m = mappingCount();
  return `Workflow — from config/workflow-templates.json, where each template's opening words are paired with the workflow that sends it (${m.named} of ${m.total} entries have a name so far); GHL does not record the workflow on a message, so unmapped templates say "not mapped" until the file is filled in.`;
}

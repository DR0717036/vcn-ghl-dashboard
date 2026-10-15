// Conversations section (owner decision 2026-10-15), stage 1: stale
// conversations by rep (a snapshot) and response time by rep (selected
// range). Reads the local cache only; the cache is filled by two read-only
// sync phases (messages export and a filtered conversation search).
//
// Message bodies are personal data: the main cards never return them; only
// the drilldown functions include a short preview.

import raw from "../../config/conversations.json";
import { getDb } from "@/lib/db";
import { addDays, nyDate, nyParts, startOfDay, type DateRange } from "@/lib/dates";
import { contactUrl, type DrillResult, type DrillRow } from "@/lib/drilldown";
import { getState } from "@/lib/db";
import { userNames } from "@/lib/milestones";
import { repRoster } from "@/lib/reps";

export interface ConversationsConfig {
  staleAfterMinutes: number;
  businessHours: { days: number[]; startHour: number; endHour: number };
  withinMinutes: number;
  responseLevels: { greenUnderMinutes: number; yellowUnderMinutes: number };
  replyWindowDays: number;
  emailStatus: { lookbackDays: number; refreshHours: number; maxPerRun: number };
  optOutKeywords: string[];
  interestKeywords: string[];
  optOutRateLevels: { high: number; medium: number };
  interestRateLevels: { high: number; medium: number };
}

export function conversationsConfig(): ConversationsConfig {
  const c = raw as Partial<ConversationsConfig>;
  const int = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
  const bh = c.businessHours ?? { days: [1, 2, 3, 4, 5, 6], startHour: 7, endHour: 20 };
  return {
    staleAfterMinutes: int(c.staleAfterMinutes, 60),
    businessHours: { days: Array.isArray(bh.days) ? bh.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [1, 2, 3, 4, 5, 6], startHour: int(bh.startHour, 7), endHour: int(bh.endHour, 20) },
    withinMinutes: int(c.withinMinutes, 60),
    responseLevels: { greenUnderMinutes: int(c.responseLevels?.greenUnderMinutes, 15), yellowUnderMinutes: int(c.responseLevels?.yellowUnderMinutes, 60) },
    replyWindowDays: int(c.replyWindowDays, 7),
    emailStatus: { lookbackDays: int(c.emailStatus?.lookbackDays, 14), refreshHours: int(c.emailStatus?.refreshHours, 6), maxPerRun: int(c.emailStatus?.maxPerRun, 2500) },
    optOutKeywords: Array.isArray(c.optOutKeywords) ? c.optOutKeywords : ["stop"],
    interestKeywords: Array.isArray(c.interestKeywords) ? c.interestKeywords : ["cyber", "it"],
    optOutRateLevels: { high: int(c.optOutRateLevels?.high, 0.025), medium: int(c.optOutRateLevels?.medium, 0.01) },
    interestRateLevels: { high: int(c.interestRateLevels?.high, 0.02), medium: int(c.interestRateLevels?.medium, 0.01) },
  };
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 || h === 24 ? "AM" : "PM"}`;

/** "Mon–Sat 7 AM–8 PM" */
export function businessWindowLabel(cfg = conversationsConfig()): string {
  const d = [...cfg.businessHours.days].sort();
  const days = d.length === 0 ? "no days" : d.length === 7 ? "every day" : d.every((x, i) => i === 0 || x === d[i - 1] + 1) ? `${DAY_NAMES[d[0]]}–${DAY_NAMES[d[d.length - 1]]}` : d.map((x) => DAY_NAMES[x]).join(", ");
  return `${days} ${hourLabel(cfg.businessHours.startHour)}–${hourLabel(cfg.businessHours.endHour)} New York`;
}

/** Minutes between two instants that fall inside the business window (America/New_York). */
export function businessMinutesBetween(a: Date, b: Date, cfg = conversationsConfig()): number {
  if (b.getTime() <= a.getTime()) return 0;
  const { days, startHour, endHour } = cfg.businessHours;
  let total = 0;
  let cur = startOfDay(a);
  const endT = b.getTime();
  for (let i = 0; i < 400 && cur.getTime() < endT; i++) {
    const p = nyParts(cur);
    if (days.includes(p.wd)) {
      const open = nyDate(p.y, p.m, p.d, startHour).getTime();
      const close = nyDate(p.y, p.m, p.d, endHour).getTime();
      const s = Math.max(open, a.getTime());
      const e = Math.min(close, endT);
      if (e > s) total += (e - s) / 60000;
    }
    cur = addDays(cur, 1);
  }
  return total;
}

export function fmtWait(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function channelLabel(messageType: string | null | undefined): string {
  const t = (messageType ?? "").toUpperCase();
  if (t.includes("SMS")) return "SMS";
  if (t.includes("EMAIL")) return "Email";
  if (t.includes("CALL")) return "Call";
  if (t.includes("WHATSAPP")) return "WhatsApp";
  if (t.includes("FACEBOOK") || t.includes("FB")) return "Facebook";
  if (t.includes("INSTAGRAM") || t.includes("IG")) return "Instagram";
  if (t.includes("LIVE_CHAT") || t.includes("WEBCHAT")) return "Web chat";
  return t ? t.replace(/^TYPE_/, "").toLowerCase() : "other";
}

// ---------------- stale conversations (snapshot) ----------------

interface ConvRow {
  id: string;
  contact_id: string | null;
  assigned_to: string | null;
  unread_count: number;
  last_message_direction: string | null;
  last_message_date: string | null;
  last_message_type: string | null;
  last_message_body: string | null;
}

export interface StaleRow {
  userId: string | null;
  name: string;
  isRep: boolean;
  conversations: number;
  unread: number;
  /** Minutes the oldest stale conversation has been waiting (null when none). */
  oldestMinutes: number | null;
}

export interface StaleResult {
  rows: StaleRow[];
  unassigned: StaleRow;
  others: StaleRow | null;
  total: { conversations: number; unread: number; oldestMinutes: number | null };
  snapshotAt: string | null;
  staleAfterMinutes: number;
  /** All unread inbound-last conversations, before the age filter. */
  unreadInboundTotal: number;
  notes: string[];
}

function staleCandidates(now: Date, cfg: ConversationsConfig): ConvRow[] {
  const cutoff = new Date(now.getTime() - cfg.staleAfterMinutes * 60000).toISOString();
  return getDb()
    .prepare(
      `SELECT id, contact_id, assigned_to, unread_count, last_message_direction, last_message_date, last_message_type, last_message_body
         FROM conversations
        WHERE last_message_direction = 'inbound' AND unread_count > 0 AND last_message_date IS NOT NULL AND last_message_date <= ?
        ORDER BY last_message_date ASC`,
    )
    .all(cutoff) as unknown as ConvRow[];
}

export function computeStale(now: Date): StaleResult {
  const cfg = conversationsConfig();
  const roster = repRoster();
  const names = userNames();
  const snapshotAt = getState("conversations_snapshot_at") ?? null;
  const all = staleCandidates(now, cfg);
  const unreadInboundTotal = (getDb().prepare(`SELECT COUNT(*) AS c FROM conversations WHERE last_message_direction = 'inbound' AND unread_count > 0`).get() as { c: number }).c;

  const bucketOf = (u: string | null) => (u ? (roster.byUserId.has(u) ? u : `other:${u}`) : "__unassigned");
  const acc = new Map<string, { conversations: number; unread: number; oldest: number | null }>();
  const add = (key: string, c: ConvRow) => {
    const cur = acc.get(key) ?? { conversations: 0, unread: 0, oldest: null };
    cur.conversations += 1;
    cur.unread += c.unread_count;
    const wait = (now.getTime() - Date.parse(c.last_message_date!)) / 60000;
    cur.oldest = cur.oldest === null ? wait : Math.max(cur.oldest, wait);
    acc.set(key, cur);
  };
  for (const c of all) add(bucketOf(c.assigned_to), c);

  const mk = (userId: string | null, name: string, isRep: boolean, keys: string[]): StaleRow => {
    let conversations = 0;
    let unread = 0;
    let oldest: number | null = null;
    for (const k of keys) {
      const a = acc.get(k);
      if (!a) continue;
      conversations += a.conversations;
      unread += a.unread;
      oldest = oldest === null ? a.oldest : a.oldest === null ? oldest : Math.max(oldest, a.oldest);
    }
    return { userId, name, isRep, conversations, unread, oldestMinutes: oldest };
  };
  const rows = [...roster.byUserId.entries()].map(([id, rep]) => mk(id, rep.name, true, [id])).sort((a, b) => b.conversations - a.conversations || b.unread - a.unread || a.name.localeCompare(b.name));
  const unassigned = mk(null, "Unassigned", false, ["__unassigned"]);
  const otherKeys = [...acc.keys()].filter((k) => k.startsWith("other:"));
  const otherNames = otherKeys.map((k) => names.get(k.slice(6)) ?? k.slice(6)).sort();
  const others = otherKeys.length > 0 ? mk(null, `Other users, not sales reps (${otherNames.join(", ")})`, false, otherKeys) : null;
  const total = mk(null, "Team total", false, [...acc.keys()]);

  return {
    rows,
    unassigned,
    others,
    total: { conversations: total.conversations, unread: total.unread, oldestMinutes: total.oldestMinutes },
    snapshotAt,
    staleAfterMinutes: cfg.staleAfterMinutes,
    unreadInboundTotal,
    notes: [
      `Stale conversation — a conversation whose last message is inbound, is unread, and is older than ${cfg.staleAfterMinutes} minutes at the last sync (config/conversations.json, staleAfterMinutes).`,
      "Snapshot — this card reflects the inbox as of the last sync and ignores the date range; the sync re-reads every unread, inbound-last conversation from GHL each time.",
      "Stale unread messages — the sum of GHL's unread count over those conversations.",
      "Oldest waiting — how long the oldest stale conversation has waited since its last inbound message.",
      "Rep — the conversation's assigned user in GHL; conversations with no assignee are the Unassigned row; assignees who are not sales reps are grouped as other users. The team total covers all three.",
      "Drilldown — click a row for the contacts, channel, last inbound message, and waiting time.",
      "Limitation: GHL marks a conversation read when anyone opens it, so a stale conversation may have been seen without a reply; and an inbound call or voicemail counts as an inbound message too.",
    ],
  };
}

/** Stale conversations for one row: a rep's user id, "unassigned", or "others". */
export function staleDrilldown(user: string, now: Date): DrillResult {
  const cfg = conversationsConfig();
  const roster = repRoster();
  const names = userNames();
  const owned = (u: string | null) => (user === "unassigned" ? !u : user === "others" ? Boolean(u) && !roster.byUserId.has(u!) : u === user);
  const list = staleCandidates(now, cfg).filter((c) => owned(c.assigned_to));
  const contactIds = [...new Set(list.map((c) => c.contact_id).filter((x): x is string => Boolean(x)))];
  const contactName = new Map<string, string | null>();
  if (contactIds.length > 0) {
    const marks = contactIds.map(() => "?").join(",");
    for (const c of getDb().prepare(`SELECT id, name FROM contacts WHERE id IN (${marks})`).all(...contactIds) as unknown as { id: string; name: string | null }[]) contactName.set(c.id, c.name);
  }
  const rows: DrillRow[] = list.map((c) => ({
    contactId: c.contact_id,
    opportunityId: c.id,
    name: c.contact_id ? (contactName.get(c.contact_id) ?? null) : null,
    ghlUrl: c.contact_id ? contactUrl(c.contact_id) : null,
    source: null,
    assignedUser: c.assigned_to ? (names.get(c.assigned_to) ?? c.assigned_to) : null,
    pipeline: null,
    status: null,
    phone: null,
    email: null,
    value: null,
    stage: null,
    stageReached: "stale",
    milestoneKey: "stale",
    tags: [],
    createdOn: null,
    reachedOn: c.last_message_date ?? "",
    channel: channelLabel(c.last_message_type),
    preview: c.last_message_body ? c.last_message_body.replace(/\s+/g, " ").trim().slice(0, 140) : null,
    waitingMinutes: c.last_message_date ? (now.getTime() - Date.parse(c.last_message_date)) / 60000 : null,
    unread: c.unread_count,
  }));
  const title = user === "unassigned" ? "Unassigned" : user === "others" ? "Other users, not sales reps" : (roster.byUserId.get(user)?.name ?? names.get(user) ?? user);
  return { ok: true, title, rows, count: rows.length, detailsNote: null, fetchedAt: new Date().toISOString() };
}

// ---------------- response time by rep (selected range) ----------------

interface MsgRow {
  id: string;
  conversation_id: string;
  contact_id: string | null;
  direction: string;
  channel: string;
  date_added: string;
  user_id: string | null;
  source: string | null;
  body: string | null;
}

export interface Episode {
  conversationId: string;
  contactId: string | null;
  channel: string;
  inboundAt: string;
  inboundCount: number;
  /** The rep this episode belongs to: the replying user, else the user of the last outbound before it. */
  userId: string | null;
  repliedAt: string | null;
  replyUserId: string | null;
  businessMinutes: number | null;
  preview: string | null;
}

/** Inbound "episodes" that started inside the range: consecutive inbound messages up to the next human outbound reply. */
export function responseEpisodes(range: DateRange): Episode[] {
  const cfg = conversationsConfig();
  const db = getDb();
  const start = range.start.toISOString();
  const end = range.end.toISOString();
  const convIds = (db.prepare(`SELECT DISTINCT conversation_id FROM messages WHERE direction = 'inbound' AND date_added >= ? AND date_added < ?`).all(start, end) as { conversation_id: string }[]).map((r) => r.conversation_id);
  if (convIds.length === 0) return [];
  const lookback = new Date(range.start.getTime() - 14 * 86400000).toISOString();
  const horizon = new Date(Math.min(range.asOf.getTime(), range.end.getTime() + cfg.replyWindowDays * 86400000)).toISOString();
  const out: Episode[] = [];
  const sel = db.prepare(`SELECT id, conversation_id, contact_id, direction, channel, date_added, user_id, source, body FROM messages WHERE conversation_id = ? AND date_added >= ? AND date_added < ? ORDER BY date_added ASC, id ASC`);
  for (const cid of convIds) {
    const msgs = sel.all(cid, lookback, horizon) as unknown as MsgRow[];
    let lastOutboundUser: string | null = null;
    let open: Episode | null = null;
    for (const m of msgs) {
      if (m.direction === "inbound") {
        if (!open) {
          open = { conversationId: cid, contactId: m.contact_id, channel: m.channel, inboundAt: m.date_added, inboundCount: 1, userId: lastOutboundUser, repliedAt: null, replyUserId: null, businessMinutes: null, preview: m.body ? m.body.replace(/\s+/g, " ").trim().slice(0, 140) : null };
        } else open.inboundCount += 1;
      } else {
        const human = m.source !== "workflow" && m.source !== "campaign" && m.source !== "bulk_actions";
        if (m.user_id) lastOutboundUser = m.user_id;
        if (open && human) {
          const within = Date.parse(m.date_added) - Date.parse(open.inboundAt) <= cfg.replyWindowDays * 86400000;
          if (within) {
            open.repliedAt = m.date_added;
            open.replyUserId = m.user_id;
            open.userId = m.user_id ?? open.userId;
            open.businessMinutes = businessMinutesBetween(new Date(open.inboundAt), new Date(m.date_added), cfg);
          }
          if (open.inboundAt >= start && open.inboundAt < end) out.push(open);
          open = null;
        }
      }
    }
    if (open && open.inboundAt >= start && open.inboundAt < end) out.push(open);
  }
  return out;
}

export interface ResponseRow {
  userId: string | null;
  name: string;
  isRep: boolean;
  episodes: number;
  replied: number;
  medianMinutes: number | null;
  avgMinutes: number | null;
  withinPct: number | null;
  withinCount: number;
}

export interface ResponseResult {
  rows: ResponseRow[];
  unassigned: ResponseRow;
  others: ResponseRow | null;
  total: ResponseRow;
  windowLabel: string;
  withinMinutes: number;
  responseLevels: { greenUnderMinutes: number; yellowUnderMinutes: number };
  replyWindowDays: number;
  notes: string[];
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function computeResponseTimes(range: DateRange): ResponseResult {
  const cfg = conversationsConfig();
  const roster = repRoster();
  const names = userNames();
  const episodes = responseEpisodes(range);
  const bucketOf = (u: string | null) => (u ? (roster.byUserId.has(u) ? u : `other:${u}`) : "__unassigned");
  const by = new Map<string, Episode[]>();
  for (const e of episodes) by.set(bucketOf(e.userId), [...(by.get(bucketOf(e.userId)) ?? []), e]);
  const mk = (userId: string | null, name: string, isRep: boolean, keys: string[]): ResponseRow => {
    const eps = keys.flatMap((k) => by.get(k) ?? []);
    const replied = eps.filter((e) => e.businessMinutes !== null);
    const mins = replied.map((e) => e.businessMinutes as number);
    const withinCount = replied.filter((e) => (e.businessMinutes as number) <= cfg.withinMinutes).length;
    return {
      userId,
      name,
      isRep,
      episodes: eps.length,
      replied: replied.length,
      medianMinutes: median(mins),
      avgMinutes: mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : null,
      withinPct: eps.length ? withinCount / eps.length : null,
      withinCount,
    };
  };
  const rows = [...roster.byUserId.entries()]
    .map(([id, rep]) => mk(id, rep.name, true, [id]))
    .sort((a, b) => (a.medianMinutes ?? Infinity) - (b.medianMinutes ?? Infinity) || b.episodes - a.episodes || a.name.localeCompare(b.name));
  const otherKeys = [...by.keys()].filter((k) => k.startsWith("other:"));
  const otherNames = otherKeys.map((k) => names.get(k.slice(6)) ?? k.slice(6)).sort();
  return {
    rows,
    unassigned: mk(null, "Unassigned (no rep on the thread)", false, ["__unassigned"]),
    others: otherKeys.length > 0 ? mk(null, `Other users, not sales reps (${otherNames.join(", ")})`, false, otherKeys) : null,
    total: mk(null, "Team total", false, [...by.keys()]),
    windowLabel: businessWindowLabel(cfg),
    withinMinutes: cfg.withinMinutes,
    responseLevels: cfg.responseLevels,
    replyWindowDays: cfg.replyWindowDays,
    notes: [
      "Inbound episode — a run of one or more inbound SMS or email messages in a conversation, from the first one until the next human outbound reply; each episode counts once, timed from its first inbound message.",
      `Reply — the next outbound SMS or email in the same conversation sent by a person (GHL source app), within ${cfg.replyWindowDays} days; workflow and campaign sends do not count as replies.`,
      `Business hours — only minutes inside ${businessWindowLabel(cfg)} count (config/conversations.json); an inbound message outside the window starts the clock at the next opening.`,
      "Median and average — over replied episodes only.",
      `Replied within ${cfg.withinMinutes}m — replied episodes within ${cfg.withinMinutes} business minutes ÷ all episodes, so unanswered inbound messages count against the rate.`,
      "Rep — the user who sent the reply; for an unanswered episode, the user who sent the last outbound message before it; otherwise the episode is Unassigned.",
      "Sort — fastest median first.",
      "Limitation: inbound calls are not messages here (see Rep Call Activity), and a reply sent from a personal phone outside GHL is invisible to this dashboard.",
    ],
  };
}

/** Episodes for one rep ("unassigned" / "others" allowed), with a short inbound preview. */
export function responseDrilldown(user: string, range: DateRange): DrillResult {
  const cfg = conversationsConfig();
  const roster = repRoster();
  const names = userNames();
  const owned = (u: string | null) => (user === "unassigned" ? !u : user === "others" ? Boolean(u) && !roster.byUserId.has(u!) : u === user);
  const eps = responseEpisodes(range).filter((e) => owned(e.userId));
  const contactIds = [...new Set(eps.map((e) => e.contactId).filter((x): x is string => Boolean(x)))];
  const contactName = new Map<string, string | null>();
  if (contactIds.length > 0) {
    const marks = contactIds.map(() => "?").join(",");
    for (const c of getDb().prepare(`SELECT id, name FROM contacts WHERE id IN (${marks})`).all(...contactIds) as unknown as { id: string; name: string | null }[]) contactName.set(c.id, c.name);
  }
  const rows: DrillRow[] = eps
    .map((e) => ({
      contactId: e.contactId,
      opportunityId: `${e.conversationId}:${e.inboundAt}`,
      name: e.contactId ? (contactName.get(e.contactId) ?? null) : null,
      ghlUrl: e.contactId ? contactUrl(e.contactId) : null,
      source: null,
      assignedUser: e.replyUserId ? (names.get(e.replyUserId) ?? e.replyUserId) : null,
      pipeline: null,
      status: null,
      phone: null,
      email: null,
      value: null,
      stage: null,
      stageReached: "response",
      milestoneKey: "response",
      tags: [],
      createdOn: null,
      reachedOn: e.inboundAt,
      channel: e.channel === "sms" ? "SMS" : e.channel === "email" ? "Email" : e.channel,
      preview: e.preview,
      repliedAt: e.repliedAt,
      responseMinutes: e.businessMinutes,
      withinTarget: e.businessMinutes === null ? null : e.businessMinutes <= cfg.withinMinutes,
      unread: e.inboundCount,
    }))
    .sort((a, b) => (a.reachedOn < b.reachedOn ? 1 : -1));
  const title = user === "unassigned" ? "Unassigned (no rep on the thread)" : user === "others" ? "Other users, not sales reps" : (roster.byUserId.get(user)?.name ?? names.get(user) ?? user);
  return { ok: true, title, rows, count: rows.length, detailsNote: null, fetchedAt: new Date().toISOString() };
}

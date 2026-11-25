// Reconciliation between the admin Program Submissions table and the rep
// dashboard (owner request 2026-11-25). For one date range it takes, per
// rep on the roster, the admin row exactly as SubmissionsCard renders it
// (computeSubmissions + computeCommission) and every figure the rep's own
// pages render for the same range (My submissions; for this month also My
// overview, My pace, and the weekly bounty standing), and lists every
// difference. Served by /api/admin/reconcile and asserted by
// tests/reconcile.test.mjs, which fails when any figure differs. Reads the
// cache only; nothing here touches GHL.

import { computeBountyBoard, standingOf } from "@/lib/bounties";
import { computeCommission } from "@/lib/commission";
import { resolveRange, type RangeKey } from "@/lib/dates";
import { defaultSemester, semesters } from "@/lib/mapping-config";
import { computeRepOverview } from "@/lib/me/overview";
import { computeRepPace } from "@/lib/me/pace";
import { computeMySubmissions } from "@/lib/me/submissions";
import { coverage } from "@/lib/metrics";
import { activeReps } from "@/lib/reps";
import { computeSubmissions } from "@/lib/submissions";

export const RECONCILE_RANGES = ["today", "this_week", "this_month", "last_month"] as const satisfies readonly RangeKey[];
export type ReconcileRange = (typeof RECONCILE_RANGES)[number];

export interface SideFigures {
  /** Combined submissions (CA 101 + IAU App, every semester). */
  combined: number | null;
  /** CA 101 submitted. */
  army: number | null;
  /** IAU App Submitted, every semester. */
  veteran: number | null;
  /** Est. commission on the events inside the range (null = no plan). */
  commission: number | null;
}

export interface ReconcileRow {
  userId: string;
  name: string;
  /** The admin Program Submissions row for the rep, plus the rank among the roster by Combined and the month-to-date figures the table also shows. */
  admin: SideFigures & { rank: number; submissionsMtd: number; commissionMtd: number | null };
  /** What the rep's own pages show for the same range; `sources` names every figure that was compared. */
  rep: SideFigures & { sources: Record<string, number | null> };
  /** Human-readable differences; empty when every figure agrees. */
  diffs: string[];
}

export interface ReconcileReport {
  range: ReconcileRange;
  label: string;
  /** Last successful core sync (ISO), so a report can be tied to the data it saw. */
  asOf: string | null;
  rows: ReconcileRow[];
  allMatch: boolean;
}

const sumOrNull = (vals: (number | null)[]): number | null => (vals.every((v) => v === null) ? null : vals.reduce<number>((s, v) => s + (v ?? 0), 0));
const show = (v: number | null) => (v === null ? "—" : String(v));

export function reconcile(key: ReconcileRange, now: Date = new Date()): ReconcileReport {
  const range = resolveRange(key, now);
  const sel = defaultSemester();
  // The admin side: the same calls the admin page makes for its Program Submissions table.
  const subs = computeSubmissions(range, sel);
  const commission = computeCommission(range, now);
  const roster = activeReps(range);
  const rosterIds = new Set(roster.map((r) => r.userId));
  const rankOf = (userId: string): number => {
    const rows = subs.rows.filter((r) => r.userId && rosterIds.has(r.userId));
    const mine = rows.find((r) => r.userId === userId);
    return mine ? 1 + rows.filter((r) => r.total > mine.total).length : 0;
  };
  const isMonth = key === "this_month";
  const isWeek = key === "this_week";
  const board = isWeek ? computeBountyBoard(now) : null;

  const rows: ReconcileRow[] = roster.map((rep) => {
    const row = subs.rows.find((r) => r.userId === rep.userId);
    const c = commission.reps[rep.userId];
    const unavailable = subs.value === null;
    const admin = {
      combined: unavailable ? null : (row?.total ?? 0),
      army: unavailable ? null : (row?.ca101 ?? 0),
      veteran: unavailable ? null : (row?.iauAll ?? 0),
      commission: c?.commission.amount ?? null,
      rank: rankOf(rep.userId),
      submissionsMtd: c?.submissionsMtd ?? 0,
      commissionMtd: c?.commissionMtd.amount ?? null,
    };

    // The rep side: the same calls /me makes, once per semester so every IAU card is covered.
    const bySem = semesters().map((s) => ({ s, ms: computeMySubmissions(rep, range, s) }));
    const first = bySem.find((x) => x.s.key === sel.key)?.ms ?? bySem[0].ms;
    const combined = first.combined.total;
    const army = first.army.ca101.achieved;
    const veteran = bySem.every((x) => x.ms.veteran.submitted.achieved === null) ? null : bySem.reduce((s, x) => s + (x.ms.veteran.submitted.achieved ?? 0), 0);
    // The line under Combined submissions (the admin cell, same call), and the six cards plus the other-stage wons, which must add up to it.
    const repCommission = first.commission.amount;
    const cardSum = sumOrNull([
      first.army.ca101.commission?.amount ?? null,
      first.army.won.commission?.amount ?? null,
      ...bySem.map((x) => x.ms.veteran.submitted.commission?.amount ?? null),
      ...bySem.map((x) => x.ms.veteran.won.commission?.amount ?? null),
    ]);
    const cardsPlusOther = cardSum === null ? (first.commission.otherWon.count > 0 ? first.commission.otherWon.amount : null) : cardSum + first.commission.otherWon.amount;
    const sources: Record<string, number | null> = {
      "My submissions · Combined submissions": combined,
      "My submissions · Army CA 101 card": army,
      "My submissions · IAU App cards, every semester": veteran,
      "My submissions · est. commission line": repCommission,
      "My submissions · cards + other-stage wons": cardsPlusOther,
    };
    const diffs: string[] = [];
    const cmp = (what: string, a: number | null, b: number | null) => {
      if (a !== b) diffs.push(`${what}: admin ${show(a)} · rep ${show(b)}`);
    };
    cmp("combined", admin.combined, combined);
    cmp("army (CA 101)", admin.army, army);
    cmp("veteran (IAU App, every semester)", admin.veteran, veteran);
    cmp("commission (selected range)", admin.commission, repCommission);
    cmp("commission cards add up", admin.commission === null ? null : admin.commission, admin.commission === null ? null : (cardsPlusOther ?? 0));

    if (isMonth) {
      const ov = computeRepOverview(rep, now);
      const pace = computeRepPace(rep, now);
      sources["My overview · Army tile"] = ov.momentum.split.army;
      sources["My overview · Veteran tile"] = ov.momentum.split.veteran;
      sources["My overview · Next milestone count"] = ov.milestone.mtd;
      sources["My overview · rank"] = ov.rank.rank;
      sources["My overview · rank submissions"] = ov.rank.mtd;
      sources["My overview · commission this month"] = ov.commission.amount;
      sources["My pace · month to date"] = pace.mtd;
      sources["My pace · commission this month"] = pace.commissionMtd.amount;
      cmp("My overview Army tile", admin.army, ov.momentum.split.army);
      cmp("My overview Veteran tile", admin.veteran, ov.momentum.split.veteran);
      cmp("My overview Next milestone count", admin.combined, ov.milestone.mtd);
      cmp("My overview rank", admin.rank, ov.rank.rank);
      cmp("My overview rank submissions", admin.combined, ov.rank.mtd);
      cmp("My overview commission this month", admin.commissionMtd, ov.commission.amount);
      cmp("My pace month to date", admin.combined, pace.mtd);
      cmp("My pace commission this month", admin.commissionMtd, pace.commissionMtd.amount);
      cmp("table month-to-date vs selected range", admin.submissionsMtd, admin.combined);
    }
    if (isWeek && board?.weekly) {
      const st = standingOf(board.weekly.standings, rep.userId);
      sources["My overview · weekly bounty count"] = st?.count ?? null;
      cmp("weekly bounty count", admin.combined, st?.count ?? null);
    }
    return { userId: rep.userId, name: rep.name, admin, rep: { combined, army, veteran, commission: repCommission, sources }, diffs };
  });

  return { range: key, label: range.label, asOf: coverage().lastCoreSyncOkAt ?? null, rows, allMatch: rows.every((r) => r.diffs.length === 0) };
}

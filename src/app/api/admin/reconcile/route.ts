// GET /api/admin/reconcile[?range=today|this_week|this_month|last_month|all]
// The admin Program Submissions row against every figure the rep pages
// show, per rep (src/lib/reconcile.ts). Admins only; read-only; never GHL.
// tests/reconcile.test.mjs calls this and fails on any difference.

import { NextResponse } from "next/server";
import { isDenied, requireAdminApi } from "@/lib/guard";
import { RECONCILE_RANGES, reconcile, type ReconcileRange } from "@/lib/reconcile";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const user = await requireAdminApi();
  if (isDenied(user)) return user;
  const k = new URL(req.url).searchParams.get("range") ?? "all";
  const keys: readonly ReconcileRange[] | null = k === "all" ? RECONCILE_RANGES : (RECONCILE_RANGES as readonly string[]).includes(k) ? [k as ReconcileRange] : null;
  if (!keys) return NextResponse.json({ ok: false, error: `range must be one of ${RECONCILE_RANGES.join(", ")}, or all.` }, { status: 400 });
  const now = new Date();
  const reports = keys.map((key) => reconcile(key, now));
  return NextResponse.json({ ok: true, allMatch: reports.every((r) => r.allMatch), reports });
}

// GET /api/drilldown — rows behind one Submissions KPI card or one rep row.
// Reads the local cache; the only GHL calls are read-only GET /contacts/{id}
// for the listed contacts (see src/lib/drilldown.ts). Returns personal data,
// so it is disabled in production until login exists, like the sync route.

import { NextResponse } from "next/server";
import { isRangeKey, resolveRange } from "@/lib/dates";
import { milestoneDrilldown, repDrilldown } from "@/lib/drilldown";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Drilldowns are disabled in production until login is configured." }, { status: 403 });
  }
  const sp = new URL(req.url).searchParams;
  const rangeParam = sp.get("range") ?? undefined;
  const now = new Date();
  const range = resolveRange(isRangeKey(rangeParam) ? rangeParam : "this_month", now, { from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
  // Quota, won, and commission figures are always the current calendar month.
  const month = resolveRange("this_month", now);
  const kind = sp.get("kind");
  try {
    const result =
      kind === "milestone" ? await milestoneDrilldown(sp.get("key") ?? "", range) : kind === "rep" ? await repDrilldown(sp.get("user") ?? "", range, month) : undefined;
    if (result === undefined) return NextResponse.json({ ok: false, error: "kind must be milestone or rep." }, { status: 400 });
    if (result === null) return NextResponse.json({ ok: false, error: "Unknown milestone or user." }, { status: 404 });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

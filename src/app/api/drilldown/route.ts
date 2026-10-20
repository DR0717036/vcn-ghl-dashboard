// GET /api/drilldown — rows behind one Submissions KPI card or one rep row.
// Reads the local cache; the only GHL calls are read-only GET /contacts/{id}
// for the listed contacts (see src/lib/drilldown.ts). Returns personal data,
// so it requires a signed-in user (src/lib/guard.ts).

import { NextResponse } from "next/server";
import { isDenied, requireApiUser } from "@/lib/guard";
import { isRangeKey, resolveRange } from "@/lib/dates";
import { milestoneDrilldown, repDrilldown } from "@/lib/drilldown";
import { semesterFor } from "@/lib/mapping-config";
import { responseDrilldown, staleDrilldown } from "@/lib/conversations";
import { keywordDrilldown } from "@/lib/messaging";
import { callsDrilldown } from "@/lib/repCalls";
import { repAppointmentsDrilldown, statusCardDrilldown } from "@/lib/appointments";
import { lostDrilldown, ngtDrilldown, outcomeDrilldown } from "@/lib/appointmentOutcomes";
import { leadsDrilldown } from "@/lib/leads";
import { wonDrilldown } from "@/lib/wonRow";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const user = await requireApiUser();
  if (isDenied(user)) return user;
  const sp = new URL(req.url).searchParams;
  const rangeParam = sp.get("range") ?? undefined;
  const now = new Date();
  const range = resolveRange(isRangeKey(rangeParam) ? rangeParam : "this_month", now, { from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
  // Quota, won, and commission figures are always the current calendar month.
  const month = resolveRange("this_month", now);
  const kind = sp.get("kind");
  try {
    const result =
      kind === "milestone"
        ? await milestoneDrilldown(sp.get("key") ?? "", range)
        : kind === "rep"
          ? await repDrilldown(sp.get("user") ?? "", range, month, semesterFor(sp.get("semester")))
          : kind === "calls"
            ? callsDrilldown(sp.get("user") ?? "", range)
            : kind === "stale"
              ? staleDrilldown(sp.get("user") ?? "", now)
              : kind === "response"
                ? responseDrilldown(sp.get("user") ?? "", range)
                : kind === "keyword" && ["optout", "interest", "reply"].includes(sp.get("which") ?? "")
                  ? keywordDrilldown(range, sp.get("which") as "optout" | "interest" | "reply", sp.get("template") ?? "all")
                  : kind === "appt"
                    ? statusCardDrilldown(sp.get("which") ?? "", range)
                    : kind === "apptRep"
                      ? repAppointmentsDrilldown(sp.get("user") ?? "", range)
                      : kind === "apptOutcome"
                        ? outcomeDrilldown(range)
                        : kind === "apptLost"
                          ? lostDrilldown(range)
                          : kind === "apptNgt"
                            ? ngtDrilldown(range)
                            : kind === "leads"
                              ? leadsDrilldown(sp.get("which") ?? "all", sp.get("arg") ?? "", range)
                              : kind === "won"
                                ? wonDrilldown(sp.get("which") ?? "all", sp.get("arg") ?? "", sp.get("mode") === "period" ? "period" : "current", range)
                                : undefined;
    if (result === undefined) return NextResponse.json({ ok: false, error: "kind must be milestone, rep, calls, stale, response, keyword, appt, apptRep, apptOutcome, apptLost, apptNgt, leads, or won." }, { status: 400 });
    if (result === null) return NextResponse.json({ ok: false, error: "Unknown milestone or user." }, { status: 404 });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

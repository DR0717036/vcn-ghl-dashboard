// GET /api/me/drilldown — the rows behind a card on the rep dashboard.
// A signed-in rep only ever gets their own rows; an admin passes
// ?as=<GHL user id> ("View as rep"), exactly as the /me page does. Reads the
// cache; the only GHL calls are read-only GET /contacts/{id} for the listed
// contacts (src/lib/drilldown.ts). Never writes to GHL.
//
//   kind=milestone&key=<milestone key>&range=…[&bucket=<chart bucket key>]
//   kind=won&program=army|veteran[&semester=KEY]&range=…[&bucket=…]
//   kind=subs&program=army|veteran            (this month's submissions, with commission)
//   kind=calls&range=…                        (the rep's own calls; no recordings)
//   kind=appt&which=booked|scheduled|cohort|lost|ngt&range=…   (My appointments)
//   kind=needsCall                            (My pipeline: leads with no call from the rep in 14+ days)
//
// Reps never receive Opportunity Value (owner request 2026-11-24): the rep
// libraries do not produce it, and repSafe() strips any value or recording
// key from the response as a backstop (tests/rep-views.test.mjs checks it).

import { NextResponse } from "next/server";
import { isDenied, requireApiUser } from "@/lib/guard";
import { isRangeKey, resolveRange } from "@/lib/dates";
import { semesterFor } from "@/lib/mapping-config";
import { repForApi } from "@/lib/me/context";
import { myApptDrilldown } from "@/lib/me/appointments";
import { repRow, repSafe, type RepDrillResult } from "@/lib/me/repSafe";
import { myMilestoneDrilldown, mySubmissionsDrilldown, myWonDrilldown } from "@/lib/me/submissions";
import { computeNeedsCall, needsCallRows } from "@/lib/needsCall";
import { callsDrilldown } from "@/lib/repCalls";

export const dynamic = "force-dynamic";

/** The rep's own calls, as the admin drilldown lists them, without recording ids or Opportunity Value. */
function myCallsDrilldown(userId: string, range: ReturnType<typeof resolveRange>): RepDrillResult {
  const r = callsDrilldown(userId, range);
  return { ...r, rows: r.rows.map(repRow) };
}

/** The rep's leads that need a call, longest silent first. */
function myNeedsCallDrilldown(rep: { userId: string; name: string }, now: Date): RepDrillResult {
  const r = computeNeedsCall(rep as Parameters<typeof computeNeedsCall>[0], now);
  const rows = needsCallRows(r, rep.name).map(repRow);
  return { ok: true, title: `Needs a call · ${rows.length.toLocaleString("en-US")} leads`, rows, count: rows.length, detailsNote: null, fetchedAt: new Date().toISOString() };
}

export async function GET(req: Request): Promise<NextResponse> {
  const user = await requireApiUser();
  if (isDenied(user)) return user;
  const sp = new URL(req.url).searchParams;
  const rep = repForApi(user, sp.get("as"));
  if (!rep) return NextResponse.json({ ok: false, error: user.role === "admin" ? "Pass ?as=<GHL user id> of a configured rep." : "Your sign-in is not linked to a rep." }, { status: 403 });
  const rangeParam = sp.get("range") ?? undefined;
  const now = new Date();
  const range = resolveRange(isRangeKey(rangeParam) ? rangeParam : "this_week", now, { from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
  const bucket = sp.get("bucket");
  const kind = sp.get("kind");
  const program = sp.get("program") === "veteran" ? "veteran" : "army";
  try {
    const result: RepDrillResult | null | undefined =
      kind === "milestone"
        ? await myMilestoneDrilldown(rep, sp.get("key") ?? "", range, bucket)
        : kind === "won"
          ? myWonDrilldown(rep, program, program === "veteran" ? semesterFor(sp.get("semester")) : null, range, bucket)
          : kind === "subs"
            ? await mySubmissionsDrilldown(rep, program, now)
            : kind === "calls"
              ? myCallsDrilldown(rep.userId, range)
              : kind === "appt"
                ? myApptDrilldown(rep, sp.get("which") ?? "", range, now)
                : kind === "needsCall"
                  ? myNeedsCallDrilldown(rep, now)
                  : undefined;
    if (result === undefined) return NextResponse.json({ ok: false, error: "kind must be milestone, won, subs, calls, appt, or needsCall." }, { status: 400 });
    if (result === null) return NextResponse.json({ ok: false, error: "Unknown milestone or appointment list." }, { status: 404 });
    return NextResponse.json(repSafe(result, "/api/me/drilldown"));
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

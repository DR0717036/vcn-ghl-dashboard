// POST /api/admin/resync — moves the incremental sync cursors (calls and/or
// messages) back to a date so the next automatic sync re-reads that window.
// Recovers a window the host skipped (e.g. after an intermittent empty export).
// Requires a signed-in user listed under historyImportAdmins in config/users.json.
// Writes only to the local cache's sync_state; never to GHL. The re-read upserts
// by id, so nothing is duplicated.
//
// Body (JSON): { "from": "2026-10-20", "calls": true, "messages": true }
//   from     — ISO date or date-time; the cursor is set here and the next sync
//              re-reads from one day earlier (the usual overlap) to now.
//   calls    — reset the calls cursor (default true)
//   messages — reset the SMS and email message cursors (default false)

import { NextResponse } from "next/server";
import { isDenied, requireApiUser } from "@/lib/guard";
import { isHistoryImportAdmin } from "@/lib/users";
import { resetIncrementalCursors } from "@/lib/sync/core";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const user = await requireApiUser();
  if (isDenied(user)) return user;
  if (!isHistoryImportAdmin(user.email)) {
    return NextResponse.json({ ok: false, error: "Only an address listed under historyImportAdmins in config/users.json may trigger a re-pull." }, { status: 403 });
  }
  try {
    const body = (await req.json()) as { from?: unknown; calls?: unknown; messages?: unknown };
    if (typeof body.from !== "string") throw new Error('"from" (an ISO date) is required');
    // A bare date means the start of that Eastern day; normalise to an ISO instant.
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(body.from) ? `${body.from}T00:00:00.000-04:00` : body.from;
    const normalised = new Date(iso).toISOString();
    const what = { calls: body.calls !== false, messages: body.messages === true };
    if (!what.calls && !what.messages) throw new Error("nothing to do: set calls and/or messages");
    const keys = resetIncrementalCursors(normalised, what);
    console.log(`[resync] ${user.email} reset ${keys.join(", ")} to ${normalised}`);
    return NextResponse.json({ ok: true, from: normalised, reset: keys, note: "The next automatic sync (within 15 minutes) re-reads from one day before this. Watch the Mapping page runs." });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }
}

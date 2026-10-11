// POST /api/sync/mapping — re-runs the read-only mapping probes against GHL
// and stores the results in the local cache. This writes to OUR database
// only; it never writes to GHL.

import { NextResponse } from "next/server";
import { runMappingSync } from "@/lib/sync/mapping";

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  // Until login (Sign in with Google) is wired up, this endpoint only works
  // in local development. It must stay disabled in production until then.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "Sync endpoint is disabled in production until login is configured." },
      { status: 403 },
    );
  }
  try {
    const result = await runMappingSync();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

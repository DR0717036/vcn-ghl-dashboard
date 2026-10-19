// POST /api/sync/mapping — re-runs the read-only mapping probes against GHL
// and stores the results in the local cache. This writes to OUR database
// only; it never writes to GHL.

import { NextResponse } from "next/server";
import { isDenied, requireApiUser } from "@/lib/guard";
import { runMappingSync } from "@/lib/sync/mapping";

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  const user = await requireApiUser();
  if (isDenied(user)) return user;
  try {
    const result = await runMappingSync();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

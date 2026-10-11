// POST /api/sync/core — runs the core 15-minute sync on demand. Writes only
// to the local cache; never to GHL. Disabled in production until login exists.

import { NextResponse } from "next/server";
import { isCoreSyncRunning, runCoreSync } from "@/lib/sync/core";

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Sync endpoint is disabled in production until login is configured." }, { status: 403 });
  }
  if (isCoreSyncRunning()) {
    return NextResponse.json({ ok: false, error: "A sync is already running." }, { status: 409 });
  }
  try {
    const result = await runCoreSync();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

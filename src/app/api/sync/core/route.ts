// POST /api/sync/core — runs the core 15-minute sync on demand. Writes only
// to the local cache; never to GHL. Requires a signed-in user.

import { NextResponse } from "next/server";
import { isDenied, requireAdminApi } from "@/lib/guard";
import { isCoreSyncRunning, runCoreSync } from "@/lib/sync/core";

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  const user = await requireAdminApi();
  if (isDenied(user)) return user;
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

// POST /api/admin/import-history[?dryRun=1] — merges event history exported
// from another copy of this dashboard (see src/lib/historyImport.ts) into
// this cache. Requires a signed-in user listed under historyImportAdmins in
// config/users.json. Writes only to the local cache; never to GHL.
// dryRun=1 reports what would change without writing.

import { NextResponse } from "next/server";
import { isDenied, requireAdminApi } from "@/lib/guard";
import { importHistory, validateExport } from "@/lib/historyImport";
import { isHistoryImportAdmin } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const user = await requireAdminApi();
  if (isDenied(user)) return user;
  if (!isHistoryImportAdmin(user.email)) {
    return NextResponse.json({ ok: false, error: "Only an address listed under historyImportAdmins in config/users.json may import history." }, { status: 403 });
  }
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  try {
    const data = validateExport(await req.json());
    const result = importHistory(data, dryRun);
    console.log(`[history-import] ${dryRun ? "dry run" : "applied"} by ${user.email}: ${JSON.stringify(result)}`);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }
}

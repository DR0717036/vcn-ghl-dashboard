// GET /api/recording?id=<call message id> — streams one call recording from
// GHL through this server. The GHL token stays server-side; the page only
// ever sees this relative URL. Read-only (GET). The id must be a human call
// already in the local cache, so arbitrary ids cannot be probed. Recordings
// are sensitive, so like the other data routes this is disabled in
// production until login exists.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCallRecording } from "@/lib/ghl/read";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Recordings are disabled in production until login is configured." }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return NextResponse.json({ ok: false, error: "Missing or malformed call id." }, { status: 400 });
  const known = getDb().prepare(`SELECT 1 FROM calls WHERE id = ? AND automated = 0 LIMIT 1`).get(id);
  if (!known) return NextResponse.json({ ok: false, error: "Unknown call." }, { status: 404 });

  const r = await getCallRecording(id);
  if (!r.ok) {
    if (r.status === 422 || r.status === 404) return NextResponse.json({ ok: false, error: "GHL has no recording for this call.", noRecording: true }, { status: 404 });
    return NextResponse.json({ ok: false, error: r.error, kind: r.kind }, { status: r.kind === "permission" ? 403 : 502 });
  }
  return new Response(r.body, {
    status: 200,
    headers: {
      "content-type": r.contentType ?? "audio/wav",
      "cache-control": "private, no-store",
      "content-disposition": "inline",
    },
  });
}

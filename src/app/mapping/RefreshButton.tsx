"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RefreshButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage("Reading from Go High Level… this takes about a minute.");
    try {
      const res = await fetch("/api/sync/mapping", { method: "POST" });
      const body = (await res.json()) as { ok?: boolean; error?: string; probes?: { ok: boolean }[] };
      if (!res.ok) {
        setMessage(`Sync failed: ${body.error ?? res.statusText}`);
      } else {
        const total = body.probes?.length ?? 0;
        const okCount = body.probes?.filter((p) => p.ok).length ?? 0;
        setMessage(body.ok ? `Sync complete: all ${total} checks succeeded.` : `Sync finished with problems: ${okCount} of ${total} checks succeeded. See details below.`);
      }
      router.refresh();
    } catch (err) {
      setMessage(`Sync failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="refresh">
      <button type="button" onClick={run} disabled={busy} className="btn">
        {busy ? "Syncing…" : "Sync from GHL now"}
      </button>
      {message ? <span className="refresh-msg">{message}</span> : null}
    </div>
  );
}

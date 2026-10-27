"use client";

// One button that posts a JSON action to an invoice route, shows the reply,
// and refreshes the page so the new status renders. Used by the rep's "Send
// for review" and the admins' "Approve" / "Mark paid".

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function InvoiceActionButton({ url, body, label, busyLabel, confirm, className = "btn" }: { url: string; body: Record<string, unknown>; label: string; busyLabel: string; confirm?: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      setMessage(data.ok ? (data.message ?? "Done.") : `Not done: ${data.error ?? res.statusText}`);
      if (data.ok) router.refresh();
    } catch (e) {
      setMessage(`Not done: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inv-action">
      <button type="button" className={className} onClick={run} disabled={busy}>
        {busy ? busyLabel : label}
      </button>
      {message ? <span className="refresh-msg">{message}</span> : null}
    </span>
  );
}

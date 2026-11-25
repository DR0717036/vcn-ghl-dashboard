"use client";

// The attendance override form on the admin Invoices page (owner request
// 2026-11-24): pick a rep and a day, choose approved PTO / sick / company
// holiday / excused, add a note, and save; or clear an override. Posts to
// /api/admin/attendance and refreshes the page so the calendars update.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Fired by a red day on the attendance strips (OverrideDayButton). */
export const PICK_EVENT = "inv-override-pick";
export interface PickDetail {
  userId: string;
  day: string;
}

const KINDS = [
  { key: "pto", label: "Approved PTO" },
  { key: "sick", label: "Sick day" },
  { key: "holiday", label: "Company holiday (paid)" },
  { key: "other", label: "Excused (other)" },
];

export default function OverrideForm({ reps, defaultDay }: { reps: { userId: string; name: string }[]; defaultDay: string }) {
  const router = useRouter();
  const [userId, setUserId] = useState(reps[0]?.userId ?? "");
  const [day, setDay] = useState(defaultDay);
  const [kind, setKind] = useState("pto");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [picked, setPicked] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPick = (e: Event) => {
      const d = (e as CustomEvent<PickDetail>).detail;
      if (!d) return;
      setUserId(d.userId);
      setDay(d.day);
      setMessage(null);
      setPicked(true);
      box.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    window.addEventListener(PICK_EVENT, onPick);
    return () => window.removeEventListener(PICK_EVENT, onPick);
  }, []);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
    <div className={`inv-override-form${picked ? " is-picked" : ""}`} id="inv-override-form" ref={box}>
      <label>
        <span className="label">Rep</span>
        <select value={userId} onChange={(e) => { setUserId(e.target.value); setPicked(false); }}>
          {reps.map((r) => (
            <option key={r.userId} value={r.userId}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="label">Day</span>
        <input type="date" value={day} onChange={(e) => { setDay(e.target.value); setPicked(false); }} />
      </label>
      <label>
        <span className="label">Mark as</span>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <label className="inv-override-note">
        <span className="label">Note (shown to the rep)</span>
        <input type="text" value={note} maxLength={300} placeholder="e.g. approved PTO, requested Nov 20" onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="inv-override-actions">
        <button type="button" className="btn" disabled={busy || !userId || !day} onClick={() => post({ userId, day, kind, note })}>
          {busy ? "Saving…" : "Save override"}
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy || !userId || !day} onClick={() => post({ userId, day, action: "clear" })}>
          Clear that day
        </button>
        {message ? <span className="refresh-msg">{message}</span> : picked ? <span className="refresh-msg">{reps.find((r) => r.userId === userId)?.name ?? "Rep"} · {day} filled in from the calendar. Choose the reason and save.</span> : null}
      </div>
    </div>
  );
}

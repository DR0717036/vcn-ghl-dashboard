"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const SHORTCUTS: [string, string][] = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["this_week", "This Week"],
  ["last_week", "Last Week"],
  ["this_month", "This Month"],
  ["last_month", "Last Month"],
  ["this_year", "This Year"],
  ["last_year", "Last Year"],
];

export default function RangePicker({ active, from, to }: { active: string; from?: string; to?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [customFrom, setCustomFrom] = useState(from ?? "");
  const [customTo, setCustomTo] = useState(to ?? "");

  function go(range: string, extra?: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    next.set("range", range);
    next.delete("from");
    next.delete("to");
    for (const [k, v] of Object.entries(extra ?? {})) next.set(k, v);
    router.push(`/?${next.toString()}`);
  }

  return (
    <div className="range-picker">
      <div className="range-shortcuts" role="group" aria-label="Date range">
        {SHORTCUTS.map(([key, label]) => (
          <button key={key} type="button" className={`range-btn${active === key ? " active" : ""}`} onClick={() => go(key)}>
            {label}
          </button>
        ))}
      </div>
      <form
        className="range-custom"
        onSubmit={(e) => {
          e.preventDefault();
          if (customFrom && customTo) go("custom", { from: customFrom, to: customTo });
        }}
      >
        <label className="label" htmlFor="from">
          Custom
        </label>
        <input id="from" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} required />
        <span className="note">to</span>
        <input id="to" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} required />
        <button type="submit" className={`range-btn${active === "custom" ? " active" : ""}`}>
          Apply
        </button>
      </form>
    </div>
  );
}

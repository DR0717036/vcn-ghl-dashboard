"use client";

// Semester dropdown for the Submissions section (owner request 2026-10-20).
// Sits in the title row of the first Veteran milestone card and switches
// both Veteran cards and the IAU part of Program Submissions between the
// configured semesters (config/ghl-mapping.json semesters.list). The choice
// lives in the URL (?semester=KEY) so the page, its drilldowns, and CSV
// exports all agree; the default semester keeps the URL clean. The card it
// sits in opens a drilldown on click, so the picker stops its own clicks
// from bubbling up to the card.

import { useRouter, useSearchParams } from "next/navigation";

export interface SemesterOption {
  key: string;
  label: string;
  isDefault: boolean;
}

export default function SemesterPicker({ options, active, hint, basePath = "/", anchor = "sec-submissions" }: { options: SemesterOption[]; active: string; hint: string; basePath?: string; anchor?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const choose = (key: string) => {
    const next = new URLSearchParams(params.toString());
    const opt = options.find((o) => o.key === key);
    if (!opt || opt.isDefault) next.delete("semester");
    else next.set("semester", key);
    const qs = next.toString();
    router.push(qs ? `${basePath}?${qs}#${anchor}` : `${basePath}#${anchor}`);
  };
  return (
    <label className="semester-picker" title={hint} onClick={(e) => e.stopPropagation()}>
      <span className="semester-picker-label">Semester</span>
      <select value={active} onChange={(e) => choose(e.target.value)} aria-label="Semester shown on the Veteran cards and Program Submissions" aria-description={hint}>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
            {o.isDefault ? " (default)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

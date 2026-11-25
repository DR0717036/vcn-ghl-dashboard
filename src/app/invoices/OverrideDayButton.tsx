"use client";

// A red (non-paid) day on the admin attendance strips (owner request
// 2026-11-25). Clicking it tells the override form which rep and day to
// pre-fill (a window event the form listens for) and scrolls to the form.

import { PICK_EVENT, type PickDetail } from "./OverrideForm";

export default function OverrideDayButton({ userId, day, className, title, children }: { userId: string; day: string; className: string; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={`${className} inv-att-pick`}
      title={title}
      aria-label={title}
      onClick={() => {
        window.dispatchEvent(new CustomEvent<PickDetail>(PICK_EVENT, { detail: { userId, day } }));
        document.getElementById("inv-override-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
    >
      {children}
    </button>
  );
}

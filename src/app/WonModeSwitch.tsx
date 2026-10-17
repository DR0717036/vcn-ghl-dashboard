"use client";

// Snapshot / period toggle for the Won Opportunities row. Both variants are
// rendered on the server; this switch shows one of them. The default is the
// "Currently Won" snapshot; the choice is remembered in this browser only.

import { useEffect, useState, type ReactNode } from "react";

const KEY = "vcn.wonMode";

export default function WonModeSwitch({ current, period, periodLabel }: { current: ReactNode; period: ReactNode; periodLabel: string }) {
  const [mode, setMode] = useState<"current" | "period">("current");
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(KEY);
      if (v === "period") setMode("period");
    } catch {
      // storage unavailable: keep the default
    }
  }, []);
  const choose = (m: "current" | "period") => {
    setMode(m);
    try {
      window.localStorage.setItem(KEY, m);
    } catch {
      // ignore
    }
  };
  return (
    <>
      <div className="won-mode" role="group" aria-label="Won view">
        <button type="button" className={`seg-btn${mode === "current" ? " active" : ""}`} onClick={() => choose("current")}>
          Currently Won (snapshot)
        </button>
        <button type="button" className={`seg-btn${mode === "period" ? " active" : ""}`} onClick={() => choose("period")}>
          Became Won During Period
          <span className="seg-count">{periodLabel}</span>
        </button>
      </div>
      <div style={{ display: mode === "current" ? "contents" : "none" }}>{current}</div>
      <div style={{ display: mode === "period" ? "contents" : "none" }}>{period}</div>
    </>
  );
}

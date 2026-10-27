"use client";

// Small reveal animations for the rep dashboard: a number that counts up
// from zero the first time it scrolls into view, and a bar that fills from
// zero. About 1.2 s with an ease-out curve; both render the final state at
// once under prefers-reduced-motion or without JavaScript.

import { useEffect, useRef, useState } from "react";

const DURATION_MS = 1200;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

function useRevealed<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || on) return;
    if (!("IntersectionObserver" in window)) {
      setOn(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setOn(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [on]);
  return [ref, on];
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Counts from $0 up to `value` on first reveal. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const [ref, on] = useRevealed<HTMLSpanElement>();
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!on) return;
    if (reducedMotion()) {
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / DURATION_MS);
      setShown(Math.round(value * ease(k)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [on, value]);
  // Before JavaScript runs (and for crawlers) the real value is in the markup.
  return (
    <span ref={ref} className={className}>
      {usd(shown === null ? (on ? 0 : value) : shown)}
    </span>
  );
}

/** A goal bar whose fill grows from 0 to `pct` (0–100) on first reveal. */
export function FillBar({ pct, className, label, mark }: { pct: number; className: string; label: string; mark?: number }) {
  const [ref, on] = useRevealed<HTMLDivElement>();
  const target = Math.max(0, Math.min(100, pct));
  const reduced = on && reducedMotion();
  return (
    <div ref={ref} className={`me-bar ${className}${reduced ? "" : " me-bar-anim"}`} role="img" aria-label={label}>
      <span style={{ width: `${on ? target : 0}%` }} />
      {mark !== undefined ? <i className="me-bar-mark" style={{ left: `${Math.min(100, mark)}%` }} aria-hidden="true" /> : null}
    </div>
  );
}

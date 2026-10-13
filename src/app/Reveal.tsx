"use client";

// Scroll reveal for KPI cards (owner edits round 4). Every card renders with
// the "reveal" class (opacity 0, slight downward offset, see base.css). This
// component adds "is-visible" when a card enters the viewport, staggering
// siblings in the same row by their position. It renders nothing.
//
// Reduced motion is honored in CSS (@media prefers-reduced-motion), and the
// CSS also shows cards outright when scripting is unavailable. A
// MutationObserver picks up cards re-rendered after a range change.

import { useEffect } from "react";

const STAGGER_MS = 90;

export default function Reveal() {
  useEffect(() => {
    const seen = new WeakSet<Element>();
    const show = (el: Element) => el.classList.add("is-visible");

    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll(".reveal").forEach(show);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          show(e.target);
          io.unobserve(e.target);
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -6% 0px" },
    );

    const scan = () => {
      document.querySelectorAll<HTMLElement>(".reveal").forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        const row = el.closest(".kpi-row");
        const index = row ? Array.from(row.children).findIndex((c) => c === el || c.contains(el)) : 0;
        el.style.setProperty("--reveal-delay", `${Math.max(0, index) * STAGGER_MS}ms`);
        io.observe(el);
      });
    };

    scan();
    let raf = 0;
    const mo = new MutationObserver(() => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; scan(); });
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}

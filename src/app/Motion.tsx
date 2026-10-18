"use client";

// Scroll-into-view motion (owner request 2026-10-17): chart visuals animate
// once per page load when 20% of the chart is visible — bars grow from the
// baseline, lines draw left to right, donuts sweep from zero, heat-map cells
// fade in. Section icons play once when their band heading enters the view.
// Everything is CSS (base.css, "scroll motion"); this component only adds
// the "anim" class to <html> (so nothing is hidden without JS or under
// prefers-reduced-motion) and flips "chart-in" / "is-playing" on the
// observed elements. Numbers, labels, and tooltips are never animated.

import { useEffect } from "react";

const SELECTOR = ".anim-root, .band-head";

export default function Motion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const root = document.documentElement;
    root.classList.add("anim");
    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          if (el.classList.contains("band-head")) el.querySelector(".sec-icon")?.classList.add("is-playing");
          else el.classList.add("chart-in");
          io.unobserve(el);
        }
      },
      { threshold: 0.2 },
    );
    const scan = () => {
      document.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
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
      root.classList.remove("anim");
    };
  }, []);
  return null;
}

"use client";

// Sticky "liquid glass" control bar: semi-transparent white with a backdrop
// blur, pinned under the header. Because the page alternates dark and light
// bands, the bar watches which band is scrolling beneath its bottom edge and
// switches its text colors (data-over="dark" | "light") so it stays legible
// over both.

import { useEffect, useRef, useState, type ReactNode } from "react";

export default function ControlBar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState<"dark" | "light">("dark");

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const y = el.getBoundingClientRect().bottom + 2;
      let theme: "dark" | "light" = "dark";
      for (const band of Array.from(document.querySelectorAll<HTMLElement>(".band"))) {
        const r = band.getBoundingClientRect();
        if (r.top <= y && r.bottom >= y) {
          theme = band.classList.contains("band-light") ? "light" : "dark";
          break;
        }
      }
      setOver((cur) => (cur === theme ? cur : theme));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="control-sticky">
      <div ref={ref} className="control-bar" data-over={over}>
        {children}
      </div>
    </div>
  );
}

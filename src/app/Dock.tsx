"use client";

// macOS-style dock (owner request 2026-10-17, replaces the slide-in panel).
// A slim vertical glass strip on the left edge, always visible: six icon
// tiles at 32px with no labels at rest. When the pointer enters the strip
// the tiles grow to a 52px base; the tile under the pointer magnifies to
// 1.6× (about 84px) and its two neighbours to 1.25×, with a spring-like
// 150ms transition, and the hovered section's name and description slide
// out to its right in a small glass label. A dot under a tile marks the
// band in view (IntersectionObserver). Touch devices keep the rest size:
// one tap shows a tile's label, a second tap navigates. Keyboard: the tiles
// are buttons; focus magnifies and labels, Enter navigates. Reduced motion
// removes the transitions and the smooth scroll.

import { useEffect, useRef, useState } from "react";
import SectionIcon from "./SectionIcon";
import { SECTIONS } from "./sections";

export default function Dock() {
  const [hot, setHot] = useState<number | null>(null); // magnified tile
  const [over, setOver] = useState(false); // pointer or focus inside the strip
  const [touchSel, setTouchSel] = useState<string | null>(null);
  const [hoverMode, setHoverMode] = useState(true);
  const [active, setActive] = useState<string | null>(null);
  const reduced = useRef(false);
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setHoverMode(mq.matches);
      reduced.current = rm.matches;
    };
    apply();
    mq.addEventListener("change", apply);
    rm.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      rm.removeEventListener("change", apply);
    };
  }, []);

  // active band: the one with the largest visible share
  useEffect(() => {
    const ratios = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) ratios.set((e.target as HTMLElement).id, e.isIntersecting ? e.intersectionRatio : 0);
        let best: string | null = null;
        let bestRatio = 0;
        for (const [id, r] of ratios) if (r > bestRatio) [best, bestRatio] = [id, r];
        if (best) setActive(best);
      },
      { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1], rootMargin: "-120px 0px -30% 0px" },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  // touch: tapping outside the dock clears the open label
  useEffect(() => {
    if (!touchSel) return;
    const onDown = (e: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setTouchSel(null);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [touchSel]);

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: reduced.current ? "auto" : "smooth", block: "start" });
    setTouchSel(null);
  };

  const scaleOf = (i: number) => (hot === null ? 1 : i === hot ? 1.6 : Math.abs(i - hot) === 1 ? 1.25 : 1);

  return (
    <nav
      ref={navRef}
      className={`dock${over && hoverMode ? " is-over" : ""}${hoverMode ? "" : " dock-touch"}`}
      aria-label="Dashboard sections"
      onMouseEnter={() => setOver(true)}
      onMouseLeave={() => {
        setOver(false);
        setHot(null);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOver(false);
          setHot(null);
        }
      }}
    >
      <ul className="dock-list">
        {SECTIONS.map((s, i) => {
          const labelled = hoverMode ? hot === i : touchSel === s.id;
          return (
            <li key={s.id} className={`dock-item${hot === i ? " is-hot" : ""}${labelled ? " is-labelled" : ""}${active === s.id ? " is-active" : ""}`} style={{ "--s": scaleOf(i) } as React.CSSProperties}>
              <button
                type="button"
                className="dock-btn"
                aria-label={`${s.name}: ${s.desc}`}
                aria-current={active === s.id ? "true" : undefined}
                onMouseEnter={() => setHot(i)}
                onFocus={() => {
                  setOver(true);
                  setHot(i);
                }}
                onClick={() => {
                  if (hoverMode || touchSel === s.id) go(s.id);
                  else setTouchSel(s.id);
                }}
              >
                <SectionIcon name={s.icon} size="100%" />
                <span className="dock-dot" aria-hidden="true" />
              </button>
              <span className="dock-label" role="presentation">
                <span className="dock-label-name">{s.name}</span>
                <span className="dock-label-desc">{s.desc}</span>
                {!hoverMode ? <span className="dock-label-hint">Tap again to go</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

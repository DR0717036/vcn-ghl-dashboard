"use client";

// Slide-in side navigation (owner request 2026-10-17). A glass panel fixed
// to the left edge, hidden by default. On hover-capable, wide screens it
// slides in when the pointer enters the leftmost 24px and slides out 400ms
// after the pointer leaves the panel. On touch or narrow screens, and for
// keyboard users (Tab to it), a small glass tab on the left edge toggles
// the panel. Items scroll smoothly to their band; the band in view is
// highlighted via IntersectionObserver. Reduced motion disables the slide
// and the smooth scroll.

import { useCallback, useEffect, useRef, useState } from "react";
import SectionIcon from "./SectionIcon";
import { SECTIONS } from "./sections";

const CLOSE_DELAY_MS = 400;

export default function SideNav() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [hoverMode, setHoverMode] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const reduced = useRef(false);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [cancelClose]);

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 900px)");
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

  // active section: the band with the largest visible share
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: reduced.current ? "auto" : "smooth", block: "start" });
    if (!hoverMode) setOpen(false);
  };

  return (
    <>
      {hoverMode ? <div className="nav-edge" aria-hidden="true" onMouseEnter={() => { cancelClose(); setOpen(true); }} /> : null}
      <button
        type="button"
        className={`nav-tab${hoverMode ? " nav-tab-hover" : ""}`}
        aria-label={open ? "Close section navigation" : "Open section navigation"}
        aria-expanded={open}
        aria-controls="side-nav"
        onClick={() => setOpen((v) => !v)}
        onFocus={cancelClose}
      >
        <span className="nav-tab-bars" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </button>
      <nav
        id="side-nav"
        className={`side-nav${open ? " is-open" : ""}`}
        aria-label="Dashboard sections"
        aria-hidden={!open}
        onMouseEnter={cancelClose}
        onMouseLeave={() => { if (hoverMode) scheduleClose(); }}
        onFocus={cancelClose}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) scheduleClose();
        }}
      >
        <div className="side-nav-head">
          <div className="label">Sections</div>
          <div className="note">Jump to a band</div>
        </div>
        <ul className="side-nav-list">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <button type="button" className={`nav-item${active === s.id ? " is-active" : ""}`} aria-current={active === s.id ? "true" : undefined} tabIndex={open ? 0 : -1} onClick={() => go(s.id)}>
                <SectionIcon name={s.icon} size={36} />
                <span className="nav-item-text">
                  <span className="nav-item-name">{s.name}</span>
                  <span className="nav-item-desc">{s.desc}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

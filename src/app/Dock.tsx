"use client";

// macOS-style dock, hidden by default behind a dot-grid handle (owner
// request 2026-10-17). At rest only the handle shows on the left edge: a
// 2×6 grid of dots in a slim glass pill that pulses once on first load.
// Hovering the handle, or moving the pointer into the leftmost 24px, slides
// the dock in (250ms); the handle fades out as the dock appears. The dock
// is unchanged: tiles at a 52px base when the pointer is inside, the tile
// under the pointer at 1.6× and its neighbours at 1.25×, a glass label for
// the hovered section, a dot under the band in view. The dock slides out
// and the handle returns 400ms after the pointer leaves it. Touch: tap the
// handle to open, tap it again or outside to close; a tapped tile shows its
// label, a second tap navigates. Keyboard: the handle is focusable, Enter
// opens and moves focus to the first tile, Escape closes and returns focus
// to the handle. Reduced motion removes the transitions and the smooth
// scroll.

import { useCallback, useEffect, useRef, useState } from "react";
import SectionIcon from "./SectionIcon";
import { SECTIONS } from "./sections";

const CLOSE_DELAY_MS = 400;

export default function Dock() {
  const [open, setOpen] = useState(false);
  const [hot, setHot] = useState<number | null>(null); // magnified tile
  const [over, setOver] = useState(false); // pointer or focus inside the dock
  const [touchSel, setTouchSel] = useState<string | null>(null);
  const [hoverMode, setHoverMode] = useState(true);
  const [active, setActive] = useState<string | null>(null);
  const reduced = useRef(false);
  const navRef = useRef<HTMLElement | null>(null);
  const handleRef = useRef<HTMLButtonElement | null>(null);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);
  const close = useCallback(() => {
    cancelClose();
    setOpen(false);
    setOver(false);
    setHot(null);
    setTouchSel(null);
  }, [cancelClose]);
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      setOver(false);
      setHot(null);
    }, CLOSE_DELAY_MS);
  }, [cancelClose]);
  const openNow = useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);

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

  // open: Escape closes (focus back on the handle); touch: a tap outside closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      handleRef.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (navRef.current?.contains(t) || handleRef.current?.contains(t)) return;
      if (!hoverMode) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open, hoverMode, close]);

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: reduced.current ? "auto" : "smooth", block: "start" });
    setTouchSel(null);
    if (!hoverMode) close();
  };

  const openByKeyboard = () => {
    openNow();
    // focus the first tile once it is visible
    window.setTimeout(() => navRef.current?.querySelector<HTMLButtonElement>(".dock-btn")?.focus(), reduced.current ? 0 : 260);
  };

  const scaleOf = (i: number) => (hot === null ? 1 : i === hot ? 1.6 : Math.abs(i - hot) === 1 ? 1.25 : 1);

  return (
    <>
      {hoverMode ? <div className="dock-edge" aria-hidden="true" onMouseEnter={openNow} /> : null}
      <button
        ref={handleRef}
        type="button"
        className={`dock-handle${open ? " is-hidden" : ""}`}
        aria-label={open ? "Close section navigation" : "Open section navigation"}
        aria-expanded={open}
        aria-controls="dock-nav"
        onMouseEnter={() => {
          if (hoverMode) openNow();
        }}
        onMouseLeave={() => {
          if (hoverMode && !over) scheduleClose();
        }}
        onClick={() => {
          if (hoverMode) return; // hover already opened it; clicks are for touch
          if (open) close();
          else openNow();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (open) close();
            else openByKeyboard();
          }
        }}
      >
        <span className="dock-handle-dots" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <i key={i} />
          ))}
        </span>
      </button>
      <nav
        id="dock-nav"
        ref={navRef}
        className={`dock${open ? " is-open" : ""}${over && hoverMode ? " is-over" : ""}${hoverMode ? "" : " dock-touch"}`}
        aria-label="Dashboard sections"
        aria-hidden={!open}
        onMouseEnter={() => {
          cancelClose();
          setOver(true);
        }}
        onMouseLeave={() => {
          setOver(false);
          setHot(null);
          if (hoverMode) scheduleClose();
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setOver(false);
            setHot(null);
            if (e.relatedTarget !== handleRef.current) scheduleClose();
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
                  tabIndex={open ? 0 : -1}
                  aria-label={`${s.name}: ${s.desc}`}
                  aria-current={active === s.id ? "true" : undefined}
                  onMouseEnter={() => setHot(i)}
                  onFocus={() => {
                    cancelClose();
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
    </>
  );
}

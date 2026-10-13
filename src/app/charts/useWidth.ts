"use client";

// Measures a container's width so a chart can render at a fixed pixel height
// with un-distorted text, whatever the card width. Server render and first
// client render use the fallback, then a ResizeObserver keeps it current.

import { useEffect, useRef, useState, type RefObject } from "react";

export function useWidth<T extends HTMLElement>(fallback = 600): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = (w: number) => {
      if (w > 0) setWidth(Math.round(w));
    };
    apply(el.clientWidth);
    const ro = new ResizeObserver((entries) => apply(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

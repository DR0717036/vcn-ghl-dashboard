"use client";

// Chart tooltip rendered in a portal on document.body with position: fixed,
// so no card, chart box, or overflow rule can clip it. It follows the mouse
// (viewport coordinates) and flips to the left of the cursor near the right
// edge, and above it near the bottom.

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface TipPos {
  clientX: number;
  clientY: number;
}

export default function ChartTooltip({ pos, children, width = 230 }: { pos: TipPos | null; children: ReactNode; width?: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !pos || typeof document === "undefined") return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const estH = 120;
  const flipX = pos.clientX + 16 + width > vw - 8;
  const flipY = pos.clientY + 16 + estH > vh - 8;
  const left = flipX ? Math.max(8, pos.clientX - 16 - width) : pos.clientX + 16;
  const top = flipY ? Math.max(8, pos.clientY - 12 - estH) : pos.clientY + 14;
  return createPortal(
    <div className="chart-tip chart-tip-fixed" style={{ left, top, width }}>
      {children}
    </div>,
    document.body,
  );
}

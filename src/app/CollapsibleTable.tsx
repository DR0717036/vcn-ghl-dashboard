"use client";

// Wraps a long table: collapsed, it scrolls inside a fixed height with a
// sticky header; "Expand full list" shows every row at once. The table
// itself is server-rendered and passed in as children.

import { useState, type ReactNode } from "react";

export default function CollapsibleTable({ rows, children, maxHeight = 440 }: { rows: number; children: ReactNode; maxHeight?: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`tbl-collapsible${expanded ? " is-expanded" : ""}`} style={{ "--tbl-max": `${maxHeight}px` } as React.CSSProperties}>
      <div className="tbl-collapsible-body">{children}</div>
      <div className="tbl-collapsible-bar">
        <span className="note">{expanded ? `All ${rows.toLocaleString("en-US")} rows shown` : `${rows.toLocaleString("en-US")} rows · scroll inside the list, or`}</span>
        <button type="button" className="kpi-details-btn" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Collapse list" : "Expand full list"}
        </button>
      </div>
    </div>
  );
}

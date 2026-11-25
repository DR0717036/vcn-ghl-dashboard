"use client";

// The Appointment outcomes donut on My appointments (round 6, 2026-11-24):
// every slice and legend row opens the scheduled-appointments drilldown with
// that outcome's filter selected. Rescheduled overlaps the other buckets, so
// it is a legend-only row (counted, clickable, not drawn as a slice).

import { useState } from "react";
import DonutChart, { type DonutSegment } from "../charts/DonutChart";
import { DrilldownModal, type DrilldownSpec } from "../Drilldown";

export default function OutcomesDonut({ segments, total, spec }: { segments: (DonutSegment & { key: string })[]; total: number; spec: DrilldownSpec }) {
  const [open, setOpen] = useState<DrilldownSpec | null>(null);
  return (
    <>
      <DonutChart
        segments={segments}
        total={total}
        centerLabel="scheduled"
        size={168}
        emptyText="No appointments scheduled in the range."
        onSegmentClick={(i) => {
          const s = segments[i];
          if (!s) return;
          setOpen({ ...spec, defaultSegment: s.key, title: `${spec.title} · ${s.label}` });
        }}
      />
      {open ? <DrilldownModal spec={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

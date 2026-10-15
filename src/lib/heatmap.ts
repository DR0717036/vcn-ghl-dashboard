// "Best times to call" heat map: pure types and helpers shared by the server
// (which counts dials per weekday × hour in America/New_York) and the client
// component that draws the grid. Nothing here touches the database.

export interface HeatCell {
  dials: number;
  /** Completed calls (conversations + short pickups). */
  connected: number;
  /** Completed calls at or above the configured conversation threshold. */
  conversations: number;
}

export interface HeatData {
  /** Plain-language period, e.g. "This Month" or "Last 90 days (Jul 18 – Oct 15, 2026)". */
  label: string;
  /** grid[day][hour]: day 0 = Monday … 6 = Sunday, hour 0–23 New York. All 24 hours are counted. */
  grid: HeatCell[][];
  /** Total outbound dials in the period (equals the sum of every cell). */
  dials: number;
}

export interface HeatBundle {
  range: HeatData;
  last90: HeatData;
  /** First and last hour column shown (inclusive), e.g. 7 and 20. */
  startHour: number;
  endHour: number;
  /** Cells with fewer dials are hatched and left out of the top-3 ranking. */
  minDials: number;
  conversationMinSeconds: number;
}

export type HeatMetric = "conversation" | "connected" | "dials";

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function emptyGrid(): HeatCell[][] {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ dials: 0, connected: 0, conversations: 0 })));
}

export function hourLabel(h: number): string {
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
}

/** "10–11 AM", "11 AM–12 PM" */
export function hourSpan(h: number): string {
  const a = h % 12 === 0 ? 12 : h % 12;
  const b = (h + 1) % 12 === 0 ? 12 : (h + 1) % 12;
  const am = h < 12 ? "AM" : "PM";
  const bm = h + 1 < 12 || h + 1 === 24 ? "AM" : "PM";
  return am === bm ? `${a}–${b} ${am}` : `${a} ${am}–${b} ${bm}`;
}

/** The value a cell is colored by: a rate (0–1) or the dial count. Null when the slot has no dials. */
export function metricValue(c: HeatCell, m: HeatMetric): number | null {
  if (c.dials === 0) return null;
  if (m === "dials") return c.dials;
  return (m === "conversation" ? c.conversations : c.connected) / c.dials;
}

export interface TopSlot {
  day: number;
  hour: number;
  cell: HeatCell;
  value: number;
}

/** The best slots by the metric among cells with at least `minDials` dials, inside the shown hour window. */
export function topSlots(data: HeatData, m: HeatMetric, minDials: number, startHour: number, endHour: number, n = 3): TopSlot[] {
  const out: TopSlot[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = startHour; h <= endHour; h++) {
      const cell = data.grid[d][h];
      if (cell.dials < Math.max(1, minDials)) continue;
      const value = metricValue(cell, m);
      if (value === null) continue;
      out.push({ day: d, hour: h, cell, value });
    }
  }
  return out.sort((a, b) => b.value - a.value || b.cell.dials - a.cell.dials).slice(0, n);
}

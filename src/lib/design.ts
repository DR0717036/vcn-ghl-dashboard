// Chart palette and surfaces for code that draws charts (SVG, canvas, or a
// chart library). Mirrors src/styles/tokens.css; keep the two in sync.
//
// Categorical order is FIXED and validated for colorblind separation on the
// dark card surface. Assign series in this order and never cycle past six:
// a seventh category folds into "Other" or becomes a separate small chart.
// Only the first three are safe for scatter/bubble/map forms (all-pairs).

export const chartSurface = "#0c1d33";

export const chartSeries = [
  "#1677ff", // 1 brand blue
  "#a88900", // 2 brand yellow, dark step
  "#d55181", // 3 magenta
  "#0c9fcb", // 4 brand cyan, dark step
  "#d95926", // 5 orange
  "#9085e9", // 6 violet
] as const;

/** Fixed program colors so Army and Veteran never swap hues between charts. */
export const programColors = {
  army: chartSeries[0],
  veteran: chartSeries[1],
  other: "#738094",
} as const;

/** Sequential ramp, one hue, light → dark. For ordinal use start at index 1. */
export const chartSequential = ["#86b6ef", "#5598e7", "#3987e5", "#256abf", "#1c5cab", "#184f95"] as const;

/** Diverging: cool pole, neutral midpoint, warm pole. */
export const chartDiverging = { neg: "#1677ff", mid: "#2a3a4f", pos: "#d95926" } as const;

/** Status colors are reserved; never use them as a series. Always pair with a label. */
export const statusColors = { good: "#22a85f", warn: "#e0a100", bad: "#e04848", info: "#7fb0ff" } as const;

export const chartChrome = {
  grid: "rgba(34, 55, 80, 0.55)",
  axis: "#738094",
  textPrimary: "#ffffff",
  textSecondary: "#93a1b2",
  textMuted: "#738094",
} as const;

// Chart palette and surfaces for code that draws charts (SVG, canvas, or a
// chart library). Mirrors src/styles/tokens.css; keep the two in sync.
//
// Categorical order is FIXED and validated for colorblind separation on the
// light card surface. Assign series in this order and never cycle past six:
// a seventh category folds into "Other" or becomes a separate small chart.
// Only the first three are safe for scatter/bubble/map forms (all-pairs).

export const chartSurface = "#f4f7fb"; // light card surface (charts are always drawn inside a card)

/** Prior-period overlay color: neutral, never one of the six series. */
export const priorSeriesColor = "#9aa8b8";

export const chartSeries = [
  "#1677ff", // 1 brand blue
  "#a88900", // 2 brand yellow, dark step
  "#d55181", // 3 magenta
  "#0a8db4", // 4 brand cyan, dark step
  "#d95926", // 5 orange
  "#8178e0", // 6 violet
] as const;

/** Fixed program colors so Army and Veteran never swap hues between charts. */
export const programColors = {
  army: chartSeries[0],
  veteran: chartSeries[1],
  other: "#5b6b7f",
} as const;

/** Sequential ramp, one hue, light → dark. For ordinal use start at index 1. */
export const chartSequential = ["#86b6ef", "#5598e7", "#3987e5", "#256abf", "#1c5cab", "#184f95"] as const;

/** Diverging: cool pole, neutral midpoint, warm pole. */
export const chartDiverging = { neg: "#1677ff", mid: "#c3cfdd", pos: "#d95926" } as const;

/** Status colors are reserved; never use them as a series. Always pair with a label. */
export const statusColors = { good: "#15803d", warn: "#8a5b00", bad: "#c62828", info: "#0f5fd1" } as const;

export const chartChrome = {
  grid: "#dde5ee",
  axis: "#5b6b7f",
  textPrimary: "#182536",
  textSecondary: "#46566a",
  textMuted: "#5b6b7f",
} as const;

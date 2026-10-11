// Starts the 15-minute core sync scheduler when the Node.js server boots.
// Next.js calls register() once per server start. The globalThis guard keeps
// a dev-mode reload from stacking a second interval.

const INTERVAL_MS = 15 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 5 * 1000;

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as { __vcnSchedulerStarted?: boolean };
  if (g.__vcnSchedulerStarted) return;
  g.__vcnSchedulerStarted = true;

  const { runCoreSync, isCoreSyncRunning } = await import("@/lib/sync/core");
  const tick = async () => {
    if (isCoreSyncRunning()) return;
    try {
      const r = await runCoreSync();
      console.log(`[sync] core sync ${r.ok ? "complete" : "finished with problems"}: ${r.phases.map((p) => `${p.phase}=${p.ok ? p.count : "FAILED"}`).join(" ")}`);
    } catch (e) {
      console.error("[sync] core sync failed:", (e as Error).message);
    }
  };
  setTimeout(tick, FIRST_RUN_DELAY_MS);
  setInterval(tick, INTERVAL_MS);
}

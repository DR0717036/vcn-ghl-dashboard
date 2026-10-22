// Starts the server-side schedulers when the Node.js server boots: the
// 15-minute core sync and the one-minute check for the weekly report email
// (which only sends when config/weekly-report.json is enabled and the
// week's send time has arrived). Next.js calls register() once per server
// start. The globalThis guard keeps a dev-mode reload from stacking a second
// interval.

const INTERVAL_MS = 15 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 5 * 1000;
const REPORT_CHECK_MS = 60 * 1000;

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

  const { maybeSendScheduledReport } = await import("@/lib/weeklyReport/send");
  const reportTick = () => maybeSendScheduledReport(new Date()).catch((e: Error) => console.error("[weekly-report] tick failed:", e.message));
  setTimeout(reportTick, FIRST_RUN_DELAY_MS + 10_000);
  setInterval(reportTick, REPORT_CHECK_MS);
}

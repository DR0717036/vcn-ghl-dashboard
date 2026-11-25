// Build gate (owner request 2026-11-25): before `next build`, run the
// reconciliation test against the running dashboard so a build cannot go
// out while the rep pages disagree with the admin Program Submissions
// table. The test needs a running dashboard with data (npm run dev, or
// TEST_BASE_URL); when none is reachable, as on the Railway build machine,
// the gate says so and lets the build continue. Run `npm run check` before
// every deploy: it typechecks and runs the whole suite, this test included.

import { spawnSync } from "node:child_process";

const base = (process.env.TEST_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
let reachable = false;
try {
  const res = await fetch(`${base}/login`, { redirect: "manual", signal: AbortSignal.timeout(3000) });
  reachable = res.status < 500;
} catch {
  reachable = false;
}
if (!reachable) {
  console.log(`reconcile gate: no running dashboard at ${base}, so the rep-vs-admin reconciliation was not run here. Run "npm run check" against a running dashboard before deploying.`);
  process.exit(0);
}
console.log(`reconcile gate: checking the rep pages against the admin table at ${base} …`);
const r = spawnSync(process.execPath, ["--test", "tests/reconcile.test.mjs"], { stdio: "inherit", env: process.env });
if (r.status !== 0) {
  console.error("reconcile gate: the rep pages do not match the admin Program Submissions table. Build stopped.");
  process.exit(r.status ?? 1);
}

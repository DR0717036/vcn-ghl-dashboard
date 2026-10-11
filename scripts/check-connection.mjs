// Connection test: one READ-ONLY call to Go High Level.
// Fetches the pipelines (and their stages) for the location in .env
// and prints only the names. No IDs, no contact data, no writes.
//
// Run with:  node scripts/check-connection.mjs
//
// Source of truth for the endpoint, headers, and Version value:
// HighLevel's official OpenAPI spec (apps/opportunities.json in
// github.com/GoHighLevel/highlevel-api-docs), which backs
// https://marketplace.gohighlevel.com/docs/ghl/opportunities/get-pipelines/
//   GET https://services.leadconnectorhq.com/opportunities/pipelines?locationId=...
//   Headers: Authorization: Bearer <token>, Version: 2021-07-28
//   Required scope: opportunities.readonly

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// --- 1. Read .env (no extra packages needed) ---------------------------
function loadEnv(path) {
  const vars = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

const env = loadEnv(resolve(process.cwd(), ".env"));
const token = env.GHL_PRIVATE_TOKEN;
const locationId = env.GHL_LOCATION_ID;

if (!token) {
  console.error("GHL_PRIVATE_TOKEN is missing or empty in .env");
  process.exit(1);
}
if (!locationId) {
  console.error("GHL_LOCATION_ID is missing or empty in .env");
  process.exit(1);
}
// Never print the token itself. Length only, to confirm it was read.
console.log(`Token loaded (length ${token.length}). Location ID loaded (length ${locationId.length}).`);

// --- 2. One read-only GET call ----------------------------------------
const url = new URL("https://services.leadconnectorhq.com/opportunities/pipelines");
url.searchParams.set("locationId", locationId);

const response = await fetch(url, {
  method: "GET",
  headers: {
    Authorization: `Bearer ${token}`,
    Version: "2021-07-28",
    Accept: "application/json",
  },
});

if (!response.ok) {
  const body = await response.text();
  console.error(`Request failed: HTTP ${response.status} ${response.statusText}`);
  console.error(body.slice(0, 500));
  process.exit(1);
}

const data = await response.json();
const pipelines = Array.isArray(data.pipelines) ? data.pipelines : [];

// --- 3. Print names only -----------------------------------------------
console.log(`\nFound ${pipelines.length} pipeline(s):\n`);
for (const pipeline of pipelines) {
  const stages = Array.isArray(pipeline.stages) ? pipeline.stages : [];
  console.log(`Pipeline: ${pipeline.name}  (${stages.length} stages)`);
  for (const stage of stages) {
    console.log(`  - ${stage.name}`);
  }
  console.log("");
}

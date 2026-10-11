# Veteran Careers Network — GHL Sales Dashboard

Read this file first in every session. Then read `docs/VCN_Build_Brief.md`, which defines every metric, counting rule, and acceptance test. The brief is the source of truth for what gets built; this file is the source of truth for how we work.

## Who you are working with

The project owner has no coding experience. Explain what you are doing in plain language as you go. Before running any command that installs software, changes system settings, or costs money, stop and ask. When you finish a step, say in one or two sentences what changed and what the owner should look at or do next.

## HARD RULE: Go High Level is READ-ONLY

This dashboard only pulls data out of Go High Level. It never writes to it.

You must NEVER, under any circumstances, without the owner explicitly saying yes in this conversation first:

- Create, update, move, merge, or delete contacts or leads
- Create, update, move, or delete opportunities, or change their stage, status, value, or owner
- Create, rename, reorder, or delete pipelines or pipeline stages
- Send, schedule, or reply to any SMS, email, call, or other message to a lead or contact
- Create, update, cancel, or mark attendance on appointments
- Add or remove tags, custom fields, custom values, or notes
- Create, edit, enable, or disable workflows, automations, campaigns, or triggers
- Create, edit, or delete webhooks, integrations, or API tokens in the GHL account
- Call any GHL API endpoint that uses POST, PUT, PATCH, or DELETE, except for the documented search endpoints that use POST purely to read data (for example contact search). If unsure whether an endpoint writes, treat it as a write and ask.

If at any point you believe a write to GHL is needed (including to "fix" a data discrepancy, test something, or make a number reconcile), do not do it. Explain what you want to change and why, and wait for explicit permission. "No silent writebacks" in the brief means exactly this.

When using the `@gohighlevel/api-client` SDK or raw HTTP, build the data layer so that write methods are not even exposed to the rest of the app. A wrapper that only contains GET/search operations is the preferred pattern.

The Private Integration token was created with read-only scopes. If a call fails with a permission error, report it to the owner; do not ask for broader scopes unless a read endpoint genuinely requires it, and say so plainly.

## Secrets

- `GHL_PRIVATE_TOKEN` and `GHL_LOCATION_ID` live only in `.env`, which is git-ignored.
- Never print, log, echo, or display the token. If you need to confirm it exists, report its length or first four characters only.
- Never place the token or any customer data in frontend code, in a public URL, or in a commit.
- Never commit `.env`. Keep `.env.example` up to date with variable names only.

## Access and users

- The dashboard is for the owner plus two team members: `tony@intelagentmedia.com` and `Dante@intelagentmedia.com`.
- It must require login. Only these three email addresses may sign in. Add others only when the owner asks.
- Before deploying anywhere public, confirm authentication is in place and working.

## Data refresh

- Pull from GHL on a 15-minute schedule and cache the results server-side. Do not call GHL on every page load.
- Show "Last successful sync" on every view, as the brief requires.
- Respect GHL rate limits with backoff and retries. Surface partial or failed syncs rather than showing incomplete totals as complete.

## Build order

Follow the brief's priority: mapping screen first, then executive scorecard, the six program milestone metrics, actual-won reporting, and the sales leaderboard. Supporting views come only after core numbers reconcile to GHL.

Build in small verifiable steps. After each step, tell the owner how to run it and what they should see. Do not build the whole dashboard in one pass.

Before relying on any GHL field, endpoint, or webhook payload, verify it against the current official docs at https://marketplace.gohighlevel.com/docs/ rather than from memory. Do not hard-code an outdated API version.

## Accuracy rules (summary — the brief has the full version)

- Never invent, estimate, or backfill a number. Show "unavailable" with a reason instead.
- Count contacts by contact ID, appointments by appointment ID, opportunities by opportunity ID.
- Won means opportunity status = won, not a stage name containing "Won".
- Milestone achievements are events; current stage occupancy is a snapshot. Keep them separate.
- Never sum the three Army (or three Veteran) milestone values and call it total revenue.
- Label dollar amounts "Opportunity Value", never revenue, cash, or commission.
- Keep demo/test data clearly labeled and separate from live data.

## Other integrations

A separate Lovable dashboard already receives a GHL webhook. Leave that webhook and anything related to it alone. Do not suggest removing or replacing it.

## Technical defaults (change only with owner approval)

- Node.js + TypeScript. Next.js for the app with API routes as the server layer.
- SQLite for the local cache and milestone event history (upgrade to Postgres only if deployment requires it).
- Timezone: America/New_York for all reporting.
- Keep dependencies minimal; ask before adding anything beyond the core stack.
- Commit after each working step with a plain-language commit message.

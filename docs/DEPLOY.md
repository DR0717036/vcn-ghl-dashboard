# Deploying the dashboard (Render)

The dashboard runs as one Node web service on Render, defined by `render.yaml`
at the repo root (a Render Blueprint). Hosting moved from Railway to Render on
2026-10-22 after Railway's environment-variable breach (docs/DECISIONS.md #77).

## What the Blueprint sets for you

| Setting | Value |
|---|---|
| Service | `vcn-ghl-dashboard`, Node runtime, region Ohio, branch `main` |
| Build / start | `npm ci && npm run build` / `npm start` |
| Plan | Starter (0.5 CPU, 512 MB) |
| Health check | `/` (an unauthenticated request redirects to `/login`; Render treats 2xx and 3xx as healthy) |
| Node | 24 (`NODE_VERSION=24`, also `.node-version` and `engines` in package.json) |
| Persistent disk | 5 GB mounted at `/data` |
| `DATA_DIR` | `/data` (the SQLite cache lives at `/data/cache.sqlite`) |
| `TZ` | `America/New_York` (all reporting is Eastern) |
| `PORT` | `3000` (Next reads it at start) |

Every push to `main` redeploys. A deploy restarts the server, which interrupts
a sync in progress; the next 15-minute cycle picks up again, and the cache only
ever holds data that re-syncs from GHL.

## What you paste into Render yourself

These are declared in `render.yaml` with `sync: false`, so Render asks for them
when the Blueprint is first created and never reads them from the repo:

| Variable | Where the value comes from |
|---|---|
| `GHL_PRIVATE_TOKEN` | GHL Private Integration token (read-only scopes), from `.env` |
| `GHL_LOCATION_ID` | the GHL location id, from `.env` |
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth client, from `.env` |
| `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth client, from `.env` |
| `AUTH_SECRET` | the value of `AUTH_SECRET_PRODUCTION` in `.env` (never the local `AUTH_SECRET`) |
| `AUTH_URL` | the service's public address, e.g. `https://vcn-ghl-dashboard.onrender.com`, no trailing slash |

Three more are read from the environment for the weekly sales report email
(decision 80, 2026-10-22) and are not in the Blueprint; add them in the host's
Variables panel (Railway today, Render after the move):

| Variable | Where the value comes from |
|---|---|
| `GMAIL_USER` | the Gmail account that sends the report (`info@intelagentmedia.com`), from `.env` |
| `GMAIL_APP_PASSWORD` | that account's app password (Google Account > Security > 2-Step Verification > App passwords), from `.env` |
| `ANTHROPIC_API_KEY` | the Anthropic key for the report's narrative, from `.env`; optional, the email goes out numbers-only without it |

Two schedules live in `config/weekly-report.json`: the Sunday report
(`enabled`, on since 2026-10-24) and the Wednesday midweek check-in
(`midweek.enabled`). Previews and test sends work as soon as the two Gmail
variables exist (`/api/admin/weekly-report`, signed in as the owner), and
`/api/admin/weekly-report?action=check` confirms on the host, without sending
anything, that Gmail accepts the credentials, the Anthropic key answers, both
schedules and their next send times, and the once-per-week guard. The Mapping
page shows the same schedules and the send log.

## First deploy, step by step

1. In Render: New → Blueprint, pick the `DR0717036/vcn-ghl-dashboard` repo,
   branch `main`. Render reads `render.yaml` and prompts for the six values
   above. Paste them from `.env` (copy and paste; never type them into chat).
2. After the service exists, copy its public address from the Render
   dashboard. Set `AUTH_URL` to it if the prompt happened before you knew it.
3. In Google Cloud Console → the OAuth client → Authorized redirect URIs, add
   `https://<that address>/api/auth/callback/google`. Sign-in fails with a
   `redirect_uri_mismatch` error until this is done.
4. Wait for the first deploy (about five minutes), open the address, and sign
   in with Google. The first sync starts a few seconds after boot; on an empty
   disk it loads the full history from GHL and can take 30 to 60 minutes.
   "Last successful sync" on every page shows when it finished.
5. Bring the event history across. The cache on the new host starts empty, so
   milestone, assignment, and opportunity history recorded on the old host
   (or on the owner's PC, which holds the same history) is merged in through
   the login-protected import route (`/api/admin/import-history`, commit
   5343e6a) once the first sync has finished. That merge never duplicates
   events.
6. Once the Render copy shows the same numbers as the old host, switch any
   bookmarks, then delete the Railway service so nothing keeps running there.

## Checking on it later

- The Mapping page shows the automatic sync runs, cache size, free disk, and
  the integrity check of the cache file.
- Render → the service → Logs shows `[sync]` lines for every phase and the
  plain-English reason for any failed phase.
- The disk is 5 GB; the Mapping page warns when free space runs low.

## Verified locally before the move (2026-10-22)

With a production build, `PORT=3456` and `DATA_DIR` pointing at an empty
folder: the server listened on 3456, created `cache.sqlite` with its `-wal` and
`-shm` companions (journal mode `wal`), answered `/login` with 200, `/` with a
307 redirect to `/login`, and API routes with 401 when signed out, and the
scheduler started its first sync five seconds after boot and recorded the run.

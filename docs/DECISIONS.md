# Owner decisions log

Decisions made by the project owner that are not derivable from the code or
the build brief. Newest at the bottom. Each entry has the date it was decided.

## 2026-10-11 — Pipeline and stage interpretation (after first connection test)

1. **"Supervisor Approval (5 days)"** in the Army CA Pipeline means
   *awaiting* supervisor approval, not approved. The milestone metric is
   labeled **"Awaiting Supervisor Approval"** everywhere it appears.

2. **"IAU App Signed (FS2)"** in the Veteran G.I. Bill pipeline is *not* one
   of the six milestone metrics. It is excluded from the milestone cards and
   the leaderboard milestone columns, but included in program funnels and
   current-in-stage counts.

3. **"Intelagent Partner Inquiry"** is not a program pipeline. It is excluded
   from the Army and Veteran scorecards. It is included only in the
   **"Entire CRM"** won-opportunity total, and that total's scope label must
   say it includes this pipeline.

## 2026-10-11 — Login method

4. **Sign in with Google** is the login method. The owner confirmed
   intelagentmedia.com runs on Google Workspace. Only the three allowed
   addresses in CLAUDE.md may sign in. Requires a one-time Google Cloud OAuth
   client set up by the owner (free). Until it is wired in, the app runs
   locally only and the sync endpoint refuses to run in production mode.

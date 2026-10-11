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

## 2026-10-11 — Reporting groups, classification tags, calendars (after first mapping sync)

5. **Fiscal year comes from contact tags.** The `fy27` contact tag is the
   reliable marker for which fiscal year a CA 101 / Supervisor Approval
   contact belongs to; `fy26` works the same way for FY26. The FY27 rule for
   those two Army stages is now **verified**. "Won/Submitted (Fy 27)" carries
   its year in the stage name. Contacts in an Army milestone stage with no
   fy tag are reported as unclassified, never assumed FY27.

6. **Army / Veteran classification** uses the `army` and `veteran` contact
   tags. Buckets are mutually exclusive: Army, Veteran, Both / Needs Review
   (both tags), Untagged (neither).

7. **All calendars count** toward appointment metrics, active or inactive.
   No calendar is excluded.

8. **Mapping page scope.** It is an admin page, not for the team: no custom
   fields section, only the mapped tags listed (with total tag count), no
   further styling effort.

## 2026-10-11 — Branding and design system (proposed, pending owner review)

9. **Intelagent Media branding, not VCN.** Tokens were extracted from the
   live site stylesheet (intelagentmedia.com, `:root` block) rather than
   chosen by eye:
   - Dark-first. Page background obsidian `#05080D`, elevated `#071426`,
     cards deep-navy `#0C1D33`, raised `#13263D`, borders `#223750`.
   - Text: white headings at weight 800 with -0.03em tracking; body
     light-gray `#B8C2CF`; secondary `#93A1B2`; muted `#738094`.
   - Accents: blue `#1677FF`, cyan `#19C6F4`, yellow `#FFD51F`, and the
     site's blue→cyan gradient. Primary button is yellow with dark text.
   - Font: Manrope (400–800), self-hosted through Next.js so no request to
     Google Fonts leaves the page.
   - Radii: buttons 8px, cards 14px, large 18px. Spacing on a 4px grid.
     Content width 1320px.
   - Hierarchy: numbers big (36px, tabular figures), labels small (12px,
     bold, uppercase, tracked), matching the site's kicker style.
   - Chart palette (fixed order, validated for colorblind separation and
     3:1 contrast on the card surface): blue `#1677FF`, yellow-dark
     `#A88900`, magenta `#D55181`, cyan-dark `#0C9FCB`, orange `#D95926`,
     violet `#9085E9`. Army is always slot 1, Veteran always slot 2. The
     UI yellow and cyan are too bright for chart marks on dark, so charts
     use darker steps of the same hues. Status colors (good/warn/bad) are
     reserved and never used as a series.
   - Files: `src/styles/tokens.css`, `src/styles/base.css`,
     `src/lib/design.ts`. One shared system; pages define no colors or
     fonts of their own.
   - Status: written but not yet switched on. Applying it is a one-line
     change in the root layout once the owner approves the summary.

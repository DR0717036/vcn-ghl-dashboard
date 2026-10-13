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

## 2026-10-13 — Edits round 1: global look, header, Primary KPIs, goals

10. **Light cards on the dark page.** The first scorecard was hard to read
    (dark text on dark navy). Cards, the status bar, and the range picker
    now use the site's "Soft Slate" light surfaces (#F4F7FB card, #FFFFFF
    raised, #E4EAF1 inset, #D0D9E4 borders) with dark text (#182536
    headings, #2F3F52 body, #46566A secondary, #5B6B7F muted). The page
    itself stays obsidian. Every text token has a dark-page value and a
    light-card value, applied automatically by the card classes, so no
    component sets its own color. Root cause of the unreadable text was a
    token name collision (`--text-body` declared as both a color and a font
    size); the font size is now `--fs-body`.
11. **Section headings** ("Primary KPIs", "Program milestones", …) use the
    Intelagent yellow (#FFD51F) on the dark page. Headings inside cards
    stay dark.
12. **Header** shows the VCN logo (public/vcn-logo.png, 44px circle on a
    white disc) left of "VCN Sales Dashboard", keeping the "by Intelagent
    Media" gradient mark. The logo is also the browser tab icon.
13. **Chart palette re-validated on the light surface.** Order unchanged;
    two steps darkened so every series clears 3:1 on white: cyan-dark is
    now #0A8DB4 (was #0C9FCB) and violet #8178E0 (was #9085E9). Grid
    #DDE5EE, axis text #5B6B7F. A neutral gray (#9AA8B8) is reserved for
    prior-period overlays and is never a series color.
14. **Goals are rates, scaled to the elapsed period** (config/goals.json,
    owner decision 2026-10-13). Per rep per day: Calls Made 100, Talk Time
    2 hours. Per rep per week: Appointments Booked 7, Appointments Completed
    (showed) 4, Appointments Confirmed at least 4, Program Submissions
    (CA 101 + IAU App Submitted FS2) 5. Team-wide per week: Total Leads
    Assigned 200, New Leads 200. The six sales reps live in
    config/sales-reps.json (Michael Nieves, Miguel Torres, Isabela Estrada,
    William Bobier, Sam R., Anthony N.), matched to GHL users by email; the
    team version of a per-rep goal is the rate × 6. Everyone else counts in
    team totals but not in rep goals. For a selected range the goal is
    rate × reps × days in the period (weekly rates pro-rated by 7); the
    pill compares the value with that goal scaled to the elapsed time:
    **Met** = at or above the full-period goal, **On Track** = at or above
    the elapsed-portion goal while the period is still running, **Missed**
    = below it. A finished period can only be Met or Missed. Appointments
    Confirmed is a stage snapshot, so it is compared with the full weekly
    team goal (24) without scaling. No goal (and no pill) on Appointments
    Cancelled, FS1 Application Submissions, Awaiting Supervisor Approval,
    the individual CA 101 and IAU App Submitted cards, the six program
    milestone cards, and the won totals.
15. **Date math bug fixed (2026-10-13).** The New York wall-clock helper
    over-corrected the UTC offset, so every day boundary sat 8 hours late
    (midnight came out as 8 AM Eastern) and multi-day ranges skipped days.
    All period counts shown before this fix (including the stage 1–4
    numbers reported on 2026-10-11/13) used those shifted boundaries and
    should be re-read now. Verified: Today/Yesterday/This Week/Last Week/
    This Month/Last Month/This Year start at Eastern midnight, weeks have
    7 days, October has 31, and the DST edges (Mar 8 and Nov 1, 2026)
    resolve correctly.
16. **Prior-period overlays** on the Calls Made and Talk Time charts use the
    scorecard's comparison period (same length, same elapsed portion),
    aligned day for day (hour for hour on a one-day range). When the range
    is This Week or Last Week that is exactly the prior week.
17. **Cancellation time.** GHL does not store when an appointment was
    cancelled. The Appointments Cancelled card uses the appointment's
    last-updated time as the cancellation time and also shows the same
    cancelled appointments counted by scheduled start and by booking date.
18. **FS1 submissions are event-tracked.** "IAU App Submitted (FS 1)" was
    added to the tracked stages for the KPI card only (not a program
    milestone card). The 35 opportunities sitting in that stage were
    backfilled as baseline events dated by GHL's stage-entry time
    (Jun 30 – Aug 28, 2026); earlier pass-throughs are unknown.

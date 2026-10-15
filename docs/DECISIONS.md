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

## 2026-10-13 — Edits round 2: Primary KPIs layout and visual polish

19. **One card anatomy** for every Primary KPI card (src/app/KpiShell.tsx):
    title and one-line subtitle; big number with the status pill on the
    same line at the right; one goal line ("Goal 4,200 · 12% of goal ·
    986 by now"); one change-vs-prior line; an optional chart area at a
    fixed 236px; and a collapsed "Details" toggle holding the breakdown
    tables and "How this is counted". Long lines are truncated with an
    ellipsis and carry the full text as a tooltip, so nothing wraps and
    cards in a row stay aligned. Rows are CSS grids with stretched items,
    never a masonry flow. Charts render at the card's measured width and a
    fixed pixel height, so axis text never stretches.
20. **Row order:** Leads (Total Leads Assigned, New Leads) · Activity
    (Calls Made, Talk Time, with charts) · Appointments (Booked,
    Completed, Confirmed, Cancelled) · Submissions (Army CA 101,
    Awaiting Supervisor Approval, FS1 Application Submissions, each with
    the two-axis chart; then the full-width Program Submissions table).
    Each row has an eyebrow sub-heading (short rule + small caps).
21. **Alternating bands** like intelagentmedia.com: the page title sits
    on the dark hero; sync bar, range picker and Leads on a light band
    (#E4EAF1 ground, white cards, dark text); Activity on a dark band;
    Appointments light; Submissions dark; the rest of the page continues
    on dark. Dark-band cards use the site's gradient card (135° from
    #0F2342 through #091730 to #060D19, 1px #223750 border, 14px radius).
    Every text, border, status, and chart token has a dark-band value, so
    the same components and charts read correctly on both surfaces; the
    chart palette was validated on both. The yellow eyebrow becomes the
    dark gold step (#7A6200) on light bands, where pure yellow is
    unreadable.
22. **Spacing:** 24px gutters between cards, 28px padding inside, 64px
    band padding top and bottom, 36px headline numbers everywhere.

## 2026-10-13 — Edits round 3: control bar, row order, FS2 card, card titles

23. **No page title block.** The scorecard starts directly under the header.
24. **Sticky glass control bar** (src/app/ControlBar.tsx) holds the sync
    details (one small-text line) and the date-range picker (second line).
    It is pinned under the header, which is now sticky too. Style: a 14%
    white layer over a dark translucent base with a 24px backdrop blur,
    a thin translucent border, 18px radius, and an inner highlight. The
    bar watches which band is scrolling beneath its bottom edge and
    switches to a light glass with dark text over light bands; over the
    dark page and the white cards further down it stays dark glass with
    light text. Both cases were checked in screenshots. (Pure 10–15%
    white alone was unreadable once white cards scrolled beneath it,
    hence the dark base.)
25. **Row order:** Submissions (dark) · Activity (light) · Appointments
    (dark) · Leads (light). "Primary KPIs" is an eyebrow above the
    headline-sized yellow "Submissions" heading; the other rows keep
    eyebrow headings.
26. **FS2 replaces FS1 on the KPI row.** The third submissions card is now
    "FS2 Application Submissions": contacts reaching "IAU App Submitted
    (FS2)", reporting group FS2, the current semester. FS1 stays in
    config as a tracked historical group (its events keep accumulating)
    with no card.
27. **Card titles** on every KPI card are 17px, bold, title case, in the
    yellow accent (#FFD51F on dark cards, the dark gold step #7A6200 on
    light cards where yellow is unreadable). The combined Program
    Submissions title is headline-sized (20px). In its table the Rep goal
    column is right-aligned and the Status column has a fixed width with
    left padding.
28. **Round 4 control bar.** 20px gap under the header, 24px padding
    inside, 16px between the sync line and the range row, 8px between
    range buttons. "Timezone" and "Tracking since" are gone from the bar
    (the timezone stays America/New_York; "Tracking since" is still on
    the mapping page).
29. **"Primary KPIs" is a centered, white, H1-sized page title** at the
    top of the Submissions band; the "Submissions" row heading is white
    at headline size. The other rows keep their small yellow eyebrows.
30. **Card motion.** Every KPI card renders with a `reveal` class
    (opacity 0, 14px low) and `src/app/Reveal.tsx` adds `is-visible`
    when it enters the viewport (400ms fade and drift, 90ms stagger per
    position in its row). Hover lifts a card 3px, brightens its border,
    and adds a blurred brand-blue glow over 150ms. Reduced motion turns
    both off; with scripting unavailable, cards show immediately. The
    reveal offset uses the `translate` property and the hover lift uses
    `transform`, so the two never fight.
31. **Program Submissions (combined) table.** The headline shows contacts
    and the team's Opportunity Value side by side (sum of the two parts'
    opportunity values at event time), with the status pill at the
    right. "Johnny M" has his own named row after the six reps and
    before "Other users": matched on his GHL display name in
    `src/lib/submissions.ts` (NAMED_NON_REPS), not in
    config/sales-reps.json, with no rep goal or status. The table uses
    fixed columns (name 300px, numbers 124px, rep goal 172px, status
    takes the rest) so numbers sit next to the names; 52px rows, zebra
    striping, 16px tabular numbers, Combined bold and white, thin 7%
    white dividers, reps sorted by Combined descending, team total
    pinned last.
32. **Round 5 drilldowns.** The three Submissions KPI cards and every rep
    row in Program Submissions (combined) open one shared modal
    (`src/app/Drilldown.tsx`): title, the card's count/value/status line,
    the same two-axis chart at full width, a sortable contact table,
    "How this is counted", and "Download CSV" (exactly the rows shown, in
    the order shown). Esc, the close button, and a click outside close
    it. Those three cards no longer have an inline Details expander, so
    their height never changes.
33. **Drilldown data stays server-side and read-only.** GET
    /api/drilldown builds rows from the cache with the same firstEvents()
    selection the cards use (one row per contact), so a KPI modal's row
    count equals the card and the rep modals add up to the team total.
    Email and phone are not in the sync; they come from GHL GET
    /contacts/{id} for only the listed contacts and are kept in
    contact_details for 15 minutes. Missing fields show a dash. Like the
    sync route, the endpoint is disabled in production until login
    exists, because it returns personal data.
34. **Column meanings.** Assigned user is the opportunity owner at the
    time of the event (the credited user); Stage is the opportunity's
    current stage; Opportunity Value is the value at the event. The GHL
    link is app.gohighlevel.com/v2/location/{locationId}/contacts/detail/
    {contactId}; a white-label domain can be set with GHL_APP_BASE_URL.
    "Other users" in a drilldown means the same set as the table row:
    not a configured rep and not a named row, including unassigned.
35. **Round 6 reps and goals.** Seven reps in config/sales-reps.json,
    matched by GHL user id, each with kpiMultiplier (Sam R. 0.5, all
    others 1.0), monthlyQuota (20; Sam 12), commissionPlan, and optional
    goalOverrides (Sam: programSubmissions 3 per week). Every per-rep
    goal rate is base × multiplier or the override, and the team goal is
    the SUM of each rep's goal (combined submissions 33 per week today),
    so it updates when reps or multipliers change. Johnny M is now a rep;
    the separate named row from round 4 is gone. The only submissions
    goal is Program Submissions (combined); the Army CA 101, Awaiting
    Supervisor Approval, and FS2 cards never carry a goal.
36. **Commission estimates** live in config/commission.json (every rate
    and threshold) and src/lib/commission.ts. Always month-to-date for
    the current calendar month regardless of the selected range. Won =
    status won, first won transition once per opportunity id, Army CA or
    Veteran G.I. Bill pipeline, credited to the owner at the won event
    (the same query the Won section uses). Plans: submission-retro ($75
    per combined submission, $100 retroactively at 21+), per-won-flat
    ($250 per won), won-tiered ($500 for the first 13 won, then $250).
    Shown as estimates; the official calculation happens outside the
    dashboard.
37. **Program Submissions table** gained Monthly quota ("5/20": green at
    100%+, yellow 50–99%, red below 50% once more than half the month
    has elapsed, otherwise neutral), Won (MTD), and Est. commission with
    a plan label. The team total row is brand gold and bolder, sums the
    commission as "Total est. commission (MTD)", and the same total is
    repeated under the table in large text. Rep drilldowns show quota,
    won, and commission in the header, and won-based reps (and Other
    users) get a second table of the won opportunities counted. Drilldown
    tables use 56px rows, 16px cell padding, 14px text, lighter dividers.
    Reconciled: rows = Combined per rep, quota MTD = Combined with This
    Month, won table = Won (MTD) per rep, rep modals sum to the team
    total.
38. **Round 7: commission follows the selected range.** Est. commission
    is the commission earned on the submissions or wins inside the
    selected date range, each event priced by its place in its own
    calendar month: a submission pays the retro rate when the rep's
    submissions in that month, through the end of the range (or now for
    an open range), reach the threshold; a won pays the first-tier rate
    when it is among the rep's first N wons of that month by won date;
    flat plans pay per won. Ranges that span months are priced month by
    month. The sub-label shows the calculation ("8 × $100 (retro)",
    "4 won × $250", "1 × $500 + 2 × $250") instead of a plan name. The
    column is "Est. commission (selected range)" with a header tooltip
    describing the three plans; the team total and the standalone figure
    read "Total est. commission · <range>". Monthly quota and Won (MTD)
    stay month-to-date, and the rep drilldown header shows both the
    range commission and the month-to-date commission. Verified: This
    Month equals the previous month-to-date figures for every rep;
    Today and Yesterday equal that day's events priced per plan.
39. **Round 8 (owner "edits round 7") layout and chart style.** Content
    width is 1600px with 32px side padding, applied to the header, the
    sticky glass bar, every band, and the lower page. The Submissions
    row is two rows of two half-width cards: Army CA 101 Submissions ·
    Awaiting Supervisor Approval, then FS2 Application Submissions · FS2
    Accepted (new: contacts reaching "IAU App Accepted (FS2)", group
    FS2, no goal, same anatomy and drilldown; its modal reconciles with
    the card). Program Submissions (combined) stays full width. Line
    charts use monotone cubic (Fritsch–Carlson) smoothing, which never
    overshoots between points or dips below zero, 2.5px lines, hollow
    markers, 260px plots on the four cards (360px in the modals); the
    Calls Made chart is smoothed too and keeps its dashed muted prior
    overlay.
40. **Round 9 (owner "edits round 8") Rep Call Activity.** The Activity
    heading is headline-sized. A full-width card under Calls Made and
    Talk Time lists every configured rep (sorted by dials), an "Other
    users, not sales reps" row (including calls with no user), and a
    gold team total. Dials = outbound human call attempts, one per call
    id, automated/campaign calls excluded (= the Calls Made card's
    Outbound line). Talk time = recorded duration of completed/answered
    human calls in either direction (= the Talk Time card). Avg talk per
    call = talk time ÷ connected calls. First call (avg) = the rep's
    first outbound attempt on each New York day with any outbound call,
    averaged over those days only. Goal pills use each rep's own
    calls-per-day and talk-time goals (Sam at 0.5). Clicking a row opens
    the user's calls (contact, direction, outcome, duration, time) with
    sorting and CSV, plus a per-day table of dials, talk time, and first
    outbound call. Reconciled: team dials = Calls Made Outbound, team
    talk = Talk Time card, per-day dials = row dials for every row.
    Note: the rep table judges dials (outbound only) against the calls
    goal, so its "% of goal" is slightly below the Calls Made card,
    which counts inbound attempts too.
41. **Round 10 (owner "edits round 9") answered calls and recordings.**
    The Rep Call Activity table shows "Answered / Dials · %": answered =
    outbound human call with status completed or answered and duration
    > 0 (busy, no-answer, failed, voicemail excluded); GHL cannot tell a
    human pickup from an answering machine, so answered means connected.
    The call drilldown gained an Answered column ("Yes · completed",
    "No · voicemail", "n/a · … (inbound)"), an All / Answered / Not
    answered toggle, the answered count checked against the table row,
    Answered in the CSV, and a Recording column. Recordings: GET
    /api/recording?id=<message id> streams the audio from GHL's
    documented recording endpoint (GET /conversations/messages/{id}/
    locations/{locationId}/recording, Version 2021-04-15) with the token
    kept server-side; verified 2026-10-14 that the existing token
    returns audio/x-wav for connected calls using the message id (altId
    is rejected) and HTTP 422 when no recording exists, so no scope
    change was needed. Nothing loads until "Load recording" is clicked;
    the id must be a human call in the cache; the route is disabled in
    production until login exists; recordings are never put in the CSV.
42. **Hourly chart labels (bug fix, 2026-10-15).** Investigation: hour
    buckets were already grouped in America/New_York (raw timestamps
    landed in the right New York hour key), and the cache was fresh (the
    newest call was 4 minutes older than the last sync), but each hourly
    label was produced by formatting the bucket's hour number as a UTC
    instant in New York time, so every label printed five hours early
    ("7 PM" for the midnight bucket, "1 PM" for 6 PM). Labels are now
    built from the New York key itself (hour → "12 AM" … "11 PM"; day →
    "Oct 15" via a UTC formatter), which fixes every hourly and daily
    chart at once (Calls Made, Talk Time, the four submissions charts and
    their modals, New Leads). Hour keys are de-duplicated across the
    daylight-saving fall-back hour. Verified: the Calls Made per-hour
    series sums to the card for Today, Yesterday, and This Month; Today
    runs 12 AM to the current New York hour; First call (avg) values
    were never affected and are unchanged.
43. **Call outcomes (2026-10-15).** Each outbound dial gets one outcome:
    Conversation = GHL status completed with recorded duration ≥
    callOutcomes.conversationMinSeconds in config/goals.json (default
    60), estimated by duration because GHL marks human pickups and
    undetected answering machines alike as completed; Short pickup /
    likely machine = completed but shorter; Voicemail = status voicemail;
    No answer = no-answer or ringing; Failed = failed or busy; anything
    else (null, initiated, in-progress) is "Other / unknown status",
    shown only when non-zero. When a call's legs disagree, a connected
    leg wins (src/lib/callOutcomes.ts). The Rep Call Activity main column
    is "Conversations / Dials · %"; the five-way split appears in each
    rep's drilldown (header facts, an outcome filter with counts, an
    Outcome column with the raw status, and in the CSV) and in the card's
    Details. Talk time is unchanged. Reconciled: modal Conversation rows
    = table figure and outcomes sum to dials for every row; team dials
    and talk time still match the Calls Made and Talk Time cards. First
    look at the data: outbound calls never carry a voicemail status in
    this account, so machines show up as short completed calls (about
    73% of dials this month at the 60s threshold; 11% are conversations).
44. **"Conversations / Connected / Dials" (2026-10-15).** The Rep Call
    Activity main column shows three figures ("70 / 954 / 1,123") with
    both rates beneath: conversation rate = conversations ÷ dials, answer
    rate = connected ÷ dials, where connected = conversations + short
    pickups (every completed call, machines included). The rep drilldown
    header shows the same three figures and both rates. Reconciled
    against the modals for every row.
45. **Best times to call heat map (2026-10-15).** Weekday (Mon–Sun) ×
    hour (America/New_York) grid of outbound dials, in every rep's call
    drilldown below the call list and, team-wide, in the Rep Call
    Activity card's Details. Each slot is colored on a single-hue
    sequential scale (brand blue at rising opacity, so it reads on light
    and dark surfaces) by conversation rate, connected rate, or dial
    volume (toggle); a second toggle switches between the selected range
    and the last 90 days. Slots with no dials are empty; slots under
    callHeatmap.minDials (config/goals.json, default 5) are hatched and
    excluded from the top-3 list. The shown hour window is
    callHeatmap.startHour–endHour (default 7 AM–8 PM, inclusive); dials
    outside it still count in totals and the footer says how many. Cell
    tooltip: "Tue 10 AM · 9 conversations / 41 dials · 22%". Reconciled:
    cell dials, connected, and conversations sum to each row's figures
    for the selected range, and the team grid's footer matches the team
    total.
46. **"How this is counted" style (2026-10-15).** Every note is a plain
    string in one of three shapes, rendered by src/app/Notes.tsx on all
    cards, modals, the program milestone cards, and the Won section:
    "Term — explanation" (bold term, dash, text), "Limitation: …"
    (gathered into one italic Limitations line at the end, each
    sentence capitalized), or plain text. Bullets that explained several
    terms were split (Conversation, Short pickup, Voicemail, No answer,
    Failed each have their own line). Lists use 15px text at 1.6 line
    height, 12px between items, lines capped near 90 characters, and
    flow into two columns past six items on screens 1000px and wider.
    Text is the lighter secondary gray on dark surfaces (#aab6c4 on the
    navy modal, about 8:1) and #46566a on white cards (about 7.5:1),
    with terms in the surface's primary color. The long "GHL cannot
    distinguish…" caveats now appear once, in Limitations.
47. **Note labels in yellow (2026-10-15).** The bold term at the start of
    each "How this is counted" / Details bullet, and the "Limitations"
    label, use the brand yellow on dark surfaces (#ffd51f) and the dark
    gold step (#7a6200) on light cards via --accent-yellow-text; the
    limitation text itself stays italic gray.
48. **Note labels back to white (2026-10-15).** Decision 47 reversed at
    the owner's request: term labels and the "Limitations" label use the
    surface primary color again (white on dark surfaces, near-black on
    light cards); the Limitations label stays upright while its text is
    italic gray.
49. **Conversations section, stage 1 (2026-10-15).** Verified against the
    official docs and live data (read-only): the conversation search
    (GET /conversations/search, Version 2021-04-15) returns unreadCount,
    lastMessageDirection, lastMessageDate (epoch ms), lastMessageType,
    assignedTo, lastManualMessageDate, lastOutboundMessageAction, tags,
    and a per-row sort token for paging; the message export carries
    source (workflow / app / none for inbound) and userId but NO
    workflow, campaign, or template id anywhere (export or per-
    conversation messages); workflows can be listed read-only (72) but
    cannot be linked to a message; the location has no saved templates
    (templates endpoint returns none), so "templates" are clusters of
    normalized outbound text. All scopes needed are already on the token.
    Two new sync phases: messages (SMS + email export since HISTORY_START,
    checkpointed per page; ~142k rows on first load, ~20 minutes) and a
    conversations snapshot (every unread, inbound-last conversation,
    replaced each sync). The HTTP wrapper now times out a stalled GHL
    request after 90 s and retries (a stalled export had hung the first
    run). Cards: Stale Conversations (snapshot: unread + inbound-last +
    older than staleAfterMinutes, per assigned user, Unassigned row, other
    users, team total; drilldown with channel, last inbound preview,
    waiting time, GHL link) and Response Time by Rep (inbound episodes =
    consecutive inbound SMS/email until the next human outbound; business
    minutes only, Mon–Sat 7 AM–8 PM New York by default; median, average,
    % replied within 60 business minutes; rep = replier, else last
    outbound user before the episode, else Unassigned). Settings live in
    config/conversations.json. Message bodies are stored only in the
    local cache and appear only inside drilldowns. Reconciled: stale rows
    sum to the team total and match the cache; every stale and response
    drilldown equals its table row.

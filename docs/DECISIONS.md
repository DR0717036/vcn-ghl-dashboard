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
50. **Conversations section, stage 2 (2026-10-15).** Four more cards in
    the Conversations band, all on the selected range and all read-only
    from the local message cache. Attribution is BEST MATCH: a template
    is the first ten words of an outbound message after lower-casing and
    removing URLs, numbers, punctuation, HTML, and the contact's name;
    one-off texts typed by a rep (fewer than 3 sends of the same
    opening) are grouped as "Manual messages"; media-only sends as "No
    text". A reply is attributed to the most recent outbound in the same
    conversation within replyWindowDays. "Sent by" comes from GHL's
    message source (workflow vs app); GHL does not expose which workflow
    sent a message, so workflow names are not shown. Opt-outs and
    Interest replies: whole-word keyword matches on inbound SMS/email
    (config/conversations.json; a keyword written in capitals such as IT
    is case-sensitive, because the bare word "it" matched 166 ordinary
    replies), one per contact, split Army/Veteran/Both/No tag, ranked
    by template with sends and rate, drilldown to contacts and their
    message. Reply rate by template: sends, replies (first inbound after
    the send within the window and before the next outbound), reply,
    opt-out, and interest rates, Army and Veteran splits; the 25 largest
    templates are listed and the rest summed into one row. Inbound by
    channel: SMS, email, inbound human calls, other, with shares,
    after-hours share, and median time to first reply in business and
    clock time. Template labels are built only from the normalized text
    (never a raw message), duplicates are numbered "(variant n)", and
    message text appears only in drilldowns. Reconciled: opt-out and
    interest contacts in the drilldowns equal the card counts, template
    rows (plus the summed remainder) equal the card totals, every
    template drilldown equals its row, reply-rate totals equal the row
    sums, and channel rows add up.
51. **Workflow names on the template cards (2026-10-15).** GHL records no
    workflow on a message, so names come from an owner-maintained map,
    config/workflow-templates.json: each entry pairs a template's opening
    words (as the cards show them) with the workflow's name; the cards
    match on "starts with", longest entry wins. The file was pre-filled
    with the 60 largest workflow-sent templates (sends, channels, dates,
    and a longer opening in a note) with blank names for the owner to
    fill; unmapped templates read "Not mapped yet" and manual rep
    messages "Manual (rep), no workflow". The Opt-outs card shows an
    Opt-out level pill (High red / Medium orange / Low green) and the
    Interest card an Interest level pill (High green / Medium orange /
    Low red) against thresholds in config/conversations.json
    (optOutRateLevels 2.5% / 1%, interestRateLevels 2% / 1%). The
    Workflow column replaces Sent by on all three template cards.
52. **Workflow map filled from the owner's template list (2026-10-15).**
    config/workflow-templates.json now holds the owner's 18 templates
    with their workflow names (Tier 1–6 *Army, Tier 1–7 *Veteran,
    Appointment Confirmation + Reminder, Applied for GI Bill). Entries
    are the template text as written in the workflow; the matcher
    normalizes it like a sent message and treats {{contact.first_name}}
    as a removed name and {{user.first_name}} as any one word, because
    sent messages carry the rep's name. About 30% of this month's
    workflow sends map to a name; the rest are email campaigns and SMS
    templates not in the list, which show "Not mapped yet" until added.
    The email normalizer now decodes a double-escaped "&amp;lt;" before
    stripping tags.
53. **Reply rate split by channel (2026-10-15).** The Reply Rate by
    Template card is now two cards, "SMS Reply Rate by Template" and
    "Email Reply Rate by Template", each covering only its channel's
    sends and attributed replies, with a blue (SMS) or purple (Email)
    top edge and a matching "SMS only" / "Email only" pill. Manual and
    media-only buckets are per channel.
54. **Collapsible reply-rate tables (2026-10-15).** Both reply-rate
    cards keep their table inside a 440px scroll area with a sticky
    header; "Expand full list" shows every row, "Collapse list" returns
    to the scroller. No numbers changed.
55. **Card charts (2026-10-15).** Program Submissions (combined): a
    horizontal stacked bar per rep (CA 101 in Army blue, IAU App FS2 in
    Veteran gold), sorted by Combined, with a thin yellow marker at the
    rep's pro-rated goal and "name · total" at the end of the bar; the
    team total is not charted. Opt-outs and Interest replies: a 160px
    donut of the top five templates plus Other with the contact total in
    the center and a legend with name (workflow name when mapped), count,
    and rate. Response Time by Rep: horizontal bars of median business
    minutes, fastest first, green under 15, yellow under 60, red at or
    above (config/conversations.json responseLevels), a dashed line at
    the 60-minute target, reps without a median omitted. All charts are
    inline SVG at a fixed 220px, use the shared palette, and carry a
    data-check attribute; reconciled against their tables.
56. **Chart fixes and email tiles (2026-10-15).** Program Submissions now
    uses a vertical grouped bar chart (CA 101 Army blue, IAU App FS2
    Veteran gold per rep, sorted by Combined) with value labels above,
    names below (abbreviated when narrow), a short yellow tick per group
    at the pro-rated goal, a 0-based integer y axis, and a tooltip kept
    inside the card. Response Time bars scale so the longest reaches
    about 85% of the width; the 60-minute line is drawn where it falls or
    pinned at the right edge with an arrow when every median is under it.
    Email Reply Rate gained four stat tiles for the selected range:
    Emails sent (equals the table total); Bounced, Delivery rate, and
    Opt-out rate are "unavailable" with the reason, verified against the
    docs and the data: GHL's export leaves 99.9% of this account's
    emails at status "sent" (31 delivered and 24 failed out of 54,000
    all-time, never "bounced" or "opt_out"), and contacts carry no email
    DND entry or opt-out date. Nothing is estimated.
57. **Submissions chart marker and tooltips (2026-10-15).** The pro-rated
    goal marker is a short dashed light-gray line. Chart tooltips on the
    grouped-bar and horizontal-bar charts render in a portal on
    document.body with position: fixed and flip left/up near the
    viewport edges, so no card or chart box can clip them; the portaled
    tooltip carries its own dark-card colors.
58. **Email template drilldown (2026-10-15).** Verified first: GHL's API
    exposes no delivery, open, click, bounce, unsubscribe, or spam
    figures for this account's emails (the export keeps them at status
    "sent"; GET /emails/schedule and GET /campaigns are empty because the
    emails are sent by workflows; workflows expose only id/name/status;
    no scope is missing). Template HTML IS readable: GET /emails/builder
    lists 50 templates with a signed previewUrl serving the rendered
    HTML, so a new sync phase (emailTemplates) caches name, folder path,
    HTML, and a normalized text key, refetching only when lastUpdated
    changes. The four stat tiles were removed; each Email Reply Rate row
    opens a modal with the template name, mapped workflow (and the
    matched builder template), sends; a stats row where Delivered,
    Opened, Clicked, Soft/Hard bounced, Unsubscribed, and Spam read
    "unavailable in API" with a "View in GHL" link to the marketing
    emails page, and Replied is computed; a daily sends/replies chart; a
    sandboxed iframe preview (no scripts, forms, or non-image requests;
    HTML sanitized server-side with a CSP) of the builder template whose
    rendered text opens like the cluster (name match preferred, at least
    six opening words required), else the latest send's body labeled
    "preview from last send"; the subject of the latest send read with a
    narrow export; and How this is counted. Message content is served by
    GET /api/email-template, disabled in production until login exists.
59. **Email engagement from the single-email endpoint (2026-10-15).** The
    second verification showed GET /conversations/messages/email/{id}
    carries live engagement (delivered, opened, clicked, failed with the
    provider's error text) while the export stays at "sent"; GET
    /emails/schedule stats cover only email campaigns (none here); the
    Workflows API has no steps; the LCEmailStats webhook is limited to
    marketplace apps; the per-contact unsubscription endpoint needs a
    scope this token lacks; the sender is GHL's built-in LC Email
    (Mailgun under GHL's account), so there is no third-party key to
    add. A new emailStatus sync phase reads emails one at a time, four in
    flight, at most 1,200 per run, re-reading the last 14 days every 6
    hours and freezing older ones as final; a workflows phase caches
    workflow names. The Email Reply Rate table gained Delivered (of
    sends), Opened (of delivered), and Bounced (of sends) columns; the
    template modal shows Delivered, Opened, Clicked, Bounced (hard / soft
    / unclassified from the error text), Pending (not yet reported or
    not yet read), Unsubscribed and Spam as "unavailable in API" with
    View in GHL, and Replied, with an "as of" time and the share of
    emails checked. Workflow names: config/workflow-templates.json first,
    else the email builder template whose text opens like the cluster is
    matched to the workflow with the same normalized name (punctuation,
    case, and spacing ignored), shown with a dotted underline as "best
    match by template name"; "Not mapped" only when nothing matches.
    Reconciled on 20 templates: delivered + bounced + pending = sends in
    every modal, and the table columns equal the modal figures.
60. **Appointments row rebuilt (2026-10-17, owner request).** Four status
    cards (Booked, Completed, Confirmed snapshot, Cancelled) show the total
    with Army and Veteran side by side; Army / Veteran come from the
    contact's tags, except on the Confirmed snapshot where they are the
    program pipeline whose stage the contact sits in (the tag split is in
    Details). Goals apply to the total. Each card opens the appointments
    it counted. A Rates card shows show, no-show, cancel, confirm, and
    reschedule rates plus "attendance not yet marked" for Army, Veteran,
    and total. Definitions: show rate = Showed ÷ (Showed + No-show) among
    appointments scheduled in the period; cancel rate = of bookings
    created in the period, the share now cancelled (one cohort, so it
    cannot exceed 100%; the Cancelled card counts by cancellation time, so
    the two numbers can differ); confirm rate = contacts with an
    appointment scheduled in the period whose opportunity sits in
    Appointment Confirmed (VCN) now ÷ such contacts. Rescheduled uses
    GHL's rescheduledAt stamp, present on 404 of 2,503 cached
    appointments (the owner expected none); masterEventId is empty on
    every event, so a reschedule cannot be linked to the slot it
    replaced and is counted once per appointment. Rep Appointments table:
    Booked (as host = assigned user), Booked by them (GHL createdBy;
    booking-widget bookings have no creator), Showed, No-show, Cancelled,
    show rate, calls per booking (the host's outbound dials to the contact
    in the 14 days before the booking, config/appointments.json; team =
    all dials ÷ all bookings), Army / Veteran split, Leader badges for
    most bookings and best show rate (at least 5 marked appointments).
    Row click opens the rep's appointments with a segment filter whose
    counts reconcile with each column. Verified: card totals equal the
    rep-table totals, every drilldown row count equals its headline, and
    every rep segment equals its column (this month).
61. **Appointment → outcome cohorts and charts (2026-10-17, owner
    request, stages 2–3).** Cohort = distinct contacts with an appointment
    scheduled in the range, anchored to their earliest one, judged as of
    the last sync. Outcomes since the appointment: CA 101 submitted and
    IAU App Submitted (FS2) from milestone events (GHL stage-entry
    times); Appointment Booked (NGT) from the stage history the sync
    observes (time = when seen, within 15 minutes) plus GHL's stage-entry
    time for opportunities already in the stage at the first sync and
    still there (config/appointments.json names the stage); Won / Lost
    from opportunity status with GHL's status-change time. Converted =
    any of the three, first achievement per contact. Contacts whose
    appointment was before the first core sync (2026-10-11) are "history
    unavailable" for the conversion step and excluded from its %, but
    still counted for Showed, Won, and Lost. The funnel steps (Booked →
    Showed → Converted → Won, Lost as a side branch) each count cohort
    contacts on their own, so a no-show can still convert. Post-
    Appointment Losses: contacts lost after a Showed appointment, listed
    with the stage they were lost from (the opportunity's current stage,
    which GHL keeps on a lost opportunity), plus NGT entries in the range
    and what they became (FS2 / won / lost / still open; a contact can
    appear under more than one). Army vs Veteran compares show rate,
    cancel rate, calls per booking, conversion, and won; lower is better
    for cancel rate and calls per booking; within 0.05 points is a tie.
    Charts: grouped bars of Booked / Showed / No-show / Cancelled per rep
    (status colors from the shared palette, dashed tick = booking goal
    pro-rated), a paired horizontal funnel with Army blue and Veteran
    gold, and a Booked vs Showed line (booked by booking time, showed by
    scheduled time). Verified this month: every cohort table figure
    equals its drilldown segment (Army, Veteran, and total), no outcome
    or loss is dated before its appointment, the comparison card equals
    the rates and outcome cards, and every chart equals the table beside
    it.
62. **Leads row rebuilt (2026-10-17, owner request).** New leads = contacts
    created in the selected range (GHL dateAdded), one per contact id;
    the row now follows the selected range rather than defaulting the
    New Leads card to Today. Program = current tags (Army / Veteran /
    Both / No tag). Campaign = current tags matching config/leads.json
    (vcn26, missioncyber, ccnusa, ccusa, ccusa26, ccn26, vcn26 referral;
    ccusa26 added because it is the tag actually on contacts); a lead
    with several campaign tags counts in each column but once in any
    total. Source = GHL's contact source, trimmed and case-insensitive,
    blank = Unknown (73% of this month's leads). Outcomes are judged as
    of the last sync: working stage = live opportunity open and not in
    New Lead or a dead-end stage (DND, Not interested, Unqualified,
    Wrong number, Flagged; program pipelines preferred when a contact
    has several opportunities); touched = any outbound human call, SMS,
    or email in the last 7 days (workflow sends included, person-only
    count shown); appointment booked = any non-deleted appointment;
    submitted = first CA 101 / FS2 milestone, with leads created before
    the first sync marked history unavailable and excluded from that %;
    won / lost = opportunity status; stale = still in New Lead for more
    than 2 days, timed from GHL's stage-entry time, else from creation
    and marked estimated. Headline cards keep their goals and gain a
    daily line with the prior period muted. Cards: program × campaign
    matrix with a donut; outcomes with a horizontal bar chart, campaign
    chips, and a segmented drilldown; new leads by current assigned user
    (reps, other users, Unassigned) with a grouped bar chart; stale new
    leads by user with a drilldown; a source report (leads, share,
    program split, appointment, submitted, won, lost, conversion =
    submitted ÷ leads with history) with a donut of the top 6 sources and
    a conversion bar chart, plus the same table by campaign tag. Verified
    this month: matrix Total, assigned-by-user total, source total, and
    every drilldown equal New Leads Created; outcome rows equal their
    drilldown segments and never exceed the cohort; stale ⊆ still New
    Lead.
63. **Won Opportunities row rebuilt (2026-10-17, owner request).** Won =
    opportunity status = won, once per opportunity id; every dollar is
    Opportunity Value, never cash. Two modes behind a client toggle,
    default Currently Won (snapshot: status won now, current value and
    stage) and Became Won During Period (first won event per
    opportunity in the range, value and stage at the event, reversals
    listed never subtracted). Headline: every pipeline in the connected
    sub-account with Army CA, Veteran G.I. Bill, and Partner Inquiry
    side by side and a donut. Current Programs: Won/Submitted (Fy 27) +
    Enrolled Won (FS2), with a discrepancy pill for opportunities in
    those stages whose status is not won, and a list of other won stages
    so the card plus past semesters equals the program pipelines. Past
    Semesters: FS1, Summer Session 1, Summer Session 2 with the contacts
    assumed to have reached the application stage (current stage in the
    semester's path or lost from it; SS1 and SS2 share one application
    stage, shown on both rows and counted once). Won by Campaign uses
    the leads campaign list, Army / Veteran by pipeline, a contact with
    two tags under each but once in the total. Application → Close Rate:
    FS2 tracked (milestone events plus current stage), FS1 and SS assumed
    from current stage (application / accepted / signed stages, the
    Enrolled/Won stage, and lost opportunities whose last stage was one
    of those); Lost reads zero because GHL moves lost opportunities to
    Not Interested / DND / Unqualified, which is stated on the card. Won $
    by month for 12 months from the first won event per opportunity. The
    old four-card Won section and src/lib/won.ts were removed; stage ids
    live in config/won.json. Verified this month in both modes: headline
    = sum of pipelines (count and $), programs + past semesters = Army +
    Veteran pipelines, every drilldown equals its card, the campaign
    total equals the headline, and each close-rate cohort equals won +
    lost + still + other and its drilldown segments.
64. **Won row scope and chart clipping (2026-10-17, owner edits).** Total
    Won Opportunity Value now covers the Army CA + Veteran G.I. Bill
    pipelines only (headline, donut, pipeline table, drilldown); Entire
    CRM (every pipeline, including Intelagent Partner Inquiry) is listed
    in the card's Details with its own drilldown. Won $ by Month sits
    directly under the headline. Current Programs uses two vertical bars
    (Army FY27 blue, Veteran FS2 gold) with the value and count above
    each. Past Semesters highlights the best semester by won Opportunity
    Value (gold row border, Best badge, brighter bar; the tooltip also
    gives its rank by count). Clipping fixed globally: every chart
    tooltip now renders through the document-body portal with position
    fixed and edge flipping (LineChart, BarChart, StackedBarChart, and
    DonutChart converted; GroupedBarChart, HBarChart, PairedHBarChart,
    MiniDonut, and VBarChart already did); chart containers size to
    their content (.kpi-chart and .chart-wrap no longer use a fixed
    height or overflow: hidden, keeping only a minimum height so cards
    in a row align); the line chart's right-axis label and the last
    x-axis labels of line and bar charts are kept inside the SVG box. A
    programmatic audit of all 24 chart areas at 1440px and 1024px finds
    no SVG, legend, or label outside its container, and screenshots of
    every chart card at both widths were reviewed.
65. **Navigation, section icons, and motion (2026-10-17, owner request).**
    A slide-in glass side nav (same liquid-glass style as the control
    bar, 280px, fixed left) opens when the pointer enters the leftmost
    24px on hover-capable screens at least 900px wide and closes 400ms
    after the pointer leaves it (250ms ease); on touch or narrow screens,
    and for keyboard users via Tab, a small glass edge tab toggles it.
    It lists the six sections with an animated icon, name, and a
    one-line description; clicking scrolls smoothly to the band and the
    band in view is highlighted by IntersectionObserver; Escape closes
    it; prefers-reduced-motion disables the slide and the smooth scroll.
    Section icons are inline SVG with CSS keyframes (envelope into a
    mailbox, ringing handset, chat bubbles with alternating typing dots,
    calendar check drawing in, org tree connecting node by node, coin
    into a piggy bank), each under 2KB, playing once when the band
    heading enters view and looping while hovered or focused in the nav.
    Band headings are 32px / 800 with the icon on the left and the
    description beneath. Chart visuals animate once per page load at a
    20% IntersectionObserver threshold: bars grow from the baseline
    (400ms, 40ms stagger capped at 14 steps), lines draw left to right
    (600ms stroke-dash via pathLength), donuts sweep from zero (500ms
    conic mask), heat-map cells fade in staggered; everything is CSS
    keyed off an "anim" class on <html> that is only added when JS runs
    and reduced motion is off, so numbers, labels, tooltips, and the
    no-JS render are never affected. Current Programs is back to two
    horizontal bars in a card that keeps its own height. Measured: the
    added client code is about 13KB of source (5KB gzipped) plus 10KB of
    CSS; scrolling the full page at 1440px produced 116 frames with a
    worst frame of 19ms and none over 33ms.
66. **Dock navigation (2026-10-17, owner request, replaces the slide-in
    panel).** A macOS-style dock fixed to the left edge and always
    visible: a slim vertical glass strip (about 58px wide, vertically
    centred) with the six section tiles at 32px and no labels. When the
    pointer enters it the tiles grow to a 52px base, the tile under the
    pointer magnifies to 1.6× (about 84px) and its two neighbours to
    1.25× with a 150ms spring-like easing, and the hovered section's name
    and description appear in a small glass label to its right. A white
    dot under a tile marks the band in view. Touch devices keep the rest
    size: one tap shows the label (with a "Tap again to go" hint), a
    second tap navigates. The tiles are buttons, so Tab focuses and
    magnifies them and Enter navigates; prefers-reduced-motion removes
    the transitions and the smooth scroll. Icons were redrawn as 64×64
    app-style tiles (rounded square with a brand blue, gold, or cyan
    gradient and gloss, 2px-aligned strokes, consistent weight) with the
    same hover animations; the band headings use the same tiles with no
    box around them. The page content keeps an 84px left gutter so the
    dock never overlaps a card: measured at 1440px and 1024px the dock's
    right edge is at 70px and the first card starts at 108px.
67. **Dock hidden behind a dot-grid handle (2026-10-17, owner request).**
    At rest only a handle shows on the left edge, vertically centred: a
    2×6 grid of 3px gray dots at 60% opacity inside a 20×64px glass pill
    that pulses once about half a second after the page loads. Hovering
    the handle, or moving the pointer into the leftmost 24px, slides the
    dock in from the left (250ms ease) while the handle fades out; the
    dock is otherwise unchanged (52px base, 1.6× / 1.25× magnification,
    glass labels, active dot). The dock slides out and the handle returns
    400ms after the pointer leaves it. Touch: tap the handle to open, tap
    it again or outside to close. Keyboard: the handle is focusable,
    Enter or Space opens the dock and moves focus to the first tile,
    Escape closes it and returns focus to the handle; tiles are only in
    the tab order while the dock is open. Reduced motion removes the
    slide, the pulse, and the smooth scroll. The content gutter shrinks
    to 28px since only the handle sits in it at rest.
68. **Dock polish (2026-10-17, owner request).** The container behind the
    dock tiles is gone; the tiles float over the page with a soft drop
    shadow (stronger in the dock than on band headings) so they read on
    dark and light bands, and the hover label keeps its glass pill.
    Spacing is 28px between tiles at rest and 18px while magnified. Tile
    colors: Won Opportunities emerald (#22c55e → #15803d) with a white
    piggy bank outlined in gold and a gold coin; Appointments red
    (#ef4444 → #b91c1c) with a white calendar and white check;
    Conversations green (#34d399 → #059669) with white bubbles; Leads
    teal; Submissions blue and Activity cyan unchanged. Every tile has a
    macOS-style gloss: a white top-half gradient at 25% fading out by the
    middle, a 1px lighter inner line along the top edge, and a faint
    darker inner shadow at the bottom, all vector so it stays crisp on
    Retina.
69. **Rep Performance band (2026-10-18, owner request).** A seventh band
    after Won Opportunities, with its own dock tile (person with a bar
    chart, gold / blue). One card per sales rep in config/sales-reps.json
    (reps with no activity still appear), three across, sorted by a
    selectable metric (default combined submissions) with a rank badge
    and a crown for #1. Each card shows a circular photo from the rep's
    new "photo" field (public/reps/…; initials on a brand gradient when
    the file is missing, as for Isabela Estrada), a Full-time /
    Part-time tag from kpiMultiplier, a stats grid with goal pills, a
    daily combined-submissions sparkline, and a goals-met count over the
    six per-rep goals (dials, talk time, bookings, showed, combined
    submissions, quota pacing). Every figure is the rep's row in the band
    it comes from: Rep Call Activity (dials, conversations / connected,
    talk time, first call), Rep Appointments (bookings, show rate, calls
    per booking), Program Submissions (CA 101, FS2, combined vs weekly
    goal, quota pacing, est. commission), New Leads Assigned by User
    (new leads assigned), Response Time (median). Three are computed
    with the same rules as their bands: leads assigned in the range
    (assignment events; unavailable before tracking began), won in the
    range (first won event per opportunity credited to the owner at the
    event, Opportunity Value), and close rate (of the contacts the rep
    submitted in the range, the share whose opportunity is won now).
    Clicking a card opens a modal whose tabs reuse the submissions,
    calls, appointments, and won drilldowns; the drilldown modal was
    split into a shell and a body for this. A leaderboard below lists
    every rep, sortable by any column (click again to reverse), with a
    gold team-average row (mean over reps with a value) and an "Other
    users" row, and the best value per column tinted (ties all tinted;
    lower is better for first call, calls per booking, and median
    response). The old Program Milestones cards and the Charts section
    were removed from the page; their data functions remain for reuse.
    Verified this month: 98 card figures equal their band rows and 119
    leaderboard cells equal the cards.
70. **Login with Sign in with Google (2026-10-18, owner request).** Auth.js
    (next-auth 5 beta, the release that supports Next.js 16) with the Google
    provider. The allow-list lives in `config/users.json` (three addresses:
    diego@, dante@, tonyn@intelagentmedia.com; matched ignoring case; the
    file is re-read when it changes, no restart needed). A Google account
    that is not listed, or whose email Google has not verified, is refused
    inside the sign-in callback, so no session is ever created; the visitor
    lands on `/login?error=AccessDenied` and sees "This dashboard is
    private." Sessions are signed JWT cookies lasting 30 days; the session
    callback re-checks the allow-list on every read so removing an address
    takes effect at once. Protection is two layers deep: `src/proxy.ts`
    (Next 16's middleware) redirects signed-out page requests to `/login`
    and answers `/api/*` with 401 JSON, and every page and route checks
    again through `src/lib/guard.ts` (`requirePageUser` / `requireApiUser`).
    The former "disabled in production until login exists" switches on the
    drilldown, recording, email-template, and sync routes were replaced by
    these session checks. Open without a session: `/login`, `/api/auth/*`,
    Next's own assets, the logo, and rep photos. The 15-minute sync runs
    from `src/instrumentation.ts` without HTTP, so it needs no session.
    Secrets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `AUTH_SECRET`
    live only in `.env` (names in `.env.example`; the provider is given these
    names explicitly because Auth.js defaults to `AUTH_GOOGLE_ID` /
    `AUTH_GOOGLE_SECRET`). Tested 2026-10-18: the owner signed in and landed
    on the scorecard, a non-listed Google account got the private page with
    no session, and signed-out calls to every API path returned 401.
    GHL access is unchanged
    and read-only. Header shows the signed-in name and a Sign out button;
    nav is hidden when signed out.
71. **Sync resilience after the first hosted run failed with "database or
    disk is full" (2026-10-19, owner request).** The Railway volume was too
    small for the message history. Changes: (a) the cache is checked with
    `PRAGMA quick_check` when the server opens it; a damaged file is moved
    aside as `cache.corrupt-<time>.sqlite` and a fresh cache starts (all data
    re-syncs from GHL). SQLite's journal makes a disk-full write roll back
    cleanly, so this is a safety net, not an expected path. (b) Rollbacks
    after a failed write no longer throw ("cannot rollback - no transaction
    is active" had hidden the real disk-full error). Messages were already
    committed per 500-row page with the cursor advanced per page, so a
    failure keeps everything loaded so far and the next run resumes.
    (c) A run now counts as a successful core sync when the five core
    phases (users, contacts, opportunities, calls, appointments) succeed,
    even if a messaging phase fails; `last_core_sync_ok_at` drives "Last
    successful sync", `last_core_sync_complete_at` records all-phase runs.
    (d) Each run logs cache size and free disk at start and stores a
    `disk_warning` below 1 GB free, shown on both pages. (e) Runs the
    server stopped mid-way are closed as "interrupted" at the next start.
    (f) `src/lib/syncStatus.ts` turns raw errors into plain-English
    sentences; the Mapping page gained an "Automatic data sync" section
    (last core/complete sync, last attempt, explanation, cache file size,
    free disk, integrity, last six runs). Size estimate from the local
    cache: 0.9 GB for Jan–Oct 2026, 80% of it email bodies, growing about
    0.3 GB per month at the October rate, so a 5 GB volume lasts roughly a
    year; trimming stored email HTML would cut that sharply (not done).
72. **Event history migrated from the owner's PC to the host (2026-10-19,
    owner request).** The hosted cache started on 2026-10-19; the PC had
    recorded milestone events, assignment events, and opportunity history
    since 2026-10-11. A login-protected route, `POST
    /api/admin/import-history` (allowed only for addresses under
    `historyImportAdmins` in `config/users.json`; `?dryRun=1` previews),
    merges an export of those three tables plus the first-sync marker.
    Rules in `src/lib/historyImport.ts`: milestone events are keyed by
    (kind, milestone key, opportunity, GHL event time), so the same event
    seen by both copies is one row; a host "baseline" row for an event the
    PC saw happen is upgraded to a real event; history and assignment rows
    are skipped when the host has the same row or one within 36 hours;
    `first_core_sync_at` moves back to the PC's date so "history available
    since" matches. Nothing touches GHL. A dry run against the PC itself
    reported every row as already present (427 / 509 / 13,960 skipped).
73. **"GHL could not be reached" now names the real cause (2026-10-20,
    owner request).** The owner saw every phase fail with "could not be
    reached" after the 1:44 AM run. Diagnosis: that was the dashboard on
    the owner's PC, not the host. Windows put the PC to sleep at 1:50 AM
    and woke it at 9:45 AM; the first sync fired 9 seconds after wake,
    before Wi-Fi was back, and every GHL request failed with "fetch
    failed" until the network returned at 9:49 AM. The live site never
    failed (every host run through 9:53 AM completed), the token worked
    from the PC (one read-only `GET /locations/{id}` returned 200), and no
    401/403/429 appeared anywhere. Two changes so this is obvious next
    time: `src/lib/ghl/http.ts` appends Node's hidden `err.cause` code
    (ENOTFOUND, ECONNRESET, certificate errors) or "timed out" to the
    error text, and `explainError` in `src/lib/syncStatus.ts` gives
    separate sentences for DNS/no-internet, TLS, timeout, refused/dropped,
    and GHL 5xx instead of one generic "network or GHL outage". 401/403
    and 429 were already reported as token permission and rate limit, not
    as outages; that order is unchanged.
74. **Spring Session 1 (SS1-2027) added as a second Veteran semester
    (2026-10-20, owner request).** GHL now has four Spring Session 1 stages
    in the Veteran G.I. Bill pipeline: IAU App Submitted, IAU App Accepted,
    IAU App Signed, and Enrolled Won. The first two and Enrolled Won are
    milestones (`vet_iau_app_submitted_ss1_2027`,
    `vet_iau_app_accepted_ss1_2027`, `vet_enrolled_won_ss1_2027`, reporting
    group `SS1-2027`, grouped by stage name like FS2); Signed is funnel-only
    like its FS2 twin. The sync records their events from this deploy on
    (the existing "newly tracked stage" backfill writes baseline rows for
    anything already sitting there; none were). The key `SS1-2027` was chosen
    because `SS` / `ss1` already mean the historical Summer Sessions in
    config/won.json. `config/ghl-mapping.json` gained a `semesters.list`
    (FS2 default, SS1-2027) and its pipeline dump was refreshed from GHL.
    Scorecard: a Semester dropdown above the two Veteran cards (URL
    `?semester=SS1-2027`; Fall Session 2 is the default and keeps the URL
    clean) drives those cards, the IAU column, chart, totals, goal status,
    and drilldowns of Program Submissions. Monthly quota and commission
    count every semester's IAU submissions whatever the dropdown shows (a
    submission is a submission; the quota must not drop when the page shows
    another semester). Won Opportunities: Enrolled Won (Spring Session 1) is
    a third current-program stage, the Application → Close Rate card gets a
    tracked SS1-2027 cohort, and the past-semesters chart compares against
    both current semesters. Appointment outcomes, NGT follow-up, Leads
    "submitted", and rep close rates treat an IAU App Submitted in any
    configured semester as a submission. Reconciliation before the push:
    GHL's opportunity search (read-only) returned 0 opportunities in each of
    the four Spring Session 1 stages, matching the cache (0 / 0 / 0 / 0);
    the FS2 control stages matched exactly (73 / 5 / 27).

75. **Semester dropdown moved into the first Veteran card (2026-10-20, owner
    request).** The standalone row between the Army and Veteran cards (note
    plus select) is gone. The dropdown now sits at the right end of the title
    row of the Veteran "Application Submissions" card, level with the yellow
    heading, as a small "Semester" label and a dark glass select that matches
    the card. The Goal badge stays where it was. The explanatory sentence
    became the dropdown's tooltip (also exposed to screen readers). Behaviour
    is unchanged: the choice still lives in the URL and still drives both
    Veteran cards, the IAU part of Program Submissions, and the drilldowns.
    Because the card opens a drilldown on click, the picker stops its own
    clicks from bubbling to the card (verified with real mouse events). The
    KPI shell gained an optional title-row slot (headRight) so other cards
    can take a small control the same way; every card's title row has the
    same minimum height so neighbouring cards still line up. On phone widths
    the dropdown wraps under the title at full width.

76. **All Railway secrets rotated on 2026-10-21 after Railway's
    environment-variable breach (owner).** Railway reported a breach of
    stored environment variables, so every secret the host held was treated
    as exposed and replaced: the GHL Private Integration token
    (GHL_PRIVATE_TOKEN), the Google OAuth client secret
    (GOOGLE_CLIENT_SECRET), and the host session secret (AUTH_SECRET on
    Railway, kept locally as AUTH_SECRET_PRODUCTION). The owner rotated the
    GHL token and Google secret at their sources and updated both .env and
    Railway Variables; the session secret was regenerated locally (32 random
    bytes, base64) and copied to Railway, which signs out every existing
    live session. Local verification after the rotation, with no secret
    printed: one read-only GET /locations/{id} with the new token returned
    200; Google's token endpoint accepted the new client id and secret
    (a deliberately fake authorization code was rejected as invalid_grant,
    not invalid_client); .env holds exactly one line per variable with no
    commented-out or duplicate old values. GHL_LOCATION_ID is an identifier,
    not a secret, and was not changed. ANTHROPIC_API_KEY is not stored on
    Railway and, per the owner, stays off it for now. Old values should be
    revoked at their sources (GHL token deleted, old Google secret removed)
    once the new ones are confirmed working.

77. **Hosting moves from Railway to Render (2026-10-22, owner decision after
    Railway's environment-variable breach).** The repo now carries a Render
    Blueprint, render.yaml: one Node web service named vcn-ghl-dashboard in
    Ohio on branch main, build "npm ci && npm run build", start "npm start",
    Starter plan, health check on "/", Node 24 pinned (NODE_VERSION, plus
    the existing .node-version and package.json engines), a 5 GB persistent
    disk at /data, and DATA_DIR=/data, TZ=America/New_York, PORT=3000 set in
    the file. The six secrets and host-specific values (GHL_PRIVATE_TOKEN,
    GHL_LOCATION_ID, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_SECRET,
    AUTH_URL) are declared with sync:false so they are typed into Render's
    dashboard and never live in the repo. railway.json was deleted and
    .env.example now describes Render; docs/DEPLOY.md holds the deploy
    steps. No app behaviour changed: the server already read PORT (Next
    reads it at start) and DATA_DIR (src/lib/db.ts), and a production build
    started against an empty data folder on a custom port created the cache
    in WAL mode, answered / with a redirect to /login (Render counts 2xx
    and 3xx as healthy, checked against its docs), and ran the scheduler's
    first sync five seconds after boot. Health check on "/" rather than
    "/login" is the owner's choice. Event history recorded on the old host
    is carried over through the import-history route after Render's first
    sync, then the Railway service is deleted.

78. **Mapping page sync times and honest phase counts (2026-10-22, owner
    request).** (a) The Mapping page's top bar said "Last successful sync:
    Oct 20, 10:47 AM" while its Automatic data sync section said Oct 22. The
    top bar was reading the last successful *account check* (the manual
    "Sync from GHL now" run, kind "mapping"); the section and the scorecard
    read the automatic core sync (sync_state last_core_sync_ok_at). The top
    bar now reads that same state, and the manual check is shown separately
    as "Account check (this page)" with its own attempt status. The coverage
    table's "Milestone achievements" row likewise now uses the first
    automatic sync, not the account check. (b) "calls 0" in a completed run
    summary did not mean "zero new calls since the last run". Calls and
    messages are read from one day before the previous run onward, so a
    normal run reported about 330 for calls even with nothing new, and a 0
    meant GHL's export answered with nothing for a window the cache already
    held records in (seen on local runs 465 and 472 for calls and 467 for
    messages, each between runs that returned ~334). The phase had not
    failed; the next run's overlap re-read filled the gap. Summaries now
    say "calls +N new (M re-checked)" for the incremental phases, and when
    the export returns nothing for a window with cached records the summary
    says so explicitly, the phase stays successful, and the cursor is held
    so the next run re-reads the window instead of assuming it was synced.
    The Mapping page explains how to read the counts and that pre-2026-10-22
    rows show the old plain count. (c) Bug fixed on the way: the sync's
    rollback helper called itself instead of SQLite's ROLLBACK, so an error
    inside a transaction would have left the transaction open; it now
    issues ROLLBACK.

79. **Sync run time budget, over-long warning, and a call/message re-pull
    route (2026-10-22, owner request after the host hung and dropped Oct 21
    calls).** Two problems on the live host at 11:30 AM. (a) A run that
    started 10:24 was still "running" at 11:42 (78 min for a normally
    6-minute job). The database lock treated any unfinished run younger than
    90 minutes as still running, so the 15-minute scheduler skipped every
    tick and no sync ran, with no warning until the 90-minute stale mark.
    There was no overall time budget on a run, so a phase looping against a
    flaky GHL (that morning GHL also threw 401s during the secret rotation
    window and returned empty call exports) could run far past the cycle.
    Fix: a run now self-stops after 20 minutes (RUN_BUDGET_MS) — the current
    phase returns what it has (incremental phases keep their per-page
    checkpoint and resume; full-read phases re-read next run), later phases
    are skipped, and the run finishes as partial, releasing the lock. The
    stale lock dropped from 90 to 30 minutes as a crash backstop. Both the
    scorecard and the Mapping page now flag a run still running past 30
    minutes (runningTooLong) instead of showing a plain "running" pill.
    (b) Oct 21 reconciled: GHL's Outgoing report (322 outbound calls; Sam R.
    76, Michael Nieves 61, Isabela Estrada 56, William Bobier 51, Miguel
    Torres 47, Anthony N. 31) matches a complete cache and a fresh read-only
    GHL export exactly, per rep. The counting rule is correct (outbound,
    non-automated, distinct call id, attributed to the owning user). The
    host showed only 148 because its calls cursor had advanced past Oct 21
    during empty-window runs (the bug fixed in #78/fc20495) compounded by
    the morning 401s, so the window was skipped. The time column differs by
    design: the dashboard sums connected talk time from each call's duration
    (8h 58m here) while GHL's report total includes ring/setup time (9h
    58m); the call counts are identical. To recover a skipped window, a new
    admin-only route POST /api/admin/resync (same auth as import-history,
    writes only the local cache's sync_state, never GHL) moves the calls
    and/or message cursors back to a date so the next automatic sync
    re-reads from one day earlier; the re-read upserts by id, so nothing
    duplicates. After deploy it is called once with from=2026-10-20 for
    calls and messages to re-pull the host.

80. **Weekly sales report email (owner request 2026-10-22).** A Monday-to-Sunday
    summary emailed every Sunday at 5:00 PM America/New_York from
    info@intelagentmedia.com over Gmail SMTP (GMAIL_USER / GMAIL_APP_PASSWORD
    in .env; smtp.gmail.com:465, a small SMTP client on Node's tls module so
    no mail library was added) to the recipients in config/weekly-report.json
    (diego@, dante@, tonyn@). Sections, in order: headline numbers this week
    vs last week vs goal with change arrows (combined submissions with CA 101
    and each semester's IAU part, dials, talk time, booked / completed / show
    rate, leads created / assigned, won count and Opportunity Value); the rep
    leaderboard ranked by combined submissions with goal attainment, week-
    over-week change, top performer and biggest improver; month-to-date pace
    (per rep and team submissions vs quota, projected month end at the
    current pace, needed per working day on a Monday-to-Friday calendar,
    semester totals for FS2 and Spring Session 1, estimated commission);
    funnel leads -> appointments -> submissions -> accepted -> won this week
    vs last plus the matched-cohort lines from Lead Outcomes; pipeline health
    (stale leads under the configured rule, untouched leads, Awaiting
    Supervisor Approval with aging buckets from GHL's stage-entry time,
    unassigned leads, dead-end / lost counts, stale conversations); a four-
    week trend table; flags (reps under 50% of goal, show-rate drops of 10+
    points, opt-outs and email bounces, past appointments still unmarked,
    sync problems, anything unavailable); three tips; a footer with the date
    range, data-as-of sync time, and links to the dashboard and Mapping page.
    Every number comes from the same functions the scorecard calls
    (src/lib/weeklyReport/data.ts reuses metrics, submissions, repCalls,
    appointments, leads, wonRow, commission, conversations, messaging, and
    repPerformance for the report week, the prior week, the four trend
    weeks, and the current month); nothing is re-implemented or estimated,
    and "unavailable" appears wherever the dashboard would show it. Two
    notes: submissions count every semester (the quota rule) rather than the
    semester chosen on the page, and the stale-lead rule is the dashboard's
    configured staleAfterDays (2 days in config/leads.json), with a separate
    "not touched in 7 days" line, so the owner's "7-day rule" is reported
    under its own label rather than silently redefining the card.
    Narrative: only the trend commentary, the projections wording, and the
    three tips come from the Anthropic Messages API (ANTHROPIC_API_KEY,
    model claude-sonnet-5-5 in config/assistant.json). The model receives
    the computed numbers as pre-formatted strings and may not compute or
    invent any; every number in its reply is checked against that payload
    and the whole narrative is dropped (numbers-only email, reason logged)
    if a number is new, the call fails, times out, is cut off, or is not
    valid JSON. Delivery: a one-minute scheduler tick (src/instrumentation.ts)
    sends when the week's send time has arrived and config enabled is true;
    the cache's weekly_report_sends table holds exactly one scheduled row per
    report week (partial unique index) claimed before the send starts, so a
    restart or redeploy can never send a week twice, and a server that was
    down at 5 PM still sends when it comes back within catchUpHours (48).
    One SMTP failure is retried once after 20 seconds; the result (scheduled
    or test, attempts, narrative included or why not, errors) is logged on
    the Mapping page. Testing: GET /api/admin/weekly-report?week=YYYY-MM-DD
    renders any week in the browser (format=html|text|json, narrative=0 to
    skip the API call); POST with {week, to} sends a [TEST] copy to one
    address, which must be a configured recipient or an allowed sign-in
    address; both require a historyImportAdmins user. The schedule ships
    with enabled: false until the owner approves the test send.
    Theme (owner request 2026-10-24): config/weekly-report.json has
    "theme": "light" | "dark". Light is the dashboard's light bands; dark is
    its dark bands (near-black navy page, deep-navy gradient cards with
    #223750 borders, white headings, yellow section kickers, cyan goal bars,
    green/red pills re-tinted for contrast, light-gray body text, all from
    src/styles/tokens.css). The layout is identical; only the palette in
    src/lib/weeklyReport/render.ts changes. The preview route takes
    ?theme=light|dark (and POST {theme}) to compare; test subjects carry
    [light] / [dark]. Default stays light until the owner chooses.
    Delivery (owner request 2026-10-24): the subject carries the week's range
    with the year ("VCN Weekly Sales Report · Oct 12 – Oct 18, 2026") so Gmail
    never threads one week's report under another's and trims "repeated"
    sections; test sends add "· sent <time>" so every test is unique. Gmail
    clips an HTML part over about 102 KB (measured as sent, encoding
    included), so the renderer keeps the HTML small: the font family is set
    once per table cell and inherited by the text inside it, labels are
    uppercased in code rather than with CSS, whitespace between tags is
    dropped, and photos stay inline CID attachments (never base64 in the
    HTML). The mailer sends the text parts as 8bit when the server advertises
    8BITMIME (Gmail does), falling back to quoted-printable; base64 would have
    added a third to the size. Last week's report rendered at about 80 KB per
    theme (81 KB on the wire); the section redesigns still to come must stay
    inside that budget.
    Trend charts (owner request 2026-10-24): section 6 shows two PNG line
    charts (submissions and won on one panel; dials and appointments booked
    as two panels with their own scales, never two axes on one plot) drawn by
    src/lib/weeklyReport/charts.ts with the image renderer that ships inside
    Next.js (next/og: Satori + resvg), so no dependency was added. The lines
    and dots are an SVG image, the labels real text in Manrope from the TTF
    files in public/fonts (OFL), rendered at 2x and shown 560 px wide, styled
    for the active theme, attached as inline cid: images (never base64 in the
    HTML). The curve is monotone (no overshoot), the current week is
    highlighted, and a compact caption row per week keeps the exact figures.
    Flags carry a short label and sort red, yellow, note; tips are numbered in
    the accent color; the footer has two buttons and one muted paragraph.

81. **Midweek check-in and the live schedule (owner approval 2026-10-24).**
    The Sunday report goes out at 5:00 PM New York in the dark theme to diego@,
    dante@, and tonyn@intelagentmedia.com (config/weekly-report.json:
    enabled true, theme dark). A second email, the Wednesday 3:00 PM midweek
    check-in (config midweek block, shipped with enabled false until the
    owner approves the test), covers Monday through the send time against the
    same Monday-to-Wednesday window last week, built by the same data module
    (buildWeeklyReport for the week so far) and rendered from the same pieces:
    the brief sentence, the six headline tiles with goal bars against the FULL
    weekly goal (not pro-rated), a "to finish the week" row (the gap to each
    weekly goal spread over the working days left, team and per rep, with
    "below pace" when a rep's submissions trail the goal spread evenly over the
    working days done), compact rep cards, the flags that need action before
    Friday (unmarked appointments, stale conversations, reps below pace, plus
    any sync or data flag), two model-written tips with the same grounding
    check, and the footer buttons. Same idempotency (a second unique index on
    kind = 'midweek'), the same single retry, and the same Mapping-page log,
    where both schedules show their next send time. The admin route takes
    report=weekly|midweek, a preview-only asOf instant, and action=check,
    which proves Gmail authentication, the Anthropic key, and the once-per-
    week guard (a rolled-back double insert) on the host without sending.

82. **Midweek check-in enabled (owner approval 2026-10-25).** After reviewing the
    test send and the Wednesday-3PM-as-of preview, the owner approved the
    check-in. config/weekly-report.json now has midweek.enabled true; the first
    scheduled send is Wednesday 2026-10-28 at 3:00 PM New York to the same three
    recipients, dark theme. Verified on the host with
    /api/admin/weekly-report?action=check after the deploy.

83. **Roles and the rep dashboard, step 1 (owner request 2026-10-26).**
    Two roles. Admins are the addresses under admins in config/users.json
    (diego@, dante@, tonyn@intelagentmedia.com; the old allowedEmails name is
    still read) and keep everything they had. Sales reps sign in with the
    Google account in the new signInEmail field of their entry in
    config/sales-reps.json (empty until the owner supplies the seven
    addresses; both files are read from disk with a change check, so no
    restart is needed). The role is looked up on every request, never stored
    in the session cookie. src/proxy.ts and src/lib/guard.ts enforce it: a
    rep may open only /me, /invoices, and /api/me/*; every other page sends
    them to /me and every other route answers 403, so a rep can only ever
    receive their own data (?as= is ignored for reps). Admins open any rep's
    view with "View as rep" on the Rep Performance cards and leaderboard
    (/me?as=<GHL user id>). /me uses the same design system (control bar
    with the date-range picker, bands, dock) and its first section, My
    scorecard, shows Today / This Week / This Month (plus the selected range
    when it is a different period) for dials, talk time, appointments booked,
    completed, show rate, submissions split Army CA 101 / Veteran IAU per
    semester, and won with Opportunity Value, each figure taken from the
    rep's own row of the team scorecard's functions with the rep's own goals
    (multiplier or override). A weekly-rate goal is shown as text on the
    Today column instead of a one-day share. GET /api/me/whoami returns the
    caller's own role for checking a new sign-in.

84. **Rep dashboard, step 2: the remaining sections (owner request 2026-10-26).**
    /me now has all eight sections. My pace: month-to-date combined
    submissions vs the monthly quota (the Program Submissions month-to-date
    columns) with an even-pace marker, projected month-end and needed per
    working day (the weekly report's working-day arithmetic), and a weekly
    goal streak judged week by week with the rep's own weekly submissions
    goal. My commission: this month's estimate with the calculation beside it
    and six months of history, priced by commissionBetween month by month,
    every amount labeled estimated. My leads: four action lists over the
    rep's current assignments (replies waiting from the unread inbound
    conversation snapshot; untouched for touchWindowDays; stale in New Lead;
    awaiting supervisor approval with age), judged by buildLeads with the
    Leads section's rules, each row linking to the contact in GHL. My
    appointments: upcoming this week as host, and past Confirmed/New
    appointments of the last 60 days to mark in GHL. My pipeline: live
    opportunities by stage per program pipeline (snapshot, open/won/lost,
    Opportunity Value). Team leaderboard: the admin's Leaderboard component
    on computeRepPerformance with the same inputs, the rep's row tinted and
    tagged "You", drilldown links stripped (full visibility is the owner's
    decision). Best call times: the rep's own heat map (heatBundle filtered
    to their dials), opening on the connected rate. The semester picker and
    range picker are path-aware so they stay on /me.

85. **Invoices (owner request 2026-10-26).** A rep's invoice for a month is
    the commission estimate from their plan for that month, itemized by the
    contacts that earned it (src/lib/invoices/lines.ts prices each
    submission or won with the same rules as commissionBetween and reconciles
    its total against it; a mismatch blocks sending). Months become available
    on the 1st of the following month; the current month is a live preview;
    a month with nothing to invoice cannot be sent. "Send for review" (rep
    only, never an admin viewing as the rep) freezes the amount and the
    lines, renders a PDF with a dependency-free writer (src/lib/invoices/
    pdf.ts: Letter, Helvetica, WinAnsi), stores it with status Submitted in
    the new invoices / invoice_events tables, and emails it from the
    configured sender (config/invoices.json; Gmail setup as the weekly
    report) to the review recipients with an approve link and the PDF
    attached (src/lib/mailer.ts gained attachments). Every approver listed
    in config/invoices.json (diego@ and dante@) must approve before the
    status becomes Approved; any admin may then mark it paid. The rep is
    emailed (at their signInEmail) when it is sent, at each approval, when
    approved, and when paid; failures are recorded as events and shown on
    the invoice. Pages: /invoices (reps: their months and statuses; admins:
    every rep × month with Draft / Submitted / Approved / Paid, the live
    draft estimate, Approve / Mark paid / PDF; ?as=<user id> opens a rep's
    view) and /invoices/<YYYY-MM> (the itemized invoice with its status
    history). Routes: POST /api/me/invoices, GET /api/me/invoices/pdf, POST
    /api/admin/invoices. All invoice data lives in the dashboard's cache;
    nothing touches GHL.

# Veteran Careers Network
# GoHighLevel Sales Dashboard — Claude Build Brief

## 1. Objective and scope

Build a custom sales dashboard connected to Veteran Careers Network's GoHighLevel (GHL) CRM. Its purpose is to show lead volume, rep activity, appointments, progress through two separate program tracks, won opportunities, and associated opportunity values.

The user's latest requirements below replace earlier generic descriptions of results. In particular, do not combine every submission, approval, and enrollment into one undifferentiated results number.

This brief defines the reporting requirements. Live VCN pipeline IDs, stage IDs, tags, field mappings, permissions, and available historical data have not been inspected. Verify those against the connected account before presenting any numbers as live or complete. Do not rename or change CRM pipelines, stages, contacts, opportunities, or workflows to make them fit this dashboard.

Priority: build the executive scorecard, the two program scorecards, and the sales leaderboard first. Supporting views can follow after the core numbers reconcile to GHL.

## 2. The two performance tracks

Maintain these six separate milestone metrics, including counts and dollar values:

| Program / pipeline | Milestone display label | Required reporting |
| --- | --- | --- |
| Army CA | CA 101 | Contacts submitted to / entering CA 101; associated opportunity value |
| Army CA | Supervisor Approval | Contacts reaching Supervisor Approval; associated opportunity value |
| Army CA | Won Submitted (FY27) | Contacts reaching the FY27 Won Submitted stage; associated opportunity value |
| Veteran G.I. Bill | IAU App Submitted FS2 | Contacts reaching the FS2 application-submitted stage; associated opportunity value |
| Veteran G.I. Bill | IAU App Accepted (FS2) | Contacts reaching the FS2 application-accepted stage; associated opportunity value |
| Veteran G.I. Bill | Enrolled Won (FS2) | Contacts reaching the FS2 enrolled/won stage; associated opportunity value |

The user's draft uses naming variants, including "Won/Submitted" and "Won Submitted (FY27)." Match these display labels to actual pipeline and stage IDs from the account, rather than guessing exact names or silently treating different stages as the same. Use configurable mappings so future fiscal years and semesters do not require rewriting the dashboard. GHL exposes a pipeline retrieval endpoint and identifies opportunities by pipeline ID and stage ID. [1][2]

Treat FY27 and FS2 as explicit program reporting groups, separate from the dashboard date filter. Do not infer FS2 dates or membership from the current month. Verify the field, tag, stage, or other authoritative source used for each grouping. If upstream Army stages serve multiple fiscal years, do not assume every contact in those stages belongs to FY27.

A Supervisor Approval stage entry is a CRM milestone, not independently verified proof of an external approval. If the stage actually means "awaiting approval," label the metric accordingly rather than claiming completed approvals. Apply this principle to all milestone labels.

## 3. Executive scorecard

Place the primary KPI cards at the top, using readable rows rather than squeezing every metric into one row. Put the six program milestone cards immediately underneath.

### 3.1 Total Leads Assigned

Count unique contacts with a valid assignment event during the selected period. Include assignment to a specific rep and team-wide totals. Show first-time assignments and reassignments separately.

Allow filtering by one or more selected contact tags. Offer distinct views for "assigned during period," "generated during period," and "generated AND assigned during period" so these different definitions are not mixed.

Count each contact once in the team-wide leads-assigned total for the period. For a rep's assigned-lead metric, count a contact once for that rep in the period. A contact reassigned between reps can appear in more than one rep's allocation count; disclose this and do not claim those rep allocation counts must sum to unique team leads.

Do not use contact creation date as a substitute for assignment date. If assignment history cannot be obtained, label the available metric "Currently assigned leads" instead of claiming historical assignments.

### 3.2 New Leads

Count unique contacts generated during the selected period using the verified contact-created timestamp. Default this card to Today, while allowing Day, Week, Month, Year, and Custom views.

Update the title with the period, such as "New Leads Today" or "New Leads This Month." Apply the chosen tag and lead-source filters. Make imports and backfilled contacts identifiable so an import is not silently represented as newly generated marketing demand.

### 3.3 Calls Made / Total Call Activity

Show total human sales-call attempts, with separate outbound and inbound counts. Include answered, no-answer, busy, failed, and voicemail outcomes where reliably available.

Include a descending call-volume breakdown by user. Allow sorting by total calls or outbound attempts. Clearly distinguish inbound calls received from outbound calls made.

Attribute call activity to the actual calling or handling user where the source supports it, not automatically to the contact's current owner. Keep unattributed calls in an explicit bucket. Deduplicate repeated call updates and linked call legs where supported so one call is not counted several times. Do not manufacture a connection or a duration from missing data.

VCN rep performance is intended to reflect human rep activity. Keep automated/AI calls and system voicemail drops out of the human-rep leaderboard unless separately enabled and clearly labeled.

### 3.4 Talk Time

Show total verified connected-call duration and a descending breakdown per rep. Display hours/minutes, with precise duration available in the drilldown. Include inbound and outbound breakdowns.

GHL documents call user, direction, status, and duration fields; its outbound webhook documentation distinguishes completed human-answer calls from voicemail through callStatus. Validate the actual account's payloads before relying on those fields. [3][4]

Exclude identified voicemail and non-conversation time from the talk-time KPI where the data supports that distinction. Do not classify a call as a human conversation solely because a generic status says "completed." If only raw call duration is available, label it "Recorded Call Duration" and disclose the limitation rather than presenting it as verified talk time.

### 3.5 Appointments Booked

Count unique appointment bookings created during the period, regardless of whether the appointment takes place in that same period. Show the linked contact's Army/Veteran classification, the assigned appointment rep, and calendar.

Use mutually exclusive breakdowns: Army, Veteran, Both / Needs Review, and Untagged. Verify the exact contact-tag mappings. Do not double-count a dual-tagged contact's appointment in the grand total.

Store classification at booking where historical data is available. If historical classification is unavailable, explicitly identify a report based on current tags.

Keep appointment-booking production separate from appointments scheduled to occur in the period. A reschedule of the same appointment must not create another booking. If the CRM creates a replacement record, use verified reschedule linkage when available; otherwise disclose the limitation. Preserve cancellations in the historical booking count while separately showing their outcome.

For individual rep reporting, distinguish the appointment's assigned rep/host from the person who actually created the booking. Show "Booked by" credit only when the source identifies the creator reliably.

### 3.6 Appointments Completed

Count appointments scheduled in the selected period and explicitly recorded as attended, using the verified appointment attendance status. GHL supports a "Showed" appointment status. [5]

Do not count an appointment as completed merely because its scheduled time has passed or a phone call has a completed status. Show pending attendance updates, no-shows, and cancellations separately.

### 3.7 Program Milestone Submissions / Stage Performance

Display all six milestones in Section 2 with:

- Unique contacts achieving the milestone during the selected period.
- Distinct associated opportunity count as a secondary detail.
- Associated opportunity value, with value basis labeled.
- Rep breakdown, count target, dollar target if configured, and period comparison.
- A separate current-in-stage count and current opportunity value.

"Achieved during the period" must be the default for rep performance. "Currently in stage" must be a separate snapshot, not a substitute for submissions.

### 3.8 Total Results / Won Opportunities

Use actual opportunity status = won for won-opportunity reporting. GHL stores status separately from pipelineStageId; a stage name containing "Won" is not sufficient evidence that the opportunity status is won. [2]

Provide these totals:

| Won view | Required display |
| --- | --- |
| Army CA | Distinct won opportunities and dollar value across the Army CA pipeline; allow FY27 filtering |
| Veteran G.I. Bill by stage | Distinct won opportunities and dollar value grouped by the pipeline's stages, including the specified FS2 stages |
| Veteran G.I. Bill total | All distinct won opportunities and dollar value across the Veteran pipeline, not just the three named FS2 stages |
| Entire CRM | All distinct won opportunities and dollar value across every pipeline in the connected VCN GHL sub-account |

Make two date modes available: "Became Won During Period" and "Currently Won." The first is an event-based report; the second is a current snapshot. Do not filter won production by opportunity creation date.

For period production, count the first valid won transition per opportunity. Keep reopened/reversed outcomes visible as separate adjustments and do not award another new win merely because someone toggles an opportunity out of won and back again. State whether any additional net-results view subtracts reversals; never silently change the meaning of the production metric.

For historical won-by-stage breakdowns, use the stage and pipeline at the won event. For current-won snapshots, use the current stage and pipeline. Label the difference.

"Entire CRM" means the authorized connected VCN sub-account, not automatically every sub-account in an agency. Do not silently apply an Army-only, FS2-only, or single-stage filter to a card still labeled Entire CRM. Show its scope explicitly, or relabel a narrowed total as "Filtered Won Opportunities."

Show discrepancies such as a contact in a Won-named stage whose opportunity status remains open.

### 3.9 Lead-to-Result Conversion Rate

Calculate a true lead conversion using the same lead population in numerator and denominator:

Conversion rate = distinct leads from the selected lead cohort that achieved at least one valid won result by the report's as-of date / all distinct leads in that same cohort x 100.

Define the lead cohort using a selectable basis: generated during the selected period or first assigned to the selected program during the selected period. Apply the same program, tag, and source scope to both parts. Display the cohort basis and as-of date. For cross-program reporting, count a contact only once in a contact-based conversion numerator even if that contact has multiple legitimate won opportunities.

Keep event-based wins produced during a period separate from cohort conversion. Do not divide all wins this month, including older leads, by only new leads generated this month and call that a true lead conversion rate.

Provide Army, Veteran, combined, and per-rep views where attribution history supports them. If the rep view uses ownership at cohort entry, label that explicitly; it is different from sales credit at the won event.

## 4. Card targets and comparisons

Each KPI card should have the current value, configured goal, percent of goal, and change versus the previous comparable period. Support both count and dollar targets where relevant.

Display "Goal not set" when a target has not been configured, and "Comparison unavailable" when reliable historical data is missing. Do not replace unavailable data with zero.

Goal attainment = actual / goal x 100. For conversion rates, show period-to-period movement in percentage points. For other metrics, show absolute and percentage changes. When the previous value is zero, show the absolute change and "New" or "N/A" rather than an infinite percentage.

For period-to-date reports, compare with the corresponding elapsed portion of the preceding period, not a completed prior month. Display both comparison date ranges. Use a configurable business-day calendar for rep pacing and working-day targets.

Existing working targets to support as editable settings: 80–100 calls per rep per day, two hours of talk time per day, and 20 program results per rep per month. Define which call types count toward the call goal. The monthly result target must be attached to an explicitly chosen qualifying result metric; do not automatically apply 20 to each of the six milestones or assume that CA 101 submissions are equivalent to won opportunities.

Keep submission goals, approval goals, won goals, and dollar-value goals independent.

## 5. Sales leaderboard

Build a sortable leaderboard with Summary, Army CA, and Veteran tabs so the display is not an unreadable wall of columns. All six milestone metrics must remain available.

| Column group | Required columns |
| --- | --- |
| Rep identity | Rank, rep name, active/inactive status where available |
| Lead allocation | Leads assigned, new leads generated, tagged-lead breakdown |
| Activity | Outbound attempts, inbound calls, total calls, talk time |
| Appointments | Appointments booked/assigned, attended appointments, show rate |
| Army performance | CA 101 submissions; Supervisor Approval milestone entries; Won Submitted (FY27) milestone entries; count and dollar value for each |
| Veteran performance | IAU App Submitted FS2; IAU App Accepted (FS2); Enrolled Won (FS2); count and dollar value for each |
| Actual results | Army won opportunities and value; Veteran won opportunities and value; total distinct won opportunities and value |
| Efficiency and goals | Cohort conversion rate where valid; attainment for each configured KPI |

Include explicit descending call-volume and talk-time views. Permit ranking by any milestone count, actual won count, or opportunity value. Use transparent individual metrics rather than inventing a weighted overall performance score.

Clicking a rep opens their underlying leads, calls, appointments, milestones, wins, and history. Show unassigned or unattributed records so they do not disappear from team totals.

For show rate, use appointments scheduled in the period: showed / (showed + no-show), with cancellations and unresolved attendance statuses shown separately. Label this denominator rather than mixing booked-this-month appointments with held-this-month appointments.

## 6. Historical milestone tracking and sales credit

This section is essential to the accuracy of rep performance.

Track milestone achievements, not just current stage occupancy. For example, a rep who moved ten contacts into CA 101 must retain ten CA 101 submissions for that period even after seven advance to Supervisor Approval. The snapshot may show only three still in CA 101; both numbers are correct but answer different questions.

Count the first verified achievement of each milestone once per contact, program, and reporting group. Re-entry into the same stage must not inflate the submission count. Separate legitimate new fiscal-year or semester cycles through their explicit reporting-group mapping. Do not assume a skipped intermediate stage was achieved without supporting evidence.

For every milestone event, retain the contact ID, opportunity ID, program/pipeline ID, stage ID, reporting group, event timestamp and timestamp basis, assigned rep at achievement, value at achievement, status, source, and sync receipt time. Preserve the update actor separately when available; an administrator moving a record is not necessarily the rep who earned credit.

Use the opportunity owner at achievement as the default milestone/win credit rule. Store current ownership separately for follow-up responsibilities. Allow an authorized, audited credit correction; do not automatically rewrite past rep performance whenever a lead changes owners. This dashboard is an operational reporting tool, not a substitute for separately defined commission eligibility or payout rules.

GHL documents separate stage-update and status-update webhook events. Evaluate those events for forward-looking event capture, together with verified historical sources available to this integration. [6][7]

Do not assume a current opportunity record or a webhook's dateAdded field provides the date of every historical stage change. Verify timestamp semantics. Store source event time separately from received/observed time; identify observed or estimated dates rather than claiming precision that is not available.

A baseline sync of contacts already sitting in a stage must not be counted as new submissions on the connection date. Backfill only from verified event history or approved records. Where history is missing, show current snapshots and a clearly marked "Reliable activity tracking begins" date.

## 7. Counting rules and dollar values

Use contact IDs for lead counts, appointment IDs for appointment counts, and opportunity IDs for opportunity and won counts. Milestone headcount is unique contacts by program/reporting group; dollar totals are sums of the distinct eligible opportunities behind the milestone.

If one contact has duplicate opportunities in the same program/reporting group, flag them for review. Deduplicate the contact headcount, expose the opportunity count, and do not silently assume every duplicate opportunity is a separate sale. Make any canonical-record exclusions auditable.

Never add the three Army milestone values together and call the sum total Army revenue. The same opportunity can pass through all three stages. The same rule applies to the Veteran milestones. Unique won totals must deduplicate opportunity IDs across stage subtotals and across the selected scope.

Use the verified GHL opportunity monetary value for the requested dollar reporting. GHL documents a monetaryValue field. [2] Label these amounts "Opportunity Value" or "Won Opportunity Value," not cash collected, commission earned, or profit.

For historical milestones/wins, preserve the value at the event when available. For snapshots, use current value. Label current-value fallback or unavailable historical values; do not silently revise past production when a current opportunity value changes.

Keep zero values distinct from missing values, display how many opportunities are missing dollar data, and label the dollar total incomplete when necessary. Validate currency before summing values. Do not invent a standard enrollment value or commission rate.

## 8. Global filters, drilldowns, and presentation

Filters: date range; rep; team; program; provider where mapped; pipeline; stage; opportunity status; contact tag(s); lead source; campaign where available; and fiscal-year/semester reporting group.

Date shortcuts: Today, Yesterday, This Week, Last Week, This Month, Last Month, This Year, Last Year, and Custom. Allow daily, weekly, monthly, and yearly chart grouping. Default reporting timezone to America/New_York, store timestamps consistently, and handle daylight saving time.

Make tag filtering support explicit ANY / ALL matching. Distinguish current-tag filtering from tag-at-event filtering. If an activity could belong to more than one opportunity or program, require a reliable relationship for pipeline/stage attribution; otherwise show it as unclassified rather than guessing.

All cards and charts must open the underlying records. Drilldown fields should include contact name, rep, program/pipeline, stage, status, event date, value, tags, reporting group, and a verified link back to GHL where available. Respect role-based access when showing personal contact data. Support CSV exports that reconcile to the displayed totals.

Use VCN branding: dark blue, gold accents, beige/neutral surfaces, readable typography, and the supplied VCN logo when available. Keep the executive overview uncluttered. On each view, display active filters, date basis, timezone, last successful sync time, and historical-data coverage.

## 9. Supporting views after the core scorecards reconcile

Preserve the previously discussed supporting functions without delaying the required core metrics:

- Program funnels and historical trends for Army and Veteran milestones; do not compute stage-to-stage conversion by dividing unrelated event totals from the same month. Use matched entry cohorts and disclose skipped stages and incomplete follow-up.
- Appointment performance: confirmed, attended, no-show, canceled, rescheduled, and attendance-update gaps.
- Pipeline health: current counts, current values, time in stage where history supports it, and oldest opportunities.
- Action-needed queue: untouched leads, overdue tasks, unconfirmed appointments, pending submissions, and stalled follow-ups, with configurable thresholds and verified activity definitions.
- Goal pacing and simple labeled run-rate projections using elapsed working days; do not present a straight-line projection as guaranteed results.

If stale-lead alerts are included, distinguish genuine incoming engagement and manual rep activity from automated reminder messages so the chosen definition of stale remains clear.

## 10. Integration and data integrity

Start with a mapping screen/report identifying the actual account scope, pipeline IDs, stage IDs, tags, users, appointment attendance values, call fields, monetary fields, reporting-group rules, and history coverage. Do not hard-code an outdated API version; verify current supported documentation and available permissions.

Use API-backed initial loading, available event capture, and periodic reconciliation appropriate to the integration's access. Follow pagination until all eligible records have been loaded, handle rate limits/retries, and make repeated event delivery idempotent. Surface partial syncs and connection failures rather than showing incomplete totals as complete.

Keep API credentials on the server, apply authenticated role-based access, and request only necessary permissions. Do not place customer data or secret tokens in publicly accessible frontend code. Avoid retrieving unrelated sensitive documents or recordings merely to build aggregate metrics.

No silent writebacks: the dashboard should not mark appointments showed, set opportunities won, rename stages, change values, or move contacts simply to make reporting numbers align. Record discrepancies for an authorized user to correct through an approved process.

## 11. Acceptance tests

Use explicit test data in a labeled demo/test environment, not fabricated records represented as live performance.

| Test | Expected result |
| --- | --- |
| A contact enters CA 101 and later advances | Original period retains the CA 101 submission; current-stage snapshot changes |
| A contact leaves and re-enters the same milestone in the same reporting group | No second milestone credit |
| An existing historical stage record appears in initial sync | It is baseline data, not a new submission on sync day |
| A lead changes owners after submission | Past submission credit stays with the original credited rep; current follow-up owner changes |
| A record is in a Won-named stage but status is open | Stage metric includes it as appropriate; actual won metric excludes it; discrepancy is visible |
| An opportunity becomes won after being created in an earlier month | It appears in the correct won-event period, not only its creation period |
| A won opportunity is reopened and won again | No duplicate lifetime win production; reversal/reopening is visible |
| One contact has both Army and Veteran tags | Appointment grand total counts the appointment once; classification ambiguity is visible |
| The same call update is delivered twice | One call attempt, one eligible duration contribution |
| A call reaches identified voicemail | Attempt count increases; verified human talk-time count does not |
| An appointment time passes without attendance being marked | It is not automatically counted as completed |
| One opportunity crosses all three milestones | Each milestone can record its achievement; unique won total and value count the opportunity once |
| An opportunity has no monetary value | Missing-data warning appears; no invented amount is used |
| The all-CRM won card is viewed under a narrow program filter | Its true all-CRM scope remains explicit, or the narrowed card is relabeled |
| A partial-period comparison is displayed | Prior period uses the same elapsed portion and the dates are visible |
| A card is opened or exported | Underlying unique records and eligible values reconcile to the displayed totals |

## 12. Requested initial deliverable from Claude

Review the existing project and implement the executive scorecard, six milestone metrics, actual-won reporting, and sortable sales leaderboard first. Provide a source-of-truth mapping for each KPI and visibly identify any unavailable integration or historical data.

Use this brief's definitions rather than replacing them with generic CRM metrics. Preserve current project work unless a change is needed for these requirements. Keep demo data clearly labeled and separate from production. Once core counts reconcile to GHL, add the supporting views.

## Official HighLevel references

These support the integration notes, not the VCN-specific business definitions or a claim that VCN's live account has been inspected.

[1] Get Pipelines:
https://marketplace.gohighlevel.com/docs/ghl/opportunities/get-pipelines/

[2] Create Opportunity — pipelineId, pipelineStageId, status, monetaryValue, assignedTo:
https://marketplace.gohighlevel.com/docs/ghl/opportunities/create-opportunity/

[3] Get message by message ID — call metadata, user, direction:
https://marketplace.gohighlevel.com/docs/ghl/conversations/get-message

[4] OutboundMessage — call status details and duration:
https://marketplace.gohighlevel.com/docs/webhook/OutboundMessage/

[5] Workflow Action — Update Appointment Status:
https://help.gohighlevel.com/support/solutions/articles/155000003364-workflow-action-update-appointment-status

[6] OpportunityStageUpdate:
https://marketplace.gohighlevel.com/docs/webhook/OpportunityStageUpdate/

[7] OpportunityStatusUpdate:
https://marketplace.gohighlevel.com/docs/webhook/OpportunityStatusUpdate/

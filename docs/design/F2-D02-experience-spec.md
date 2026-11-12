# F2-D02 · Page, Component and Smart Calendar Experience Contract v0.1

Status: PROPOSED DESIGN CONTRACT, not implementation. Baseline: 2026-11-01 main 6c53e292a26e035a19897585e6e2e9fb00926246. Owner: Product Experience & Design. Related: F2-A02 (scheduler), F2-B02 (atomic persistence), F2-I02 (integration), F2-FE02 (frontend implementation). Product Director owns prioritization and acceptance.

## A. Code reality, user journey, and severity

The current web workspace has /today, /inbox, /calendar, /dashboard (labeled Focus in nav), /projects, /skills, /review, /history, /settings and subroutes. **There is no second authenticated "Dashboard" distinct from the Focus route**: app/dashboard/page.tsx is the current Focus page, whereas app/page.tsx is the public landing. Design should not add a redundant dashboard route just to fill a navigation label.

Evidence table: severity is design judgment based on code, not verified rendered defects.

| ID | Priority | Evidence / current behavior | User impact | Intervention |
| --- | --- | --- | --- | --- |
| D-01 | P0 | app/calendar/page.tsx day/week still renders entire month and task list; time-block-calendar.tsx week minWidth 1120 and 1152px full-day grid | calendar fragmented; mobile horizontal+vertical hunting | exclusive major view + focused mobile day and window |
| D-02 | P0 | app/dashboard/page.tsx puts running focus within 7-day Summary; focus-controls.tsx displays note/skill/actions during running session | timer competes with reports; complex primary action | FocusStage above insights, progressive details |
| D-03 | P1 | components/navigation.tsx wraps 9 destinations | dense mobile header, unclear destination hierarchy | four top-level tasks + More |
| D-04 | P1 | components/plan-card.tsx repeats Tomorrow and exposes many forms/actions | noisy list, accidental edits, extended scroll | TaskRow + single overflow/context menu |
| D-05 | P1 | app/today/page.tsx three metrics + comparison + optional alerts above plan | next action obscured | actionable Today order |
| D-06 | P1 | app/globals.css dark via raw .bg-white/.text-slate class overrides; tailwind config no theme extension | state-specific contrast can regress | semantic tokens, color/state matrix |
| D-07 | P1-release gate | mobile/README.md lists native calendar/dark mode/offline absent; mobile/App.tsx five scrollable tabs, text-entered dates/times | native flow breaks to browser; touch friction | PWA canonical workflow, honest native feature gating |
| D-08 | P2 | app/review/page.tsx and planned-actual.tsx show many totals/bars; app/settings/integrations/page.tsx uses raw API text in major screen | high cognitive load | insights/actions + advanced integrations only |
| D-09 | P2 | app/login/page.tsx Welcome back has both login/signup; Today first-time prompt generic | weak onboarding | contextual first action, not wizard |

Existing positives to preserve: PlanForm progressive details, direct SQL/RLS and exact revision checks, separate deadline and planned date, safe Trash restore, calendar's non-drag editor, focus pause/resume and post-completion outcome, historical data accuracy disclaimers. Do not invent user research findings; existing docs/validation-v1.md covers fixture-backed browser tests, not real authenticated visual UX.

## B. Shared information architecture and navigation

Primary user flow: Capture → Decide when → Review proposed plan → Commit/adjust → Focus → Record outcome → Learn/adjust.
- Desktop: persistent contextual nav Today / Inbox / Calendar / Focus; Projects, Review, Skills, History under a clear Workspace/More group; Settings/account always findable. Keep browser back and deep links.
- Mobile: Today, Inbox, Calendar, Focus as stable, non-wrapping bottom nav (or accessible compact nav if design implementation constraints arise). More opens Projects, Review, Skills, History, Settings. Never hide the sole route to completion behind a non-labeled icon.
- Context title belongs to content, not duplicated in nav. Today and Calendar may feature a prominent Plan day action when scheduler contract is ready. Keyboard shortcut discovery can be deferred; no undiscoverable mandatory shortcuts.
- Cross-page task state is consistent: Inbox = undated capture; Today = scheduled day plus separate carry-over; Calendar = placement; Projects = grouped task ownership; Review = outcome, not another editor; History = session archive.
- Mode labels: "Plan" is a plan draft, "Scheduled" is committed; never label unconfirmed suggestions as booked/reserved in the schedule.

## C. Page-level build specs

### C1. Public landing and authenticated entry (P2)

Source app/page.tsx, app/login/page.tsx. Public landing: one clear promise, Try Focus CTA, understated 3-step explanation (Capture / Plan / Focus). Avoid SaaS stock dashboard placeholders. Login: explicitly distinguish Sign in from Create account with clear current mode and password expectations; preserve email confirmation/error guidance. First authenticated empty Today: "Add your first task" CTA and optional skip; one guided inline next step after first capture. No multi-screen onboarding wizard and never create sample user tasks without consent.

### C2. Today / working dashboard (P1)

Source app/today/page.tsx; components/plan-card.tsx/reminders.tsx. Desktop content order:
1. Today title + local human-readable date; one-line summary "2 of 5 complete · 75m focused" as supporting information (not three bulky cards).
2. If active focus: pinned compact FocusStage with task and Resume/Pause action; if not: one "Up next" row derived from uncompleted scheduled tasks by **existing** deterministic sortPlan priority/time (do not imply intelligent prediction), with Start focus.
3. "Your plan" task rows grouped now / later / carry-over; deadlines and overdue separated, not blended. Completed rows collapsed if >3 (expandable).
4. QuickCapture one line always visible; planned-date defaults to today when adding here; advanced options disclosed.
5. Coming up reminders only if non-empty or explicitly enabled; Reflection at end/collapsed after main activity; link to Review.
Mobile: summary then Up next then task rows then Capture in reachable position; no 3-column statistics. Avoid promising always-on reminders when notifications are disabled.
Empty: "Your day is clear. Add a task or choose one from Inbox" with both actions. Overload >8h: gentle explanation referencing remaining estimates; do not shame user or imply a hard daily limit.

### C3. Inbox and search (P1)

Source app/inbox/page.tsx, plan-form.tsx. Core: single compact capture at top of content; saved undated task stays in Inbox, no unrequested date. Task list is the primary surface; status and energy filters go into collapsible toolbar on mobile, show active filter chips and Clear filters. Search and active filter preserve each other and view= all/trash across navigation; blank match distinguishes empty inbox vs no results. Trash has restore affordance and avoids a cluttered permanent-delete CTA. Quick actions: Schedule, Complete, Edit; secondary: Move/Delete via contextual menu. Optional batch selection only if justified by evidence; not a Sprint 02 requirement.

### C4. Calendar (P0) — layout

Source app/calendar/page.tsx, components/time-block-calendar.tsx.
- Header: date range, Today, previous/next, Day/Week/Month switcher. Only selected primary calendar view occupies main canvas. Optional small date-picker popover; **never show 24h week grid + full month grid + forms + task list as four competing primary surfaces**.
- Desktop Day: sticky slim time rail and time blocks; Week: 7 day columns in primary pane, rail + columns; sticky day headers when scrolling. Optional compact Inbox drawer (collapsed by default in narrow viewport). Month: compact 7-column overview of day load; selecting a date enters Day while preserving selection. Supplemental agenda pane on desktop optional only if not obscuring timeline.
- Default visible time range = user's configured working hours if available; otherwise 08:00–20:00 (DISPLAY DEFAULT ONLY, not a scheduling hard constraint). "Show all 24 hours" expands; preserve actual 00:00–24:00 tasks and reveal out-of-window event chips, never hide them silently. Store view window preference locally, not in the schedule model.
- Mobile <=639px: Day view is default for /calendar with readable full width; week represented as 7-day strip selector + selected day agenda/timeline, NOT 1120px seven-column strip by default. Month switches to compact date grid with day count/dots, tapping a day opens its agenda. Sticky day header; no document-level horizontal scroll. Use safe-area and min 44px buttons.
- Time scale: 60m/hour default; zoom to 30m or 15m spacing as view preference, placement snaps to 15m by default but editor accepts exact valid times. Visual 15-minute snapping does not silently round typed times. Preserve timezone display and DST warnings.
- Collisions: algorithm returns independent placements; existing manual overlaps remain allowed/warned. For <=2 overlapping blocks, side-by-side lanes; for >=3 narrow overlaps, render selected/first 1–2 blocks plus "+N more" group accessible by click/keyboard to full agenda. No event title becomes 8px or 10px merely to fit. Event mini height min 32px is *visual*, but must have 44px equivalent tap target via overlay or list entry. Fixed external events use neutral fill+explicit "Busy", locked plans lock icon+label; draft suggestions dashed outline and "Proposed". Colors alone never establish type.
- Timed all-day and unscheduled tasks: separate all-day strip and Inbox drawer, not rendered as zero-duration blocks. Overnight tasks show continuation, DST repeated/nonexistent wall times show explicit warning. Timezone source is account timezone; fixed external event semantics depend on backend sync contract.
- Drag interaction (desktop): selection shows grab handle; dragging shows ghost + accessible time change preview, snap lines, explicit changed time label; drop triggers an editable confirmation popover if collision or crossing day; successful saved placement gets status and Undo/re-edit. Escape cancels drag; failed save returns original state with draft retained. Touch is NOT drag-only: tap event opens bottom sheet with Move date, Start time, Duration, Lock toggle (only after backend support), Confirm.
- Never persist a suggested plan via drag before user explicitly confirms draft. Existing manual calendar writes can continue through saveTimeBlock until Smart Calendar atomic contract is integrated.

### C5. Focus (current route /dashboard; P0)

Source app/dashboard/page.tsx, focus-controls.tsx, focus-options.tsx, focus-next.tsx. Not a new /focus route unless approved routing decision.
- Idle: task selector optional, primary Start focus, mode (Count up / Countdown) and focused timer preset. Countdown duration field is hidden/disabled when Count up; breaks/cycles in Advanced. Recent sessions and 7-day summary below stage.
- Running: dark/quiet neutral stage on light canvas, active task and time in center, primary "Pause" or "Resume", distinct secondary "Finish", tertiary "Abandon" behind confirm sheet with explicit zero-credit meaning. Hide skill/outcome editing until finish unless user opens Details. Maintain tabular numbers and stable layout; no ticking screen-reader announcement.
- Paused: frozen time and "Paused; pause time won't count" status; primary Resume. On return across devices show lightweight "Session updated on another device" with refresh, preserve unsaved note.
- Expired countdown: "Time's up — saved focus will be capped" and option "Save completed focus" if automatic completion is not confirmed, with no false automatic-success statement. Current DB-authoritative automatic transition must remain source of truth.
- Completed: non-exaggerated confirmation, real duration, linked task, optional outcome/skill, "Save outcome", next break or return to Today. Do not auto-complete linked task (different domain action). Break mode is visually differentiated and never counted as focus.
- Timer stage should be above analytics when active. Mobile controls stack vertically with 44px targets and confirm actions separated from destructive controls. No constantly animating rings required; reduced motion default.

### C6. Projects and Goals (P1)

Source app/projects/page.tsx. Project list displays name, short description, completion count, remaining task count, meaningful target date and optional expand. Focus totals are supportive, not the main KPI. Project detail/expand: uncompleted steps first and project-scoped add-step input. Project completion should be distinct from completing all tasks, with explicit copy; if uncompleted tasks exist, ask confirmation and explain they remain unchanged. A long task list uses compact TaskRows; no nested full-size PlanCard per step. On mobile put new-project action at top or sticky CTA, not only after a long list.

### C7. Review and History (P1)

Source app/review/page.tsx, components/planned-actual.tsx, app/history/page.tsx. Review order: chosen period + 1–2 plain-language grounded signals ("You planned X / focused Y" not "productivity score"), then 7/30/custom comparison; day trend with axis/legend, meaningful explanation of planned/actual difference; Project/Skill details and task variance folded under Details. Legacy sessions/missing estimates explicitly labelled, never coerced to zero. "Adjust next plan" deep link points to Today/Calendar and preserves filters. Never infer improvement from incomplete interval data. History stays accessible as data archive and CSV, no redundant top-level analytics destination.

### C8. Settings, devices and integrations (P1)

Source app/settings/page.tsx, app/settings/notifications/page.tsx, app/settings/integrations/page.tsx. Settings top-level groups: Appearance, Time and calendar, Notifications and devices, Connections, Account. Do not introduce API key management on first screen. Existing IANA timezone input can remain advanced, but a human-readable timezone chooser with search/presets is preferable; explain "planning wall times remain unchanged" before save. Theme is a real preference with Light/Dark/System instead of only a header toggle if implemented; avoid light flash. Notifications must distinguish in-app while Today is open vs background server push. External integration token screens must clearly identify read-only versus editing scope, reveal-once secret, expiration and revoke; preserve existing safe key handling.

### C9. Native companion (release gate)

mobile/App.tsx and mobile/README.md: five scrollable tabs currently differ from web nav; task editing uses raw YYYY-MM-DD/HH:MM fields and native calendar/projects/review open Web, potentially requiring sign-in. PWA is current complete interface reference; native implementation scope should be explained, not marketed as equivalent. Minimum for native acceptance: real device authentication, date/time picker, safe tap spacing, focus resume consistency, token/account switch, deep-link back, both themes if theme feature advertised. Offline editing not promised.

## D. Smart Calendar journey: exact user-facing contract

This is UX contract, NOT claim the scheduler, draft/locks or atomic commit exist on main. Backend F2-B02 and Algorithm F2-A02 must reconcile names, constraints, revisions and reason codes before UI binds.

1. **Capture**: title-only task is valid and lands in Inbox. Optional duration, priority, deadline, preferred hours, project. User explicitly requests "Plan my day/week"; never run/write a plan automatically on capture.
2. **Scope**: pick date range and available hours. Show existing fixed events, already accepted blocks, locks and unestimated tasks. Clearly state scheduler's hard constraints (calendar busy, accepted locks, deadline where declared hard by contract) vs preferences (energy/priority/timing). Unknown estimate gets a clearly labelled initial assumption; user may edit before scheduling.
3. **Generate**: show progress "Finding time for N tasks"; generation is deterministic/no paid AI API; cancel stops preview. No database plan writes during generation. On error keep current schedule intact. If offline or algorithm unavailable, retain manual calendar.
4. **Preview**: draft overlay is visually distinct and non-committed; summary "N placed / M unscheduled / K moved from current plan". Diff per changed block lists old→new times, reason code translated to human copy and conflict indicator. Stable accepted plans not moved unnecessarily. Never claim zero conflicts simply because warning overlaps are allowed.
5. **Explain**: tap a proposed block for "Why this slot?" with constraints satisfied, reason code, chosen slot and alternative if available. If reason code unknown, show neutral "Reason unavailable" instead of invented explanatory AI prose.
6. **Adjust**: drag on desktop or edit sheet on all platforms changes **draft only**; show conflict and capacity cost live. Undo local adjustments in preview. Allow Restore proposed placement and Restore original plan.
7. **Lock**: explicit toggled lock applies to selected existing/preview block; lock conveys "keep this date and time during future replans". Show policy for already completed/ongoing tasks; changing an accepted lock requires explicit user action. If no backend lock support, hide control until merged and verified.
8. **Confirm**: one deliberate "Apply N changes" action; show impact scope and warnings. Backend must atomically check owner, expected plan version/revisions, fixed-event/lock conflicts, and all affected rows. Success is only confirmed by backend receipt/reloaded committed state. Zero partial commits.
9. **Conflict**: version mismatch keeps preview with changed items identified; choices Reload current state / Compare changes / Regenerate. A hard conflict blocks confirm; soft warning offers explicit "Keep overlap" only if product/backend contract allows. Failed submit never silently overwrites another device.
10. **Undo**: after successful confirmation show an Undo affordance. Undo is a **new version-checked inverse transaction** using receipt/previous state, not blind UI rollback. If newer edits or irreversible changes exist, disable with "Plan changed since confirmation; review changes" and link to compare. If backend lacks undo transaction, do not claim Undo; provide honest re-edit path.
11. **Replan**: select scope and "Keep my locked blocks"; show exact proposed differences vs accepted plan, not wholesale destructive refresh. Confirm again required; unschedulable tasks remain visible with reasons and manual actions.
12. **Cross-device / persistence**: refresh retains accepted plan; stale drafts are labelled and never applied; pending draft existence does not mean calendar was changed. Timezone/DST changes cause explicit review when slots are affected.

### Draft model to communicate, subject to backend agreement

Required UI-facing identities: taskId, scheduledBlockId (nullable), planId, planVersion (opaque), draftId (nullable), localDate, localStart, zone/IANA, durationMinutes, deadline, priority, lockState, source (manual/scheduler/external), changeKind (add/move/keep/remove), oldPlacement, newPlacement, issueSeverity, reasonCodes[], expectedRevision, proposalState. Real schema may differ; do **not** add parallel client database just for design. UI must use existing schedules/time blocks where possible and consume backend agreed types.

### Smart Calendar state diagram (UI states)

| State | CTA | UI affordances | Exit / guard |
| --- | --- | --- | --- |
| idle | Generate plan | existing accepted calendar; editable tasks | start generation |
| generating | Cancel | skeleton/indeterminate progress, no false percent | preview or error |
| preview-clean | Apply changes | old/new diff, explain, edit, lock, regenerate | confirm with version |
| preview-warning | Review warnings | warning list, allowed overlaps | explicit acknowledge or edit |
| preview-blocked | Resolve conflicts | hard conflict / unscheduled reason | cannot Apply |
| applying | Applying… | draft frozen, prevent double-submit | receipt or preserved preview+error |
| committed | Review changes / Undo (only if backend) | accepted visual state and receipt | replan/undo |
| stale | Compare or Regenerate | previous preview remains read-only | reread version and rebuild |
| undoing | Undoing… | prevent repeated undo | new receipt or conflict |
| unavailable | Plan manually | manual schedule stays usable | retry |

### Human explanation copy mapping (only from trusted reason codes)

| Code family / conceptual mapping | Suggested copy | Rule |
| --- | --- | --- |
| deadline_fit | "Scheduled before the deadline" | actual deadline validated |
| priority_order | "Placed earlier because it has higher priority" | only if algorithm emits |
| energy_preference | "Matches your preferred working hours" | don't fabricate personal rhythm |
| keep_accepted | "Kept your confirmed time to avoid unnecessary changes" | prior schedule unchanged |
| avoid_fixed_event | "Avoids a busy calendar event" | fixed busy event was input |
| lock_respected | "Preserves your locked block" | lock actually enforced |
| insufficient_capacity | "Not enough available time in this window" | display duration/gap context |
| hard_conflict | "Conflicts with a fixed or locked block" | forbid confirm until resolved |
| unknown | "Reason not available" | no LLM fallbacks |

Reason code identifiers here are illustrative; Algorithm Lead owns canonical enum. Never let UX copy redefine scheduler feasibility or fixed-event source of truth.

### Smart Calendar interaction error taxonomy

- AUTH_REQUIRED: login action, preserve non-sensitive draft where safe.
- VERSION_CONFLICT / STALE_DRAFT: compare and regenerate; never override silently.
- HARD_CONSTRAINT_CONFLICT: identify each affected block and offer edit alternatives; no partial save.
- SOFT_OVERLAP: label warning; keep allowed only if contract permits and user confirms.
- INVALID_WALL_TIME / DST_GAP: show local timezone and valid alternative, don't silently normalize.
- NETWORK_ERROR: retry with safe idempotency key, retain draft.
- RATE_LIMIT/UNAVAILABLE: allow manual calendar.
- PERMISSION_DENIED: explanatory message, no other user's details.
- UNKNOWN: generic retry plus correlation ID if backend supplies one; no raw SQL exception.

## E. Critical component behavior and minimal wireframes

### Desktop Calendar composition

    [Today]  [<  Nov 2026  >] [Day | Week | Month]        [Plan day]
    [Optional Inbox drawer] [All-day / locked event strip]
    [Time rail] [08:00 | accepted | draft-dashed | fixed busy]
                [09:00 | overlapping group +2 more           ]
                [10:00 | ...                                  ]
    [Selected block opens side sheet: title, time, duration, lock, Why?]
    [When preview active: sticky summary Changes X · Unscheduled Y · Discard · Apply]

### Mobile Calendar composition

    [<]  Sun, Nov 1  [>]         [Day / Week / Month]
    [Mon Tue Wed Thu Fri Sat Sun]  selected day underlined
    [09:00  Class / meeting · fixed]
    [10:30  Study Physics · proposed]
    [12:00  +2 overlapping; tap for agenda]
    [ + Schedule a task ]  [ Plan day ]
    [Tap block -> bottom sheet, editable time fields; NO mandatory drag]

### Focus composition

    [Focus · current task]
    [       24:38       ]  (stable tabular digits)
    [          Pause     ]  one primary during running
    [       Finish       ]  secondary, distinct
    [Details] [Abandon…]  tertiary / confirmation
    [After finish: time completed · outcome optional · next action]

### Interaction contract per component

| Component | Trigger | Pending | Success | Error / Conflict | Accessibility |
| --- | --- | --- | --- | --- | --- |
| QuickCapture | Enter or Add | don't double-submit, retain text | clear only saved title + status | preserve text and retry | labelled input, status announced once |
| TaskRow complete | checkbox/button | local busy indicator | moved to completed, option Reopen | restore pre-action UI, explain | single semantic checkbox/button |
| TaskEditor | Edit / Save | disable duplicate Save | close and refocus originating task | keep all fields; version compare | sheet title, focus trap, Esc, return focus |
| TimeBlock move | drag/drop or field edit | show provisional state | persisted time + confirmation | snap back visually, field draft kept | equivalent non-drag Move form |
| Preview diff | Generate | no mutation | summary, block diff | retry or manual path | grouped headings, accessible changed labels |
| Lock toggle | select block | toggle pending in draft | visible lock label | revert draft toggle only | button aria-pressed and label |
| Confirm plan | Apply changes | block repeats | show committed state+receipt | retained draft with actionable error | live status, focus to result |
| Undo plan | Undo receipt | disable repeated | new plan version | stale compare instead of overwrite | announced final state |
| Focus pause/resume | Pause/Resume | prevent repeat | DB authoritative status | refresh from server, preserve note | distinct status text and button name |
| Finish/abandon | Finish/Abandon | prevent repeat | result panel | retry/status reconciliation | abandon confirm, safe focus |
| Reflection | Save | retain text | subtle saved status | preserve draft | textarea label, status |

## F. Frontend handoff priorities, dependencies and acceptance

| Work ID | Priority | Owner | Dependency | Acceptance |
| --- | --- | --- | --- | --- |
| F2-D02-FE-01 Calendar hierarchy | P0 | Frontend | existing manual block APIs | day/week/month exclusive major view; date/view preserved; mobile 390px single selected day; keyboard and form time edits; no unintended page x-scroll |
| F2-D02-FE-02 Focus stage | P0 | Frontend | existing focus state contract | running timer first above analytics; pause/resume/finish/abandon correct; no lost note; 390px touch and cross-device stale state |
| F2-D02-FE-03 TaskRow/QuickCapture | P1 | Frontend | current PlanForm/actions | one-line capture; no duplicate Tomorrow; all original actions reachable via overflow/detail; failure retains draft; series edit scope stays explicit |
| F2-D02-FE-04 Navigation/Today | P1 | Frontend | FE-03 | stable 4 primary destinations, More; next action above metrics; carry-over clear; no misleading AI claim |
| F2-D02-FE-05 Semantic tokens/theme | P1 | Frontend | shared CSS | light/dark/state matrix screenshot audited; existing icon asset reused until deliberate brand decision; accessible focus |
| F2-D02-FE-06 Smart Calendar draft preview | P0 before scheduler release | Frontend | A02 reason/output schema + B02 draft/version contract | no draft writes; summary/diff/explain; lock, adjust; hard conflict blocks apply; safe no-AI manual fallback |
| F2-D02-FE-07 Atomic confirmation/undo UI | P0 before scheduler release | Frontend + Backend | B02 commit/undo receipt & errors | confirmed only with server receipt; stale conflict does not overwrite; undo only with backend support |
| F2-D02-FE-08 Projects/Review/Settings polish | P1/P2 | Frontend | reusable TaskRow/tokens | grouped contextual panels, honest data signals, preference clarity; no extra analytics page |
| F2-D02-FE-09 Native companion review | release gate | Frontend/mobile QA | signed device environment | verify real device navigation/touch/time input/deep link; feature claims match actual implementation |

Regression release tests: existing focus/session SQL RLS, concurrency, recurrence, time-block DST, review legacy semantics, PWA login and all existing automated tests must still pass. Screenshot aesthetics or happy-path UI do NOT bypass data isolation and atomic writes.

## G. What is deliberately deferred

No standalone design-token package, no Figma prerequisite, no paid font, no glossy motion, no drag-only timeline, no automatic AI planner API, no offline queue or native parity claim, no new dashboard route, no multi-user calendar editing without backend contracts. Pending approval of F2-A02/F2-B02 canonical types, exact endpoint names/reason enum/undo semantics remain provisional.

This spec provides implementation guidance and a reviewable contract. It is not a sign-off for production, nor proof that any new component exists.

# F2-D02 · Visual and Interaction Acceptance Protocol v0.1

Status: PROPOSED GATE; NOT YET EXECUTED. Baseline: main 6c53e292a26e035a19897585e6e2e9fb00926246. Owner: Product Experience & Design; implementation: Frontend; independent functional regressions: QA; final release decision: Project Director.

## 1. Evidence integrity

This specification was drafted from source inspection, README/documents, and Vercel project metadata. We did NOT render current authenticated UI, capture live screenshots, run device touch testing or validate production Supabase. Vercel previews observed in this task were SSO-protected; project metadata did not give an authenticated screen. The older docs/validation-v1.md describes fixture-backed Chromium and images at /tmp/focus-v1-calendar-390.png and /tmp/focus-v1-review-390.png; those paths are historical test outputs, not files inspected in this F2-D02 review.

A PR, successful build, a generated mockup or HTML preview is NOT visual acceptance. Each verdict must link to the *actual* branch SHA and screenshots/recordings/test results, plus viewport/theme/data state. Never stamp a screenshot of a proposed design as a screenshot of the implemented product.

## 2. Required screenshot evidence matrix

Submit image files as PR artifacts, CI artifacts, or another reviewable location with stable links. Avoid personal task content and real account secrets: use synthetic account/fixture data. Capture browser URL/commit SHA, viewport dimensions, device pixel ratio, theme, locale/timezone and dataset scenario. Include full page and viewport crop where content is long.

| Group | Pages and states | Required widths | Required themes |
| --- | --- | --- | --- |
| Shell/auth | public landing, login, empty Today | 320, 390, 1280 | light and dark for authenticated shell |
| Today | empty, 1 task, 15 tasks incl carry-over, active focus, >8h estimated | 390, 768, 1280 | light + dark |
| Inbox | first capture, 20 tasks, filtered zero results, Trash restore, saving error | 390, 1280 | light + dark |
| Calendar | empty day, populated day, week, month, 3+ overlap, locked/fixed/proposed, DST warning | 390, 768, 1280 | light + dark |
| Smart Calendar | generating, preview-diff, soft warning, hard blocker, stale revision, commit success, undo conflict | 390, 1280 | light + dark when implemented |
| Focus | idle, running, paused, expired, completed, next break, abandoned error | 390, 1280 | light + dark |
| Projects | empty, several projects, one with >10 tasks, completed with open children | 390, 1280 | light + dark |
| Review/History | no data, complete history, missing estimates, legacy interval warning, long task | 390, 1280 | light + dark |
| Settings | timezone, theme, reminders disabled/enabled, connection read-only/write/expired | 390, 1280 | light + dark |
| Native | real Android/iOS sign-in, Today, editor, focus, notification, web handoff | physical device sizes | at least implemented native theme(s) |

No need to multiply all combinations into hundreds of captures: select a minimal covering set, ensure every page has >=1 mobile/desktop light screenshot, every major shared component has >=1 dark-state screenshot, and all P0 states have screenshots at 390 and 1280. Supply short interaction recording for scrolling, drag/selection, sheet, keyboard, edit failure, confirm/undo.

## 3. Acceptance methodology

Visual reviewer compares implemented UI with F2-D02-design-system.md and F2-D02-experience-spec.md, never just the supplied static mockup. Score each criterion 0 (fail), 1 (material defects), 2 (acceptable with polish), 3 (strong), 4 (exceptional but grounded):
- Primary-action clarity: next actionable task is easy to identify (weight 3).
- Density and hierarchy: metadata does not compete with title/task, no useless card stacking (weight 3).
- Interaction affordance: selected, hover, active, changed, saving states are legible (weight 3).
- Mobile usability: readable content, tap placement, no unintended document x-scroll (weight 3).
- Visual coherence: typography, spacing, border, color, light/dark token usage (weight 2).
- Brand character: restrained intentional details, no generic SaaS/AI-dashboard template (weight 1).
- Accessibility: keyboard, readable contrast, meaning not color-only, reduced motion (separate binary gate, cannot be outscored).
- Data safety & focus correctness: separate QA/backend binary gate, cannot be outscored.

Passing bar for review: no open P0 issues, no a11y/data-safety gate failures; weighted design mean >=2.5 (rating to be used as triage aid, not an excuse to overrule known task-flow flaws). P1 issues require an explicit owner and due sprint; repeated unresolved P1 on primary journey means recommend block. No 0 score in any primary page critical section.

Each reviewer defect must include: ID, scope, severity, affected viewport/theme, actual behavior and expected behavior, evidence link, recommended minimal fix, acceptance condition, assigned frontend owner, verification SHA and disposition. Example (hypothetical, NOT observed): Calendar overlap tile text clipped at 390px; show +N agenda overlay and verify keyboard selection.

## 4. Behavioral scenarios (must run on actual build)

### S1 Capture and edit with safe failure
Given an empty Inbox, typing only a title and submitting saves an undated task. Entering optional date/time can schedule; deadline remains separately editable. On server error, typed values remain and a retry is offered. A stale revision from another device is never silently overwritten.

### S2 Plan preview does not mutate
Given three tasks and a fixed event, generate produces a draft/diff; refresh of committed calendar before Apply remains unchanged. Editing a preview block affects draft only. Cancel discards draft without deleting accepted schedule. Lock state only appears when server model supports it.

### S3 Save is atomic and undo is safe
Given a proposed three-block change, confirm either commits all three in one new version or commits none. On stale plan version, user sees compare/regenerate and no silent overwrite. Undo is shown only with actual version-checked inverse operation and reports a conflicting newer version safely.

### S4 Day/week/month continuity
Given a selected date, switching view or month navigation keeps sensible date context; navigating to Day doesn't jump to first day of month without user intent. At 390px, weekly navigation doesn't require 1120px horizontal scrolling to find the selected day; all day events/overlaps remain accessible in agenda.

### S5 Mobile scheduling without drag
Given a phone viewport and one Inbox task, select task, open sheet, set date/time/duration, save; task persists and editor can reopen. Screen does not require precision dragging. Keyboard opens without covering Save or trapping the page.

### S6 Overlap and DST transparency
Given three tasks whose time intervals overlap, users can discover all titles and edit each. Existing manual overlaps may remain with warning; hard scheduler constraints cannot be confirmed. DST gap/repeated-hour values follow backend contract and show comprehensible timezone explanation; no silent wall-time normalization.

### S7 Focus resilience
Given running focus, pause freezes elapsed time, reload retains authoritative state, resume excludes paused duration, finish creates one completed phase, and abandon retains a zero-credit record. Outcome note survives its own save error; break never contributes to focus minutes. When timer expires in background, UI shows actual server state, not a premature success label.

### S8 First-run and empty/error states
Given an account with zero tasks and zero history, Today offers one clear first action, Review distinguishes no evidence from zero effort, reminder prompts do not ask permission before user intent. Lost connection and expired auth offer safe retry without fake success.

### S9 Mobile + native parity
PWA has full workflow; native app can complete only advertised subset. Opening web calendar from native does not pretend to be an embedded native calendar; loss of session shows clear sign-in. Date/time entry is usable with touch and screen reader. Native release cannot be accepted on JavaScript bundle export alone.

## 5. Microcopy and state matrix for implementation

| Context | Empty | Loading | Error / conflict | Success / recovery |
| --- | --- | --- | --- | --- |
| Today | "Nothing planned yet. Add a task or open Inbox." | "Loading your day…" with stable shell | "Couldn't load your plan. Retry." Keep last trustworthy content if possible | "Task completed" + Reopen |
| Inbox | "Capture a task to get it out of your head." | rows skeleton or inline | "Couldn't save. Your text is still here." | "Added to Inbox" |
| Calendar | "This day has no scheduled blocks." | stable timeline rail placeholder | "This task changed elsewhere. Review and retry." | "Time updated" + re-edit |
| Smart draft | "Choose tasks to plan." | "Finding available times…" | "Plan changed since preview. Compare or regenerate." | "Plan applied" + receipt/real Undo |
| Focus idle | "Pick a task or start without one." | "Preparing session…" | "Cannot start a second active session. Open current session." | "Focus started" |
| Focus running | not applicable | stable running timer; button pending | "Session updated on another device. Refresh." | "Paused" / "Completed" |
| Review | "Not enough recorded sessions to compare yet." | "Calculating your review…" | "Couldn't calculate this period. Retry." | explain metric, link next action |
| Settings | "No connection keys yet." | key action pending | "Couldn't save this preference. Try again." | "Preference saved" |

Avoid accusatory language ("You failed", "You wasted"). Avoid fabricated precision or guilt-inducing streaks. Use user-account timezone and local date display, but keep data semantics unchanged.

## 6. Automated and manual checks split

Frontend tests: keyboard Tab/Enter/Escape for navigation, select, sheet and Undo; React Action pending; 320/390/768/1280 layout, focus timer tabular stability, reduced motion; visual regression snapshots light/dark; no page x-overflow except isolated explicitly discoverable horizontal data area. QA: end-to-end capture → preview → confirm → focus → outcome → review using fixture-backed and then hosted test account when available, RLS multi-user protections, stale versions, DST, recurrence. Designer: actual screenshot and interaction video review for perceived hierarchy, information overload, precision touch, template smell, word choice, empty/error presentation.

WCAG 2.2 AA accessibility: text 4.5:1 (large 3:1), non-text 3:1; target >=24px AA with accepted exceptions, product preferred >=44px touch; dragging always has a single-pointer non-drag path; tab focus clearly visible. Keyboard focus must not disappear under fixed navigation at 200% zoom. Run contrast checker on final computed colors; token list alone is insufficient.

Screenshots and tests must reference same commit SHA. If the branch changes, previously approved screenshots of affected components expire and must be recaptured. Cross-browser at least Chromium and WebKit (when environments exist). iOS/Android native device acceptance is a separate gate.

## 7. Re-review and reporting procedure

1. Frontend opens PR with exact files changed, affected Task IDs, screenshot matrix, behavior captures, test commands/result summary and remaining known defects.
2. Design lead reviews screenshots + *running build* at specified commit, attempts main 5-step flow; files issues with severity and actionable fix; marks *needs actual visual verification* if access blocked.
3. Frontend fixes on branch; reviewer independently checks same issue with before/after evidence, marks ACCEPTED/REJECTED/PENDING. A passing CI or PR approval by another role is not visual acceptance.
4. QA validates functional and privacy/data gates; Director arbitrates release. No direct production mutation authorized by design approval.
5. Keep final concise record: implementation SHA, evidence URLs, defect outcomes, residual risks, final recommendation. If actual UI unavailable, mark visual gate BLOCKED rather than pass.

## 8. Exact Sprint 02 gate

**Design package:** complete when three Markdown docs are readable on dedicated review branch and their links are verified; PR opened but not merged. **Implementation:** NOT STARTED by design role. **Visual gate:** NOT EXECUTED pending real screenshots and authenticated runtime. **Deployment:** not authorized by these specs. Source main may change independently; frontend should rebase/check contracts, not copy stale unreviewed CSS.

Priority for feedback: P0 calendar legibility + focus mode > P1 navigation/TaskRow/Today/tokens > P2 initial onboarding and analysis polish. Smart scheduler integration P0 release gate waits for F2-A02/F2-B02 contractual validation.

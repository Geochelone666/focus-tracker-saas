# F2-D02 · Focus 2.0 Visual System v0.1

Status: DESIGN SPEC / PROPOSED — NOT IMPLEMENTED. Owner: Product Experience & Design. Reviewed baseline: main 6c53e292a26e035a19897585e6e2e9fb00926246 (2026-11-01). Decision gate: Project Director. Scope: Web/PWA first; native Expo uses equivalent semantics, not automatic parity.

## 0. Evidence and non-goals

Read: app/globals.css, tailwind.config.ts, app/layout.tsx, components/header.tsx, navigation.tsx, theme-toggle.tsx, plan-card.tsx, plan-form.tsx, time-block-calendar.tsx, focus-controls.tsx, focus-options.tsx, planned-actual.tsx; pages for Today/Inbox/Calendar/Focus (route /dashboard)/Projects/Review/Settings and mobile/App.tsx. Existing UI uses slate colors, white cards and thin borders; theme is implemented via CSS class overrides. Existing icon.svg is a dark rounded-square circle/checkmark. Preserve current stack, existing actions, RLS/revision checks, timezone/DST and focus timing. Do not introduce a component framework, paid font, animation framework, AI API or visual rebrand merely to meet this spec.

Vercel connected project found; latest seen previews are SSO-protected and production's authenticated workspace was not rendered. This document sets proposed tokens and standards; it is NOT evidence of real screenshots, rendered WCAG conformance, production performance, or user testing.

Inspiration method (not visual copying): Linear's lower-contrast chrome and consistent view controls; Things 3's quiet task list; Sunsama's plan-review-adjust ritual. Focus brand differentiator is **calm, human-directed progress from planned intention to recorded outcome**, not generic blue-gradient dashboards.

## 1. Design fundamentals and information hierarchy

- Action first: primary content is Next Action or active time block, then context, then metrics. No more than one emphasized primary CTA per work section.
- Progressive disclosure: default task row: completion control, title, human-readable timing/estimate, one contextual action, overflow/selection to edit. Hide secondary planning properties until expanded; maintain keyboard access.
- Density via semantic row/list presentation. Use surfaces only to group distinct tasks or interaction states; avoid one card per statistic/field, nested cards, floating translucent panels, heavy shadows, gradients and arbitrary icon proliferation.
- Respect user intent. A task is not a scheduled block until date/time are selected. Deadline differs from execution time. No algorithmic change is persisted before explicit confirmation. Existing timed task overlaps remain warnings; scheduler hard constraints must be negotiated with Algorithm/Backend.
- Brand should be identifiable through precise hierarchy, restrained accent, carefully rendered task/time states, writing tone and rhythm rather than decoration.

## 2. Proposed design tokens

Token implementation belongs to Frontend Lead; the values below are a spec, not deployed CSS. Keep existing Slate-compatible neutrals in the first PR; introduce CSS variables mapped to Tailwind semantic utilities instead of global overrides of .bg-white and .text-slate-900. Validate all real foreground/background pairs using browser-rendered computed styles.

### Typography

- Default UI font: system sans stack (Inter only if already licensed/deployed, otherwise do not fetch new font); prefer native Latin/CJK fallback. Timer and durations use tabular numerals.
- display 36/44, weight 650 (hero/setup only); page heading 28/36 weight 650; section heading 20/28 weight 600; body 16/24 weight 400; controls/compact list 14/20 weight 500; metadata 13/18 weight 400; supplementary 12/16 only when not essential; timer 56/64 desktop and 48/56 mobile weight 600.
- Minimum body user-facing reading size 14px except labels in sufficiently clear context; never convey task state with 12px gray text alone.
- Heading hierarchy h1 → h2 → h3 reflects sections; don't use uppercase letterspacing for entire navigation.

### Geometry, spacing, layout

- Base spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 px. Avoid ad-hoc 5/7/11/19px.
- Component radii: 8px for inputs/buttons, 12px for grouped surfaces, 16px for dialogs; no ubiquitous oversized pill cards. Border 1px low-emphasis; shadow only for floating overlays.
- Desktop >=1024px: slim workspace rail ~232px (or retain top navigation initially if rail implementation risks churn); primary column minmax(0,1fr) up to ~1000px; optional context side pane 280-320px only for Today/Calendar when space permits. Do not force extra column at 1024 if content drops below 600px.
- Tablet 640–1023px: top nav or compact drawer; one primary column; secondary pane collapses below content or into drawer.
- Phone 320–639px: single primary column, 16px horizontal margins, fixed non-occluding navigation (Today/Inbox/Calendar/Focus + More), one primary control in reachable area, safe-area insets honored. Preserve viewport content while keyboard is open. Main page must not require horizontal document scroll.
- Focus workspace: max width ~760px, timer above dense settings; Review can use wider analytic layout.
- Task row: min 52px compact desktop and 56px touch; metadata wraps safely, key action stays discoverable. Do not use arbitrary giant cards for each item.
- PWA/native: share priority, statuses, content language and navigation destinations; don't promise full Expo calendar or native dark mode while unimplemented (mobile/README.md).

### Color roles (proposal; validate visually)

Semantic roles, not raw color per component:
- Light: canvas #F8FAFB, surface #FFFFFF, subtle surface #F1F5F7, main text #182633, secondary text #526272, hairline #DCE4E9.
- Dark: canvas #0C141B, surface #15212A, subtle surface #1D2C35, main text #EDF3F6, secondary text #AFBFC9, hairline #344550.
- Accent: light #176570, dark #8AD9D0; selection on light #E6F3F2, on dark #193A3C. Existing dark-slate CTA is allowed while tokens are introduced; avoid two competing accent styles.
- Danger/warning/success must have separate semantic foreground, surface and icon tokens; include text+symbol, never color alone.
- Scheduled task vs locked task vs fixed external event vs preview suggestion must be recognizable by label or icon+pattern, not relying on subtly different fills.
- No gradients by default. Accent should be used for focus/selection, not every stat card. Palette is a direction subject to contrast tests, not a certified contrast matrix.

### Interaction feedback and motion

- Hover/focus/press/busy/disabled/selected are distinct states. Focus-visible indicator solid >=2px with adequate contrast and offset; keyboard users never rely on hover.
- Transitions typically 120–180ms for opacity/transform, modals/drawers up to 220ms; do not animate document reflow or repeatedly pulse timers. Honor prefers-reduced-motion by removing nonessential movement.
- Save: button pending label and spinner if duration warrants, inline status near input, never clear unsaved fields on failure. Async operations do not shift active focus.
- Completion: immediate bounded feedback and accessible Undo when technically reversible; where old server contract can't offer atomic undo, link explicit Reopen/Restore and disclose limitation rather than pretending rollback.
- Error: short issue + next safe action; avoid raw exceptions. Offline, conflict, expired auth and permission errors have distinct copy. Don't remove task content on refresh errors.
- Timer: stable tabular digits; avoid second-by-second live region announcements. Explicit paused status; break time does not count as focus. Completion result reveals outcome editing but does not interrupt an active user edit.

## 3. Reusable component anatomy and behavior

| Component | Default anatomy | States and constraints | Existing reuse |
| --- | --- | --- | --- |
| AppShell/Nav | brand, primary destinations, contextual title/actions, More | current link, collapsed, keyboard focus, safe area; no 9-link wrapping | header.tsx/navigation.tsx |
| PageHeader | title, optional one-sentence helper, one contextual primary action | long title, narrow screen; helper collapses when redundant | existing page headings |
| TaskRow | checkbox, title, time/deadline/estimate, selected/overflow | idle/completed/overdue/locked/conflict/pending; swipe never sole method | plan-card.tsx |
| QuickCapture | title input + submit; optional details disclosure | empty/typing/pending/success/conflict/offline, retain draft | plan-form.tsx |
| TaskEditor | title, execution date/time, deadline, estimate, other details | create/edit/series-one/series-future/conflict; explicit Cancel | plan-form.tsx |
| CalendarViewSwitcher | Day / Week / Month + Today + date heading | selected/current date/keyboard focus, no extra full month when week | calendar/page.tsx |
| TimeBlock | title, time, duration, state tag; selection opens editor | overlap/locked/fixed/preview/continued/DST; never tiny resize handle only | time-block-calendar.tsx |
| PlanDiff | proposed placement, previous placement, explanation, changed badge | unreviewed/changed/locked/unschedulable/stale | new composition; backend contract pending |
| FocusStage | current task, countdown/up timer, pause/resume/finish, secondary action | idle/running/paused/expired/completed/break/recovery | focus-controls.tsx |
| DataSummary | one essential number, reference/meaning, drilldown | no data/partial/legacy/loaded; avoid gratuitous cards | planned-actual.tsx |
| InlineStatus/Toast | human issue/outcome, relevant action, optional dismiss | pending/notice/success/warning/error; no silent failures | SubmitButton/useActionState |
| Confirmation/Undo | what changes, scope, cancel/confirm, safe undo if supported | conflict/re-auth/timeout; focus trap, Esc, restore opener | server actions remain source of truth |

## 4. Accessibility and localization requirements

- WCAG 2.2 AA target. Ordinary text contrast >=4.5:1 and large text >=3:1; non-text meaningful UI contrast >=3:1. WCAG 2.2 AA pointer target >=24x24px subject to listed exceptions; **Focus product target** 44x44px for mobile tap actions where practical. A non-drag alternative is mandatory for any dragging operation.
- Zoom to 200%, browser text scaling, 320px viewport, dynamic font sizes and both color themes without clipped CTA.
- Semantic button/input/label, aria-current navigation, form error associated via aria-describedby, real progressbar semantics, modal focus trap/return, keyboard sequence and visible focus; don't use a checkbox input nested in a button if it creates confusing accessibility semantics.
- Keyboard: Tab/Shift+Tab reachable; Enter/Space for buttons; Escape close sheet; accessible task selection and a form to set dates/times exactly; drag and resize are convenience only.
- Avoid aggressive aria-live for timer ticks and dozens of calendar event labels; announce transition state and conflict once.
- Current product language English. All proposed copy supplied in English for consistency; label changes must remain translation-ready (date/time via Intl, timezone chosen from account preferences). No unexplained ISO date formatting in primary display.
- Review mobile first including keyboard appearance and virtual keyboard safe area; native Expo must separately validate using real device builds.

## 5. Explicit anti-template review

Reject visuals if: every section is a rounded card without group meaning; more than two text emphasis tiers fight for attention; rainbow priority badges; gradient backgrounds and glass effects without function; huge decorative hero above actionable tasks; icons substituted for explicit labels; layout resembles an analytics sample more than a planning workspace; empty states depend on cute graphics instead of a meaningful next action.

Reject only for demonstrable usability/design inconsistency, not subjective novelty. Make revisions small and falsifiable: hierarchy, spacing, color, control density and contextual actions first.

## 6. External reference method

Sources for techniques (not copied assets): Linear 2026 interface refresh: https://linear.app/now/behind-the-latest-design-refresh ; Sunsama daily planning: https://help.sunsama.com/docs/usage-guides/daily-planning/ ; W3C WCAG 2.2: https://www.w3.org/TR/wcag/ .

## 7. Implementation boundary

Front end owns token implementation and component behavior; Backend/Algorithm must freeze Smart Calendar fields/transaction/error contract before shipping a persisted plan. UX approval of this document is not deployment authorization. Component specs are allowed to evolve after actual user-interface screenshot and keyboard/mobile review; log revisions in this file instead of creating another design system.

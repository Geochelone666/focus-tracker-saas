# Guided first focus workflow

`/getting-started` offers a skippable task-based walkthrough: check the account
IANA timezone, capture a title/estimate, arrange a calendar block, start focus,
return to an active session, and review recorded focus separately from task
completion. Settings always links to the guide, Today links when no live tasks
exist, and task details link with the exact task ID. No new schema, credentials,
permissions or feature flag are introduced.

The simplified capture form calls the existing create-plan action. Only this
creation destination assigns a server-generated task ID and redirects to that
exact task, so a different recently created task cannot replace it. Calendar links
preselect an owned, non-deleted task and offer a return link after saving. Existing
calendar editing, focus state transitions, completion and analytics are reused.
Smart Calendar is offered only when its existing experimental flag is enabled;
the guide never enables it or requests notification/AI authorization.

Progress comes from saved owner data, without a separate completion checklist.
Recent choices are bounded to 30; an explicitly selected older task is fetched
separately with an owner predicate and existing RLS. An unavailable or foreign task shows an error and prompts for a new selection. Read errors show retry feedback; no completed focus
is distinct from zero completed seconds. A current session on any task offers a
return path instead of inviting a parallel session. Finishing focus never marks
the task done, and users can skip or reopen the guide.

Validation covers bounded/owned reads, older and unavailable selections, unknown
vs zero totals, error handling, and the exact server-generated creation redirect.
The 390px browser workflow creates a task, follows its preselected calendar link,
saves a block, returns to the guide, starts/pauses/resumes/finishes focus and checks
recorded seconds while the task remains open. The auth-guard suite includes the
new route. Hosted GoTrue and real-device acceptance require separate runs.

Deploy with the application's existing schema prerequisites. Revert this UI/code
increment for rollback; task and focus records remain in existing models. The
remaining estimate/block-length separation, hosted release gates and account
privacy work remain tracked in the roadmap status.

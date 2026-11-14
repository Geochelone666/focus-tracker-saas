import Link from 'next/link';
import { planningContext } from '@/lib/planning-data';
import { readGettingStarted } from '@/lib/getting-started';
import { PlanForm } from '@/components/plan-form';
import { SubmitButton } from '@/components/submit-button';
import { startSession } from '@/app/dashboard/actions';
export const dynamic = 'force-dynamic';
export default async function GettingStarted({
  searchParams,
}: {
  searchParams: Promise<{ task?: string }>;
}) {
  const { supabase, user, zone, today } = await planningContext();
  const params = await searchParams;
  let guide;
  try {
    guide = await readGettingStarted(
      supabase,
      user.id,
      typeof params.task === 'string' ? params.task : undefined
    );
  } catch {
    return (
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-8">
        <h1 className="text-2xl font-semibold">Your first focus workflow</h1>
        <p role="alert">
          Your task progress could not be loaded. Refresh to retry, or choose a task again.
        </p>
        <Link prefetch={false} href="/getting-started" className="underline">
          Choose a task again
        </Link>
        <Link prefetch={false} href="/today" className="block underline">
          Go to Today
        </Link>
      </main>
    );
  }
  const { tasks, task, active, actualSeconds } = guide;
  const choices = task && !tasks.some((row) => row.id === task.id) ? [task, ...tasks] : tasks;
  const scheduled = !!task?.scheduled_date && !!task.scheduled_time && !!task.estimated_minutes;
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">Your first focus workflow</h1>
      <p>
        Take one task from an idea to a focus session and review. You can leave at any time and
        reopen this guide from Settings.
      </p>
      <Link prefetch={false} href="/today" className="inline-block underline">
        Skip guide and go to Today
      </Link>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">1. Check your timezone</h2>
        <p>
          Your account uses <strong>{zone}</strong>. Check that this matches where you plan your
          day.
        </p>
        <Link prefetch={false} href="/settings#timezone" className="underline">
          Change timezone in Settings
        </Link>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">2. Choose one task</h2>
        {!tasks.length && !params.task ? (
          <PlanForm simpleCapture returnTo="/getting-started" />
        ) : (
          <>
            {!!choices.length && (
              <form key={task?.id ?? 'none'} className="flex flex-wrap items-end gap-3">
                <label className="min-w-0 flex-1">
                  Task for this guide
                  <select
                    name="task"
                    defaultValue={task?.id ?? ''}
                    className="mt-1 block w-full rounded border p-3"
                  >
                    <option value="" disabled>
                      Choose a task
                    </option>
                    {choices.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.title}
                      </option>
                    ))}
                  </select>
                </label>
                <SubmitButton label="Use this task" pendingLabel="Loading…" />
              </form>
            )}
            {params.task && !task && (
              <p role="alert">
                This task is unavailable. Choose one of your tasks or create a new one.
              </p>
            )}
            <details>
              <summary className="cursor-pointer underline">Create a task for this guide</summary>
              <div className="mt-3">
                <PlanForm simpleCapture returnTo="/getting-started" />
              </div>
            </details>
            <Link prefetch={false} href="/inbox" className="block underline">
              Open Inbox
            </Link>
            <p className="text-sm text-slate-600">
              The list shows up to 30 recent tasks. You can open this guide for any task from its
              detail page.
            </p>
          </>
        )}
        {task && (
          <p className="break-words">
            Selected: <strong>{task.title}</strong> ·{' '}
            {task.estimated_minutes === null
              ? 'Estimate not set'
              : `${task.estimated_minutes} minutes estimated`}{' '}
            · {task.is_done ? 'Task completed' : 'Task open'}
          </p>
        )}
      </section>
      {task && (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">3. Arrange a time block</h2>
            <p>
              {scheduled
                ? `Saved for ${task.scheduled_date} at ${task.scheduled_time!.slice(0, 5)} (${task.estimated_minutes} minutes).`
                : 'Choose a date, start time and duration in the calendar. A deadline is separate from the time you plan to work.'}
            </p>
            {!task.is_done && (
              <Link
                prefetch={false}
                href={`/calendar?view=day&date=${task.scheduled_date ?? today}&task=${task.id}&guide=1`}
                className="underline"
              >
                Arrange this task in calendar
              </Link>
            )}
            {process.env.FOCUS_SMART_CALENDAR_ENABLED === 'true' && (
              <p className="text-sm">
                You can also{' '}
                <Link prefetch={false} href="/calendar/smart-plan" className="underline">
                  save work hours and preview a suggested plan
                </Link>
                . Review proposed changes before confirming.
              </p>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">4. Focus on your task</h2>
            <p>
              Start when you are ready. Pause and resume as needed; finishing a timer leaves the
              task open until you mark it complete.
            </p>
            {active ? (
              <Link prefetch={false} href="/today" className="underline">
                Return to your active session
              </Link>
            ) : task.is_done ? (
              <p>Edit and reopen this task to focus on it again, or choose another task.</p>
            ) : (
              <form action={startSession}>
                <input type="hidden" name="schedule_id" value={task.id} />
                <input type="hidden" name="skill_id" value={task.skill_id ?? ''} />
                <SubmitButton label="Start focus on this task" pendingLabel="Starting…" />
              </form>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">5. Review and adjust</h2>
            <p>
              {actualSeconds === null
                ? 'No completed focus recorded for this task yet.'
                : `${Number((actualSeconds / 60).toFixed(1))} minutes of completed focus recorded for this task.`}
            </p>
            <p>
              Compare your estimate with recorded focus. Add an outcome when you finish a session,
              then decide whether to complete the task or plan more time.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link prefetch={false} href={`/plans/${task.id}`} className="underline">
                Edit or complete this task
              </Link>
              <Link prefetch={false} href="/review" className="underline">
                Review your time
              </Link>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

import type { Choice } from './planning';

export function projectFocusMinutes(
  sessions: Array<{ schedule_id: string | null; duration_sec: number | null }>,
  schedules: Array<{ id: string; project_id: string | null }>,
  projects: Choice[]
) {
  const projectById = new Map(projects.map(project => [project.id, project]));
  const scheduleById = new Map(schedules.map(schedule => [schedule.id, schedule]));
  const totals = new Map<string | null, { id: string | null; name: string; minutes: number }>();
  for (const session of sessions) {
    const projectId = session.schedule_id ? scheduleById.get(session.schedule_id)?.project_id : null;
    const project = projectId ? projectById.get(projectId) : undefined;
    const id = project?.id ?? null;
    const total = totals.get(id) ?? { id, name: project?.name ?? 'Unassigned', minutes: 0 };
    total.minutes += (session.duration_sec ?? 0) / 60;
    totals.set(id, total);
  }
  return [...totals.values()].sort((a, b) => b.minutes - a.minutes);
}

import { expect, it } from 'vitest';
import { projectFocusMinutes } from './review-projects';

it('keeps identically named projects and the unassigned bucket separate', () => {
  const projects = [{ id: 'a', name: 'Study' }, { id: 'b', name: 'Study' }, { id: 'c', name: 'Unassigned' }];
  const schedules = projects.map(project => ({ id: `task-${project.id}`, project_id: project.id }));
  const sessions = [
    { schedule_id: 'task-a', duration_sec: 60 },
    { schedule_id: 'task-b', duration_sec: 120 },
    { schedule_id: 'task-c', duration_sec: 180 },
    { schedule_id: null, duration_sec: 240 },
    { schedule_id: 'task-a', duration_sec: 60 }
  ];
  expect(projectFocusMinutes(sessions, schedules, projects)).toEqual([
    { id: null, name: 'Unassigned', minutes: 4 },
    { id: 'c', name: 'Unassigned', minutes: 3 },
    { id: 'a', name: 'Study', minutes: 2 },
    { id: 'b', name: 'Study', minutes: 2 }
  ]);
});

it('groups missing schedule/project links as unassigned and treats unfinished time as zero', () => {
  expect(projectFocusMinutes([
    { schedule_id: 'missing', duration_sec: 60 },
    { schedule_id: 'orphan', duration_sec: 120 },
    { schedule_id: null, duration_sec: null }
  ], [{ id: 'orphan', project_id: 'deleted' }], [])).toEqual([
    { id: null, name: 'Unassigned', minutes: 3 }
  ]);
});

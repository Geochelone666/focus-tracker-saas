import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readGettingStarted } from './getting-started';
const id = '11111111-1111-4111-8111-111111111111';
const task = {
  id,
  title: 'Plan',
  scheduled_date: null,
  scheduled_time: null,
  estimated_minutes: 25,
  is_done: false,
  skill_id: null,
};
function fixture(results: unknown[], totals: unknown[] = []) {
  const queries: { eq: ReturnType<typeof vi.fn>; limit: ReturnType<typeof vi.fn> }[] = [];
  const from = vi.fn(() => {
    const result = results.shift();
    const q = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(result),
      maybeSingle: vi.fn().mockResolvedValue(result),
    };
    queries.push(q);
    return q;
  });
  const rpc = vi.fn().mockResolvedValue({ data: totals, error: null });
  return { client: { from, rpc } as unknown as SupabaseClient, queries, from, rpc };
}
it('bounds recent reads and keeps unknown focus different from zero', async () => {
  const f = fixture([{ data: [task] }, { data: null }]);
  const result = await readGettingStarted(f.client, 'owner');
  expect(result.actualSeconds).toBeNull();
  expect(result.task?.id).toBe(id);
  expect(f.queries[0].limit).toHaveBeenCalledWith(30);
  for (const q of f.queries) expect(q.eq).toHaveBeenCalledWith('user_id', 'owner');
  expect(f.rpc).toHaveBeenCalledWith('task_focus_totals', { p_ids: [id] });
});
it('loads an explicitly selected older task using the authenticated owner', async () => {
  const f = fixture(
    [{ data: [] }, { data: { id: 'session', schedule_id: 'other' } }, { data: task }],
    [{ schedule_id: id, seconds: 0 }]
  );
  const result = await readGettingStarted(f.client, 'owner', id);
  expect(result.actualSeconds).toBe(0);
  expect(result.active?.schedule_id).toBe('other');
  expect(f.queries[2].eq).toHaveBeenCalledWith('user_id', 'owner');
  expect(f.queries[2].eq).toHaveBeenCalledWith('id', id);
});
it('does not substitute a different task for an unavailable or foreign ID', async () => {
  const f = fixture([{ data: [task] }, { data: null }, { data: null }]);
  expect((await readGettingStarted(f.client, 'owner', id)).task).toBeNull();
  expect(f.rpc).not.toHaveBeenCalled();
});
it('fails on invalid IDs or read errors instead of inventing progress', async () => {
  const f = fixture([{ error: { message: 'private detail' } }, { data: null }]);
  await expect(readGettingStarted(f.client, 'owner', 'bad')).rejects.toThrow();
  expect(f.from).not.toHaveBeenCalled();
  await expect(readGettingStarted(f.client, 'owner')).rejects.toThrow('Guide unavailable');
});

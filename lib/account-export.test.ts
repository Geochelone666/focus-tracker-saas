import { expect, it, vi } from 'vitest';
import { accountExportChunks, EXPORT_COLLECTIONS, validateExportPage, type ExportPage } from './account-export';
const empty = (): ExportPage => ({ rows: [], next_cursor: null, captured_at: '2026-11-06T05:00:00Z' });
it('streams all pages, escapes content and records actual counts without losing bigint strings', async () => {
  const read = vi.fn().mockImplementation(async (collection, cursor) => {
    if (collection === 'tasks' && cursor === null) return { ...empty(), rows: [{ id: 'a', title: 'quote " and \n newline', deleted_at: '2026-11-01' }], next_cursor: 'a' };
    if (collection === 'tasks') return { ...empty(), rows: [{ id: 'b', title: '=SUM(1,2)' }] };
    if (collection === 'focus_segments') return { ...empty(), rows: [{ id: '9007199254740993', duration_ms: '9007199254740993' }] };
    return empty();
  });
  let text = '';
  for await (const chunk of accountExportChunks('owner', empty().captured_at, read, empty())) text += chunk;
  const result = JSON.parse(text);
  expect(result).toMatchObject({ format: 'focus-account/v1', owner_id: 'owner', complete: true, counts: { tasks: 2, focus_segments: 1 } });
  expect(Object.keys(result.data)).toEqual([...EXPORT_COLLECTIONS]);
  expect(result.data.tasks[0].title).toBe('quote " and \n newline');
  expect(result.data.focus_segments[0].id).toBe('9007199254740993');
  expect(read).toHaveBeenCalledWith('tasks', 'a');
  expect(result.consistency).toContain('not an atomic snapshot');
});
it('reads lazily and leaves no completion marker after a later failure', async () => {
  const read = vi.fn().mockRejectedValue(new Error('private SQL detail'));
  const chunks = accountExportChunks('owner', empty().captured_at, read, empty());
  await chunks.next();
  expect(read).not.toHaveBeenCalled();
  let partial = '';
  await expect((async () => { for await (const chunk of chunks) partial += chunk; })()).rejects.toThrow();
  expect(partial).not.toContain('"complete":true');
  expect(() => JSON.parse(partial)).toThrow();
});
it('rejects corrupt or non-advancing pages instead of looping or silently truncating', async () => {
  expect(() => validateExportPage({ ...empty(), rows: Array(101).fill({}) })).toThrow();
  expect(() => validateExportPage({ ...empty(), next_cursor: 'x' })).toThrow();
  const read = vi.fn().mockResolvedValue({ ...empty(), rows: [{ id: 'x' }], next_cursor: 'x' });
  await expect((async () => { for await (const chunk of accountExportChunks('owner', empty().captured_at, read, empty())) void chunk; })()).rejects.toThrow(/did not advance/);
});

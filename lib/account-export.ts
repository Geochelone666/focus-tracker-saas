export const EXPORT_COLLECTIONS = [
  'profile', 'skills', 'projects', 'tasks', 'focus_sessions', 'focus_segments',
  'daily_reflections', 'calendar_state', 'calendar_drafts', 'calendar_receipts',
  'calendar_locks', 'work_preferences', 'ai_connections', 'ai_activity', 'notification_devices',
] as const;
export type ExportCollection = typeof EXPORT_COLLECTIONS[number];
export type ExportPage = {
  rows: Record<string, unknown>[];
  next_cursor: string | null;
  captured_at: string;
};
export type ReadExportPage = (collection: ExportCollection, cursor: string | null) => Promise<ExportPage>;

export function validateExportPage(value: unknown): ExportPage {
  const page = value as ExportPage | null;
  if (!page || !Array.isArray(page.rows) || page.rows.length > 100 ||
      page.rows.some(row => !row || typeof row !== 'object' || Array.isArray(row)) ||
      !(page.next_cursor === null || (typeof page.next_cursor === 'string' && page.next_cursor.length <= 64 && page.rows.length > 0)) ||
      typeof page.captured_at !== 'string' || !Number.isFinite(Date.parse(page.captured_at))) {
    throw new Error('Invalid export page');
  }
  return page;
}

/** Yield one bounded database page at a time; never collect the account in RAM. */
export async function* accountExportChunks(
  owner: string, startedAt: string, readPage: ReadExportPage, firstPage: ExportPage,
): AsyncGenerator<string> {
  const metadata = {
    format: 'focus-account/v1', owner_id: owner, started_at: startedAt,
    consistency: 'Each page is read independently. Concurrent edits, additions or deletions may not all be represented. This is not an atomic snapshot.',
    exclusions: ['Authentication credentials and sessions', 'API key values and hashes',
      'Push tokens, subscription endpoints and delivery internals', 'Browser-only preferences'],
    integer_encoding: 'PostgreSQL bigint values are decimal strings.',
    collections: EXPORT_COLLECTIONS,
  };
  yield JSON.stringify(metadata).slice(0, -1) + ',"data":{';
  const counts: Record<string, number> = {};
  const pageTimes: Record<string, { first: string; last: string }> = {};
  for (const [index, collection] of EXPORT_COLLECTIONS.entries()) {
    yield `${index ? ',' : ''}${JSON.stringify(collection)}:[`;
    let cursor: string | null = null;
    let count = 0;
    let pages = 0;
    do {
      // Bound the lifetime even if a corrupt upstream returns cycling cursors.
      if (++pages > 100000) throw new Error('Export page limit reached');
      const page = validateExportPage(index === 0 && pages === 1 ? firstPage : await readPage(collection, cursor));
      if (page.next_cursor !== null && page.next_cursor === cursor) throw new Error('Export cursor did not advance');
      pageTimes[collection] ??= { first: page.captured_at, last: page.captured_at };
      pageTimes[collection].last = page.captured_at;
      if (page.rows.length) yield (count ? ',' : '') + JSON.stringify(page.rows).slice(1, -1);
      count += page.rows.length;
      cursor = page.next_cursor;
    } while (cursor !== null);
    counts[collection] = count;
    yield ']';
  }
  // A failed/cancelled download must never contain this completion marker.
  yield `},"counts":${JSON.stringify(counts)},"page_read_times":${JSON.stringify(pageTimes)},"finished_at":${JSON.stringify(new Date().toISOString())},"complete":true}`;
}

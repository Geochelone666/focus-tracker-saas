import { redirect } from 'next/navigation';
import { createClient } from '@/supabase/server';
import { accountExportChunks, validateExportPage, type ReadExportPage } from '@/lib/account-export';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect('/login');
  if (process.env.FOCUS_DATA_EXPORT_ENABLED !== 'true') return new Response(null, { status: 404 });
  const stopped = new AbortController();
  const signal = AbortSignal.any([request.signal, stopped.signal, AbortSignal.timeout(50000)]);
  const readPage: ReadExportPage = async (collection, cursor) => {
    signal.throwIfAborted();
    const { data, error: readError } = await supabase.rpc('account_export_page', {
      p_collection: collection, p_after: cursor, p_limit: 100,
    }).abortSignal(signal);
    if (readError) throw new Error('Account export unavailable');
    const page = validateExportPage(data);
    if (page.rows.some(row => row.user_id !== user.id)) throw new Error('Account export owner mismatch');
    return page;
  };
  const startedAt = new Date().toISOString();
  let firstPage;
  try {
    firstPage = await readPage('profile', null);
  } catch {
    redirect('/settings/data?error=export');
  }
  const chunks = accountExportChunks(user.id, startedAt, readPage, firstPage);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        signal.throwIfAborted();
        const next = await chunks.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      } catch {
        stopped.abort();
        // Close with an error so browsers report an interrupted download, not a
        // successful partial JSON file. Never return database details in a file.
        controller.error(new Error('Account export interrupted; retry the download.'));
      }
    },
    async cancel() { stopped.abort(); await chunks.return(undefined); },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="focus-account-${startedAt.slice(0, 10)}.json"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { planningContext } from '@/lib/planning-data';
export const dynamic = 'force-dynamic';
export default async function DataPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await planningContext();
  if (process.env.FOCUS_DATA_EXPORT_ENABLED !== 'true') notFound();
  const params = await searchParams;
  return <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
    <Link href="/settings" className="underline">Back to settings</Link>
    <h1 className="text-2xl font-semibold">Download your data</h1>
    <p>Keep a copy of your tasks, projects and goals, skills, focus and break records, reflections, recovery notes and planning preferences.</p>
    <p className="text-sm text-slate-600">The JSON download includes completed tasks, Trash, planning history and connection/device settings. Passwords, access keys and notification delivery credentials are excluded. Your timezone and record IDs are included so you can understand dates and links between records.</p>
    <p className="text-sm text-slate-600">For a consistent copy, finish editing on other devices before downloading. Changes made during the download may not all be included. Your browser shows download progress; if it fails, retry here.</p>
    {params.error === 'export' && <p role="alert" className="text-red-800">Your data could not be downloaded. Please try again. If this continues, return later.</p>}
    <div className="flex flex-wrap gap-4">
      <a href="/settings/export" className="rounded bg-slate-900 px-4 py-3 text-white">Download account JSON</a>
      <a href="/history/export" className="rounded border px-4 py-3 underline">Download focus CSV</a>
    </div>
    <p className="text-sm text-slate-600">Store the downloaded file somewhere private: it contains your task text and personal notes.</p>
  </main>;
}

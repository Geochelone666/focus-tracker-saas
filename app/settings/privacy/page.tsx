import Link from 'next/link';
import { planningContext } from '@/lib/planning-data';
import { PrivacyAccessForm } from '@/components/privacy-access-form';

export default async function PrivacyPage() {
  await planningContext();
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <Link href="/settings" className="underline">Back to settings</Link>
      <h1 className="text-3xl font-bold">Privacy and access</h1>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Your records</h2>
        <p>Download your records from Settings. Keep downloaded files somewhere you trust.</p>
        {process.env.FOCUS_DATA_EXPORT_ENABLED === 'true' &&
          <Link href="/settings/data" className="block underline">Download account data</Link>}
        <Link href="/history/export" prefetch={false} className="block underline">Download focus history CSV</Link>
      </section>
      <section className="space-y-4 rounded border bg-white p-5">
        <h2 className="text-xl font-semibold">Connected access and reminders</h2>
        <p>Revoke existing AI connection keys and pause reminders on all registered devices. Revoked keys need to be replaced before their connected tools can use Focus Tracker again.</p>
        <p>Requests already running and notifications already sent may finish. Your tasks and focus records stay available, and you stay signed in.</p>
        <PrivacyAccessForm />
      </section>
      <p><Link href="/settings/privacy/delete" className="underline">Delete your account</Link></p>
      <div className="flex flex-wrap gap-4">
        <Link href="/settings/integrations" className="underline">Manage AI connections</Link>
        <Link href="/settings/notifications" className="underline">Manage phone reminders</Link>
      </div>
    </main>
  );
}

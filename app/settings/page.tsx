import { planningContext } from '@/lib/planning-data';
import { saveTimezone } from '@/app/planning/actions';
import { SubmitButton } from '@/components/submit-button';

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const params = await searchParams;
  const { zone } = await planningContext();
  return <main className="mx-auto max-w-2xl px-4 py-10">
    <h1 className="text-3xl font-bold">Settings</h1>
    {typeof params.error === 'string' && <p role="alert" className="mt-4 text-red-800">{params.error}</p>}
    {params.saved === '1' && <p role="status" className="mt-4 text-emerald-800">Timezone saved.</p>}
    <section className="mt-6 rounded-lg border bg-white p-5"><h2 className="mb-3 text-lg font-semibold">Your timezone</h2>
      <p className="mb-3 text-sm text-slate-600">Used for Today, reminders, session times and daily statistics. Calendar dates stay exactly as entered.</p>
      <form action={saveTimezone} className="space-y-3"><label className="block text-sm">IANA timezone<input name="timezone" required maxLength={100} defaultValue={zone} list="timezones" className="mt-1 w-full rounded border px-3 py-2" /></label>
        <datalist id="timezones">{['America/Toronto','America/New_York','America/Los_Angeles','Europe/London','Europe/Paris','Asia/Shanghai','Asia/Tokyo','Asia/Singapore','Australia/Sydney','UTC'].map(value=><option key={value} value={value} />)}</datalist>
        <SubmitButton label="Save timezone" />
      </form>
    </section>
    <section className="mt-6 rounded-lg border bg-white p-5"><h2 className="mb-3 text-lg font-semibold">Make it yours</h2><p className="text-sm text-slate-600">Use the theme button in the header to switch between light and dark mode. This preference is saved in this browser.</p></section>
    <section className="mt-6 rounded-lg border bg-white p-5"><h2 className="mb-3 text-lg font-semibold">On your phone</h2><p className="text-sm text-slate-600">Use your browser menu → Add to Home Screen (or Install app, when available) for quick access. An internet connection is required.</p></section>
  </main>;
}

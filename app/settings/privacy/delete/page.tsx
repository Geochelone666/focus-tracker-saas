import Link from 'next/link';
import { planningContext } from '@/lib/planning-data';
import { DeleteAccountForm } from '@/components/delete-account-form';

export default async function DeleteAccountPage() {
  const { user } = await planningContext();
  const authenticators = (user.factors ?? [])
    .filter(factor => factor.status === 'verified' && factor.factor_type === 'totp')
    .map((factor, index) => ({ id: factor.id, name: factor.friendly_name || `Authenticator ${index + 1}` }));
  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-10">
      <Link href="/settings/privacy" className="underline">Back to privacy and access</Link>
      <h1 className="text-3xl font-bold">Delete your account</h1>
      <p>Deleting {user.email ?? 'your account'} permanently removes your profile, tasks including Trash,
        projects, skills, focus records, reflections, calendar history, AI keys and device registrations.</p>
      <p>Export any records you want to keep before continuing.</p>
      <Link href="/settings/privacy" className="block underline">Review export and access options</Link>
      <p>Notifications and requests already in flight may finish. Copies you previously downloaded or
        shared remain wherever you stored them. Hosting backups and operational logs follow the
        hosting provider’s retention settings; this action does not erase those copies immediately.</p>
      <p>Use the password for your Focus Tracker account to verify this request. For an authenticator account, enter its current six-digit code below. Other multi-factor
        methods require a session that has completed multi-factor sign-in.</p>
      {process.env.SUPABASE_SERVICE_ROLE_KEY && user.email
        ? <DeleteAccountForm authenticators={authenticators} />
        : <p role="status">Account deletion is currently unavailable. Please contact the app administrator.</p>}
    </main>
  );
}

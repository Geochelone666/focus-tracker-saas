import Link from 'next/link';
import { logout } from '@/app/actions/auth';
import { createClient } from '@/supabase/server';
import { ThemeToggle } from './theme-toggle';
import { Navigation } from './navigation';

export async function Header() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <header className="border-b border-slate-200 bg-white">
    <div className="mx-auto w-full max-w-5xl space-y-3 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link prefetch={false} href={user ? '/today' : '/'} className="text-lg font-semibold text-slate-900">Focus Tracker</Link>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {user && <span className="max-w-48 truncate text-sm text-slate-600" title={user.email}>{user.email}</span>}
          <ThemeToggle />
          {user ? <form action={logout}><button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">Log out</button></form>
            : <Link prefetch={false} href="/login" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white">Log in</Link>}
        </div>
      </div>
      {user && <Navigation />}
    </div>
  </header>;
}

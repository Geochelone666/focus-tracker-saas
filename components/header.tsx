import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { createClient } from "@/supabase/server";

export async function Header() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold text-slate-900">
          Focus Tracker SaaS
        </Link>

        {user ? (
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">{user.email}</span>
            <Link href="/dashboard" className="text-sm font-medium text-slate-900 underline underline-offset-4">
              Dashboard
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 transition hover:bg-slate-100"
              >
                Logout
              </button>
            </form>
          </div>
        ) : (
          <Link
            href="/login"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Login
          </Link>
        )}
      </div>
    </header>
  );
}

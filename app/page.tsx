import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-73px)] w-full max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
      <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Focus Tracker SaaS</p>
      <h1 className="mb-4 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
        Stay focused and make progress every day.
      </h1>
      <p className="mb-8 max-w-xl text-base text-slate-600 sm:text-lg">
        Build habits, track sessions, and grow your focus with a clean Next.js + Supabase foundation.
      </p>
      <Link
        href="/login"
        className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
      >
        Login
      </Link>
    </main>
  );
}

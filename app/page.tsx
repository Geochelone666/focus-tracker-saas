import { LoginButton } from "@/components/login-button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
      <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Focus Tracker SaaS
      </p>
      <h1 className="mb-4 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
        Stay focused and make progress every day.
      </h1>
      <p className="mb-8 max-w-xl text-base text-slate-600 sm:text-lg">
        This project is initialized with Next.js App Router, Tailwind CSS, and
        Supabase client scaffolding to provide a clean full-stack foundation.
      </p>
      <LoginButton />
    </main>
  );
}

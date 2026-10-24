import Link from "next/link";
import { login, signup } from "./actions";

type LoginPageProps = {
  searchParams?: Promise<{
    message?: string;
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams: searchParamsPromise }: LoginPageProps) {
  const searchParams = await searchParamsPromise;
  return (
    <main className="mx-auto flex min-h-[calc(100vh-73px)] w-full max-w-md flex-col justify-center px-6 py-16">
      <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">Welcome back</h1>
      <p className="mb-8 text-sm text-slate-600">Log in or create an account with your email.</p>

      {searchParams?.message ? (
        <p role="status" className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {searchParams.message}
        </p>
      ) : null}

      <form className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <input type="hidden" name="next" value={typeof searchParams?.next==='string'?searchParams.next:''} />
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete="current-password"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
            placeholder="••••••••"
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            formAction={login}
            className="inline-flex flex-1 items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Login
          </button>
          <button
            formAction={signup}
            className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
          >
            Sign up
          </button>
        </div>
      </form>

      <Link href="/" className="mt-6 text-sm text-slate-600 underline underline-offset-2 hover:text-slate-900">
        Back to home
      </Link>
    </main>
  );
}

'use client';

import Link from 'next/link';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-2xl font-bold text-slate-900">Something went wrong</h1>
      <p role="alert" className="mt-3 text-slate-600">We could not load this page. Please try again in a moment.</p>
      <div className="mt-6 flex items-center gap-4">
        <button type="button" onClick={reset} className="rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-700">Try again</button>
        <Link href="/dashboard" className="text-sm underline">Back to dashboard</Link>
      </div>
    </main>
  );
}

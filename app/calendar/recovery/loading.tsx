export default function Loading() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8" aria-busy="true">
      <p role="status" className="text-slate-600">Loading your open tasks and recovery context…</p>
    </main>
  );
}

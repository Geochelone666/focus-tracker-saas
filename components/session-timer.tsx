"use client";

import { useEffect, useState } from "react";
import { formatElapsed } from "@/lib/active-session";

export function SessionTimer({ startedAt }: { startedAt: string }) {
  // A stable initial render avoids a server/client clock hydration mismatch.
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = () => setElapsed(Math.max(0, Date.now() - new Date(startedAt).getTime()));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <p role="timer" aria-label="Elapsed focus time" className="mt-4 text-4xl font-semibold tabular-nums text-slate-900">
      {formatElapsed(elapsed)}
    </p>
  );
}

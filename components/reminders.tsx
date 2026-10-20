'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { dayKey, dueSoon, type Reminder } from '@/lib/planning';

export function Reminders({ items, zone, userId, date }: { items: Reminder[]; zone: string; userId: string; date: string }) {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const tick = () => { const current = new Date(); setNow(current); if (dayKey(current,zone) !== date) router.refresh(); };
    tick(); const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, [date, zone, router]);
  const upcoming = now ? dueSoon(items, now, zone) : [];
  useEffect(() => {
    if (!enabled || !now || !('Notification' in window) || Notification.permission !== 'granted') return;
    for (const item of dueSoon(items, now, zone)) {
      const key = `reminder:${userId}:${item.id}:${item.scheduled_date}:${item.scheduled_time}`;
      try {
        if (sessionStorage.getItem(key)) continue;
        new Notification('Your plan starts soon', { body: `${item.title} · ${item.scheduled_time?.slice(0,5)}`, tag: key });
        sessionStorage.setItem(key,'1');
      } catch { setMessage('Notifications are unavailable in this browser. In-app reminders still work.'); }
    }
  }, [now, enabled, items, zone, userId]);
  async function enable() {
    if (!('Notification' in window)) { setMessage('This browser does not support desktop notifications.'); return; }
    try {
      const permission = await Notification.requestPermission();
      setEnabled(permission === 'granted');
      setMessage(permission === 'granted' ? 'Notifications enabled for this visit.' : 'Permission was not granted. In-app reminders still work.');
    } catch { setMessage('Notifications could not be enabled.'); }
  }
  return <section className="rounded-lg border bg-white p-5">
    <h2 className="font-semibold">Coming up</h2>
    <p className="mt-1 text-sm text-slate-600">Reminders appear 10 minutes before a timed plan, while Today is open. They do not run after you close this page.</p>
    <ul className="my-3 space-y-1" aria-live="polite">{upcoming.map(item => <li key={item.id} className="break-words text-sm">{item.scheduled_time?.slice(0,5)} · {item.title}</li>)}</ul>
    {now && upcoming.length === 0 && <p className="my-3 text-sm text-slate-500">Nothing due in the next 10 minutes.</p>}
    <button type="button" onClick={enable} disabled={enabled} className="rounded border px-3 py-2 text-sm disabled:opacity-50">{enabled ? 'Notifications enabled' : 'Enable browser notifications'}</button>
    {message && <p role="status" className="mt-2 text-sm text-slate-600">{message}</p>}
  </section>;
}

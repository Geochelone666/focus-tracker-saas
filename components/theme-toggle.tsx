'use client';

import { useEffect, useState } from 'react';
export function ThemeToggle() {
  const [dark,setDark] = useState(false);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem('focus-theme'); } catch { /* Private browsing can block storage. */ }
    const enabled = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setDark(enabled); document.documentElement.dataset.theme = enabled ? 'dark' : 'light';
  },[]);
  function toggle() {
    const next = !dark; setDark(next); document.documentElement.dataset.theme = next ? 'dark' : 'light';
    try { localStorage.setItem('focus-theme',next ? 'dark' : 'light'); } catch { /* Theme still works for this visit. */ }
  }
  return <button type="button" onClick={toggle} aria-pressed={dark} className="rounded border px-3 py-1.5 text-sm">{dark ? 'Light mode' : 'Dark mode'}</button>;
}

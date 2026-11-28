'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
const links = [['/today','Today'],['/inbox','Inbox'],['/calendar','Calendar'],['/dashboard','Focus'],['/projects','Projects'],['/skills','Skills'],['/review','Review'],['/history','History'],['/settings','Settings']];
export function Navigation() {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || pathname.startsWith(href + '/') ||
    (href === '/inbox' && pathname.startsWith('/plans/'));
  return <nav aria-label="Main navigation" className="flex flex-wrap gap-x-5 gap-y-3 border-t border-slate-100 pt-3">
    {links.map(([href,label]) => <Link prefetch={false} key={href} href={href} aria-current={active(href) ? (pathname === href ? 'page' : 'location') : undefined}
      className={`text-sm underline-offset-4 hover:underline ${active(href) ? 'font-semibold underline' : 'text-slate-600'}`}>{label}</Link>)}
  </nav>;
}

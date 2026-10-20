'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
const links = [['/today','Today'],['/inbox','Inbox'],['/calendar','Calendar'],['/dashboard','Focus'],['/projects','Projects'],['/skills','Skills'],['/review','Review'],['/history','History'],['/settings','Settings']];
export function Navigation() {
  const pathname = usePathname();
  return <nav aria-label="Main navigation" className="flex flex-wrap gap-x-5 gap-y-3 border-t border-slate-100 pt-3">
    {links.map(([href,label]) => <Link prefetch={false} key={href} href={href} aria-current={pathname === href ? 'page' : undefined}
      className={`text-sm underline-offset-4 hover:underline ${pathname === href ? 'font-semibold underline' : 'text-slate-600'}`}>{label}</Link>)}
  </nav>;
}

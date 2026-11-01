import Link from 'next/link';
import {planningContext} from '@/lib/planning-data';
import {SmartCalendarPreview} from '@/components/smart-calendar-preview';
export default async function SmartPreviewPage(){
 await planningContext();
 return <div><nav aria-label="Breadcrumb" className="mx-auto max-w-6xl px-4 pt-5 text-sm sm:px-6"><Link href="/calendar" className="underline">Calendar</Link><span className="mx-2">/</span>Smart Calendar demo</nav><SmartCalendarPreview/></div>;
}
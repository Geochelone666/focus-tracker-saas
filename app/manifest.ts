import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return { name: 'Focus Tracker', short_name: 'Focus', description: 'Plan your day and make room for focused work.', start_url: '/today', display: 'standalone', background_color: '#f8fafc', theme_color: '#0f172a', icons: [{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}] };
}

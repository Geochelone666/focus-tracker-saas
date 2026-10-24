/** Compare browser Origin to the public HTTP host, not Next's internal URL host. */
export function sameOrigin(request:Request){
 const origin=request.headers.get('origin');if(!origin)return true;
 try{const source=new URL(origin),internal=new URL(request.url);
 const host=request.headers.get('host')??internal.host;
 const protocol=request.headers.get('x-forwarded-proto')?.split(',')[0].trim()??internal.protocol.slice(0,-1);
 return source.origin===origin&&source.host===host&&source.protocol===protocol+':';
 }catch{return false;}
}

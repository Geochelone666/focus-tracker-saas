import {cronAuthorized,pushAdmin} from '@/lib/push';
import {sendReminders,checkReceipts} from '@/lib/push-dispatch';
import {json} from '@/lib/integration-api';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
async function dispatch(request:Request){
 if(!cronAuthorized(request.headers.get('authorization'),process.env.CRON_SECRET))return json({error:'Unauthorized'},401);
 try{
  const client=pushAdmin();
  const sends=await sendReminders(client);
  let receipts=0,receiptCheckFailed=false;
  try{receipts=await checkReceipts(client);}catch(error){receiptCheckFailed=true;console.warn('push-receipts-failed',{kind:error instanceof Error?error.name:'Unknown'});}
  const cleanup=await client.rpc('cleanup_push_history');
  if(sends.claimed||receipts||receiptCheckFailed||cleanup.error)console.info('push-dispatch-summary',{claimed:sends.claimed,accepted:sends.accepted,receipts,receiptCheckFailed,cleanupFailed:Boolean(cleanup.error)});
  return json({...sends,receipts,receiptCheckFailed,cleanupFailed:Boolean(cleanup.error)});
 }catch(error){console.error('push-dispatch-failed',{kind:error instanceof Error?error.name:'Unknown'});return json({error:'Push dispatcher unavailable. Check server configuration and migration.'},503);}
}
export const GET=dispatch;export const POST=dispatch;

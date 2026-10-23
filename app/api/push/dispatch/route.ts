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
  try{receipts=await checkReceipts(client);}catch{receiptCheckFailed=true;}
  const cleanup=await client.rpc('cleanup_push_history');
  return json({...sends,receipts,receiptCheckFailed,cleanupFailed:Boolean(cleanup.error)});
 }catch{return json({error:'Push dispatcher unavailable. Check server configuration and migration.'},503);}
}
export const GET=dispatch;export const POST=dispatch;

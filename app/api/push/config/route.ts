import {webPushReady} from '@/lib/web-push';
import {json} from '@/lib/integration-api';
export function GET(){const ready=webPushReady()&&Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)&&(process.env.CRON_SECRET?.length??0)>=32;return json({ready,publicKey:ready?process.env.WEB_PUSH_PUBLIC_KEY:null});}

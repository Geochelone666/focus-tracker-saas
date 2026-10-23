import webpush from 'web-push';
import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const keys=webpush.generateVAPIDKeys();
const path='.env.push.local';
try{
 writeFileSync(path,`# Private configuration: do not commit, paste into chat, or upload publicly.\n# Set these values in Vercel, then redeploy. Use your actual support email below.\nWEB_PUSH_PUBLIC_KEY=${keys.publicKey}\nWEB_PUSH_PRIVATE_KEY=${keys.privateKey}\nWEB_PUSH_SUBJECT=mailto:you@example.com\nCRON_SECRET=${randomBytes(32).toString('hex')}\n# Copy your Supabase server-only service role key from the project settings:\nSUPABASE_SERVICE_ROLE_KEY=\n`,{mode:0o600,flag:'wx'});
 console.log('Created .env.push.local with private keys (values hidden). Existing files are never overwritten.');
}catch(error){if(error.code==='EEXIST'){console.error('.env.push.local already exists. Keep its existing keys; rotating VAPID keys requires devices to re-subscribe.');process.exitCode=1;}else throw error;}

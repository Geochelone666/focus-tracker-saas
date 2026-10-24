import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('web-push',()=>({default:{sendNotification:vi.fn().mockResolvedValue({statusCode:201})}}));
import webpush from 'web-push';
import {validWebSubscription,sendWebPush,webPushReady} from './web-push';
const subscription={endpoint:'https://web.push.apple.com/test',keys:{p256dh:'A'.repeat(87),auth:'A'.repeat(22)}};
beforeEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();});
describe('web push subscription safety',()=>{
 it.each(['https://web.push.apple.com/a','https://fcm.googleapis.com/fcm/send/a','https://updates.push.services.mozilla.com/wpush/v2/a'])('accepts supported provider %s',endpoint=>expect(validWebSubscription({...subscription,endpoint})).toBe(true));
 it.each(['http://web.push.apple.com/a','https://127.0.0.1/a','https://169.254.169.254/','https://evilpush.apple.com/a','https://web.push.apple.com.attacker.test/','https://web.push.apple.com:8443/a','https://user:pass@web.push.apple.com/a'])('blocks unsafe endpoints %s',endpoint=>expect(validWebSubscription({...subscription,endpoint})).toBe(false));
 it('checks key sizes',()=>{expect(validWebSubscription({...subscription,keys:{p256dh:'bad',auth:'bad'}})).toBe(false);});
 it('does not expose task titles in encrypted payloads',async()=>{vi.stubEnv('WEB_PUSH_PUBLIC_KEY','A'.repeat(87));vi.stubEnv('WEB_PUSH_PRIVATE_KEY','private');vi.stubEnv('WEB_PUSH_SUBJECT','mailto:owner@example.test');expect(webPushReady()).toBe(true);await sendWebPush(subscription,'plan-id');expect(vi.mocked(webpush.sendNotification).mock.calls[0][1]).toContain('plan-id');expect(vi.mocked(webpush.sendNotification).mock.calls[0][1]).not.toContain('notes');});
 it('checks endpoints again before server send, even for direct database inserts',async()=>{await expect(sendWebPush({...subscription,endpoint:'https://localhost/'})).rejects.toMatchObject({statusCode:410});expect(webpush.sendNotification).not.toHaveBeenCalled();});
});

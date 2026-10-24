import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({getUser:vi.fn(),client:vi.fn(),server:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:mocks.client}));
vi.mock('@/supabase/server',()=>({createClient:mocks.server}));
import {cronAuthorized,validPushDevice,pushUser} from './push';
const device={id:'11111111-1111-4111-8111-111111111111',expo_token:'ExpoPushToken[test-device]',name:'My iPhone',platform:'ios',lead_minutes:10};
beforeEach(()=>{vi.clearAllMocks();mocks.getUser.mockResolvedValue({data:{user:{id:'owner'}},error:null});mocks.client.mockReturnValue({auth:{getUser:mocks.getUser}});mocks.server.mockResolvedValue({auth:{getUser:mocks.getUser}});vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://example.invalid');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','test-public-key');});
describe('native push access boundaries',()=>{
 it('accepts web subscriptions without an Expo account',()=>{expect(validPushDevice({id:device.id,name:'Web app',platform:'web',transport:'web',web_subscription:{endpoint:'https://web.push.apple.com/test',keys:{p256dh:'A'.repeat(87),auth:'A'.repeat(22)}},lead_minutes:10})).toBe(true);});
 it('accepts supported devices and lead times',()=>{expect(validPushDevice(device)).toBe(true);expect(validPushDevice({...device,platform:'android',lead_minutes:0})).toBe(true);});
 it.each([{...device,user_id:'other'},{...device,expo_token:'https://attacker.test'},{...device,lead_minutes:4},{...device,name:''},{...device,platform:'web'},{...device,id:'not-a-uuid'}])('rejects invalid device %j',value=>expect(validPushDevice(value)).toBe(false));
 it('requires a strong configured cron secret and exact bearer value',()=>{const secret='a'.repeat(40);expect(cronAuthorized('Bearer '+secret,secret)).toBe(true);expect(cronAuthorized('Bearer '+secret+'x',secret)).toBe(false);expect(cronAuthorized('Bearer short','short')).toBe(false);expect(cronAuthorized(null,secret)).toBe(false);expect(cronAuthorized('Bearer test',undefined)).toBe(false);});
 it('verifies native account access tokens with Supabase',async()=>{const context=await pushUser(new Request('https://example.test',{headers:{Authorization:'Bearer jwt.payload.signature'}}));expect(context?.user.id).toBe('owner');expect(mocks.getUser).toHaveBeenCalledWith('jwt.payload.signature');});
 it('does not accept AI access keys or fall back to browser cookies on an invalid bearer',async()=>{expect(await pushUser(new Request('https://example.test',{headers:{Authorization:'Bearer ft_'+'a'.repeat(64)}}))).toBeNull();expect(mocks.server).not.toHaveBeenCalled();expect(mocks.client).not.toHaveBeenCalled();});
 it('denies expired native sessions',async()=>{mocks.getUser.mockResolvedValue({data:{user:null},error:{message:'expired'}});expect(await pushUser(new Request('https://example.test',{headers:{Authorization:'Bearer jwt.expired.signature'}}))).toBeNull();});
});

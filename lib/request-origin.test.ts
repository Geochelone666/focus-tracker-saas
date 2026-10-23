import {describe,it,expect} from 'vitest';
import {sameOrigin} from './request-origin';
describe('public browser Origin behind Next proxying',()=>{
 it('accepts the real public host even when the internal URL differs',()=>expect(sameOrigin(new Request('http://localhost:3007/api/push/devices',{headers:{host:'127.0.0.1:3007',origin:'http://127.0.0.1:3007'}}))).toBe(true));
 it('accepts HTTPS forwarding with an internal HTTP URL',()=>expect(sameOrigin(new Request('http://localhost/api/push/devices',{headers:{host:'focus.example','x-forwarded-proto':'https',origin:'https://focus.example'}}))).toBe(true));
 it('rejects a foreign Origin, invalid Origin, or protocol downgrade',()=>{for(const origin of ['https://attacker.example','null','http://focus.example'])expect(sameOrigin(new Request('http://localhost/api',{headers:{host:'focus.example','x-forwarded-proto':'https',origin}}))).toBe(false);});
});

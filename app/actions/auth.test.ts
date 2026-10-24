import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({create:vi.fn(),cookie:vi.fn(),remove:vi.fn(),getUser:vi.fn(),signOut:vi.fn(),delete:vi.fn(),eq:vi.fn()}));
vi.mock('@/supabase/server',()=>({createClient:m.create}));
vi.mock('next/headers',()=>({cookies:async()=>({get:m.cookie,delete:m.remove})}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('next/navigation',()=>({redirect:(url:string)=>{throw new Error(url);}}));
import {logout} from './auth';
beforeEach(()=>{vi.clearAllMocks();m.cookie.mockReturnValue(undefined);m.getUser.mockResolvedValue({data:{user:{id:'owner'}}});m.signOut.mockResolvedValue({error:null});m.eq.mockReturnValue({eq:m.eq,then:(resolve:(value:unknown)=>void)=>Promise.resolve({error:null}).then(resolve)});m.delete.mockReturnValue({eq:m.eq});m.create.mockResolvedValue({auth:{getUser:m.getUser,signOut:m.signOut},from:()=>({delete:m.delete})});});
describe('logout disconnects this browser only',()=>{
 it('leaves other phones untouched when this browser has no subscription',async()=>{await expect(logout()).rejects.toThrow('/login');expect(m.delete).not.toHaveBeenCalled();expect(m.signOut).toHaveBeenCalled();});
 it('removes only the current owner’s selected device before signing out',async()=>{m.cookie.mockReturnValue({value:'11111111-1111-4111-8111-111111111111'});await expect(logout()).rejects.toThrow('/login');expect(m.eq).toHaveBeenCalledWith('user_id','owner');expect(m.remove).toHaveBeenCalledWith('focus_push_device');expect(m.signOut).toHaveBeenCalled();});
});

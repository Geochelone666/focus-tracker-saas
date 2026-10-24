import React,{useEffect,useRef,useState,useCallback} from 'react';
import {Alert,AppState,FlatList,KeyboardAvoidingView,Linking,Modal,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View,ActivityIndicator} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import type {Session} from '@supabase/supabase-js';
import {APP_ORIGIN,configured,deviceRequest,phoneRequest,supabase} from './src/client';
import {disablePush,enablePush,installationId,openNotificationSettings,pushOptedIn,refreshPush} from './src/notifications';
import {draftFor,localDay,parseDraft,PLAN_COLUMNS,type Draft,type Plan} from './src/plans';
type Tab='Today'|'Inbox'|'All'|'Trash'|'Settings';
type Focus={id:string;started_at:string;schedule_id:string|null};
const errorText=(error:unknown)=>error instanceof Error?error.message:'Could not connect. Please try again.';
function Button({title,onPress,disabled=false,secondary=false}:{title:string;onPress:()=>void;disabled?:boolean;secondary?:boolean}){
 return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button,secondary&&styles.secondary,disabled&&styles.disabled]}><Text style={[styles.buttonText,secondary&&styles.secondaryText]}>{title}</Text></Pressable>;
}
function AppContent(){
 const [session,setSession]=useState<Session|null>(null),[authReady,setAuthReady]=useState(false);
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[authBusy,setAuthBusy]=useState(false),[authMessage,setAuthMessage]=useState('');
 const [tab,setTab]=useState<Tab>('Today'),[plans,setPlans]=useState<Plan[]>([]),[zone,setZone]=useState('America/Toronto'),[zoneDraft,setZoneDraft]=useState('America/Toronto');
 const [refreshing,setRefreshing]=useState(false),[message,setMessage]=useState(''),[focus,setFocus]=useState<Focus|null>(null),[offset,setOffset]=useState(0),[more,setMore]=useState(false);
 const [editor,setEditor]=useState<{plan?:Plan;draft:Draft}|null>(null),[saving,setSaving]=useState(false),[mutation,setMutation]=useState(false),[lead,setLead]=useState(10),[pushEnabled,setPushEnabled]=useState(false),[pushBusy,setPushBusy]=useState(false);
 const pendingNotification=useRef<string|null>(null),requestNumber=useRef(0),userId=session?.user.id;
 const currentUser=useRef(userId);currentUser.current=userId;
 useEffect(()=>{
  let alive=true;
  supabase.auth.getSession().then(({data})=>{if(alive){setSession(data.session);setAuthReady(true);}}).catch(()=>{if(alive)setAuthReady(true);});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,current)=>{if(alive){setSession(current);setAuthReady(true);}});
  const autoRefresh=()=>{if(AppState.currentState==='active')supabase.auth.startAutoRefresh();else supabase.auth.stopAutoRefresh();};
  autoRefresh();const listener=AppState.addEventListener('change',autoRefresh);
  return()=>{alive=false;subscription.unsubscribe();listener.remove();supabase.auth.stopAutoRefresh();};
 },[]);
 const load=useCallback(async(append=false)=>{
  if(!userId)return;const request=++requestNumber.current;setRefreshing(true);
  try{
   const profile=await supabase.from('profiles').select('timezone').eq('user_id',userId).maybeSingle();
   if(profile.error)throw new Error('Could not load account settings. Please try again.');
   let accountZone=profile.data?.timezone??'America/Toronto';try{localDay(accountZone);}catch{accountZone='America/Toronto';}
   if(request!==requestNumber.current)return;setZone(accountZone);
   const today=localDay(accountZone),start=append?offset:0;
   let query=supabase.from('schedules').select(PLAN_COLUMNS).eq('user_id',userId);
   query=tab==='Trash'?query.not('deleted_at','is',null):query.is('deleted_at',null);
   if(tab==='Today')query=query.or(`scheduled_date.eq.${today},and(scheduled_date.lt.${today},is_done.eq.false)`);
   if(tab==='Inbox')query=query.is('scheduled_date',null);
   const [tasks,active]=await Promise.all([query.order('is_done').order('scheduled_date',{nullsFirst:true}).order('id').range(start,start+99),supabase.from('focus_sessions').select('id,started_at,schedule_id').eq('user_id',userId).is('ended_at',null).maybeSingle()]);
   if(tasks.error||active.error)throw new Error('Could not refresh. Your last view has been kept.');
   if(request!==requestNumber.current)return;
   setPlans(previous=>append?[...previous,...tasks.data as Plan[]]:tasks.data as Plan[]);setOffset(start+(tasks.data?.length??0));setMore(tasks.data?.length===100);setFocus(active.data);setMessage('');
  }catch(error){if(request===requestNumber.current)setMessage(errorText(error));}
  finally{if(request===requestNumber.current)setRefreshing(false);}
 },[userId,tab,offset]);
 const loadRef=useRef(load);loadRef.current=load;
 useEffect(()=>{
  requestNumber.current++;setPlans([]);setOffset(0);setMore(false);setFocus(null);setEditor(null);setMessage('');
  if(userId)void loadRef.current();
 },[userId,tab]);
 useEffect(()=>{
  if(!userId)return;
  let mounted=true,lastPush=0;
  const refresh=()=>{if(AppState.currentState!=='active')return;void loadRef.current();if(Date.now()-lastPush>60000){lastPush=Date.now();refreshPush(userId).then(enabled=>{if(mounted)setPushEnabled(enabled);}).catch(()=>{});}};
  refresh();const timer=setInterval(()=>{if(tab!=='Settings')refresh();},30000),listener=AppState.addEventListener('change',state=>{if(state==='active')refresh();});
  return()=>{mounted=false;clearInterval(timer);listener.remove();};
 },[userId,tab]);
 useEffect(()=>{if(tab!=='Settings'||!userId)return;setZoneDraft(zone);let alive=true;deviceRequest('GET').then(async result=>{const id=await installationId();const device=result.data.find((item:{id:string})=>item.id===id);if(alive&&device)setLead(device.lead_minutes);}).catch(()=>{});return()=>{alive=false;};},[tab,userId]);
 const openPlan=useCallback(async(id:string)=>{
  if(!userId){pendingNotification.current=id;return;}
  try{const {data,error}=await supabase.from('schedules').select(PLAN_COLUMNS).eq('id',id).eq('user_id',userId).is('deleted_at',null).maybeSingle();
  if(error||!data)throw new Error('This plan is unavailable in the current account.');if(currentUser.current===userId)setEditor({plan:data as Plan,draft:draftFor(data as Plan)});
  }catch(error){Alert.alert('Plan unavailable',errorText(error));}
 },[userId]);
 useEffect(()=>{
  const handle=(response:Notifications.NotificationResponse)=>{const id=response.notification.request.content.data.scheduleId;if(typeof id==='string'&&/^[a-f0-9-]{36}$/i.test(id)){void openPlan(id);void Notifications.clearLastNotificationResponseAsync();}};
  const listener=Notifications.addNotificationResponseReceivedListener(handle);
  Notifications.getLastNotificationResponseAsync().then(response=>{if(response)handle(response);});
  return()=>listener.remove();
 },[openPlan]);
 useEffect(()=>{if(userId&&pendingNotification.current){const id=pendingNotification.current;pendingNotification.current=null;void openPlan(id);}},[userId,openPlan]);
 async function authenticate(signup=false){
  if(!email.trim()||!password){setAuthMessage('Enter your email and password.');return;}
  setAuthBusy(true);setAuthMessage('');
  try{const {data,error}=signup?await supabase.auth.signUp({email:email.trim(),password}):await supabase.auth.signInWithPassword({email:email.trim(),password});if(error)throw error;setPassword('');if(!data.session)setAuthMessage('Check your email to confirm your account, then sign in.');}catch(error){setAuthMessage(errorText(error));}finally{setAuthBusy(false);}
 }
 async function savePlan(){
  if(!editor||!userId)return;setSaving(true);
  try{const patch=parseDraft(editor.draft);const query=editor.plan?supabase.from('schedules').update(patch).eq('id',editor.plan.id).eq('user_id',userId).eq('updated_at',editor.plan.updated_at):supabase.from('schedules').insert({...patch,user_id:userId});
  const {data,error}=await query.select('id');if(error)throw new Error('Could not save. Your input has been kept.');if(!data?.length)throw new Error('This plan changed on another device or in AI. Close and reopen it before editing. Your input has been kept.');setEditor(null);await loadRef.current();}catch(error){Alert.alert('Not saved',errorText(error));}finally{setSaving(false);}
 }
 async function changePlan(plan:Plan,patch:Record<string,unknown>){
  if(!userId)return;setMutation(true);
  try{const {data,error}=await supabase.from('schedules').update(patch).eq('id',plan.id).eq('user_id',userId).eq('updated_at',plan.updated_at).select('id');if(error||!data?.length)throw new Error('This plan could not be changed. Refresh and try again; another device may have edited it.');await loadRef.current();}catch(error){Alert.alert('Not changed',errorText(error));}finally{setMutation(false);}
 }
 async function startFocus(plan:Plan){
  if(!userId)return;setMutation(true);
  try{const {error}=await supabase.from('focus_sessions').insert({user_id:userId,schedule_id:plan.id,skill_id:plan.skill_id});if(error)throw new Error('Could not start focus. You may already have an active session on another device.');await loadRef.current();}catch(error){Alert.alert('Focus',errorText(error));}finally{setMutation(false);}
 }
 async function stopFocus(){
  if(!focus||!userId)return;setMutation(true);
  try{const ended=new Date(),seconds=Math.max(0,Math.floor((ended.getTime()-Date.parse(focus.started_at))/1000));const {data,error}=await supabase.from('focus_sessions').update({ended_at:ended.toISOString(),duration_sec:seconds}).eq('id',focus.id).eq('user_id',userId).is('ended_at',null).select('id');if(error||!data?.length)throw new Error('Could not stop this session. Refresh to check its current state.');await loadRef.current();}catch(error){Alert.alert('Focus',errorText(error));}finally{setMutation(false);}
 }
 async function togglePush(){
  if(!userId)return;setPushBusy(true);
  try{if(pushEnabled){await disablePush();setPushEnabled(false);}else{await enablePush(userId,lead);setPushEnabled(true);}Alert.alert('Notifications',pushEnabled?'Notifications disabled on this phone.':'This phone is registered. Timed plans can now receive server reminders when the notification service is configured.');}catch(error){Alert.alert('Notifications',errorText(error));}finally{setPushBusy(false);}
 }
 async function logout(){
  try{if(userId&&await pushOptedIn(userId))await disablePush();const {error}=await supabase.auth.signOut({scope:'local'});if(error)throw error;setPushEnabled(false);}catch(error){Alert.alert('Could not sign out',errorText(error)+' Keep an internet connection so this phone can be disconnected from reminders first.');}
 }
 async function saveZone(){
  if(!userId)return;
  try{localDay(zoneDraft.trim());const {error}=await supabase.from('profiles').upsert({user_id:userId,timezone:zoneDraft.trim()},{onConflict:'user_id'});if(error)throw error;setZone(zoneDraft.trim());Alert.alert('Saved','Timezone updated across your devices.');}catch{Alert.alert('Not saved','Enter a valid IANA timezone, such as Asia/Shanghai or America/New_York.');}
 }
 if(!configured)return <SafeAreaView style={styles.screen}><Text style={styles.heading}>Setup required</Text><Text style={styles.text}>This build is missing its public Supabase configuration. Ask the app administrator for a configured build.</Text></SafeAreaView>;
 if(!authReady)return <SafeAreaView style={styles.screen}><ActivityIndicator accessibilityLabel="Loading account"/></SafeAreaView>;
 if(!session)return <SafeAreaView style={styles.screen}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={styles.flex}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
 <Text style={styles.heading}>Focus Tracker</Text><Text style={styles.text}>Sign in with the same account you use on your computer.</Text>
 <TextInput accessibilityLabel="Email" placeholder="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} style={styles.input}/>
 <TextInput accessibilityLabel="Password" placeholder="Password" autoCapitalize="none" secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} style={styles.input}/>
 {authMessage?<Text accessibilityRole="alert" style={styles.error}>{authMessage}</Text>:null}
 <Button title={authBusy?'Please wait…':'Sign in'} disabled={authBusy} onPress={()=>void authenticate()}/><Button title="Create account" secondary disabled={authBusy} onPress={()=>void authenticate(true)}/>
 <Text style={styles.muted}>Notifications are optional. You will only be asked when you enable reminders in Settings.</Text>
 </ScrollView></KeyboardAvoidingView></SafeAreaView>;
 return <SafeAreaView style={styles.screen}>
 <View style={styles.header}><Text style={styles.heading}>Focus Tracker</Text><Text style={styles.muted}>{zone}</Text></View>
 <ScrollView horizontal style={styles.tabs} contentContainerStyle={styles.tabContent}>{(['Today','Inbox','All','Trash','Settings'] as Tab[]).map(value=><Button key={value} title={value} secondary={value!==tab} onPress={()=>setTab(value)}/>)}</ScrollView>
 {tab==='Settings'?<ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
 <Text style={styles.subheading}>Phone notifications</Text><Text style={styles.text}>Allow notifications to receive timed-plan reminders while the app is closed. Titles and notes stay off the lock screen. Delivery depends on your network and phone settings.</Text>
 <Text style={styles.text}>Remind me before a plan starts:</Text><View style={styles.row}>{[0,5,10,15,30,60].map(minutes=><Button key={minutes} title={minutes===0?'At start':`${minutes} min`} secondary={lead!==minutes} onPress={()=>setLead(minutes)}/>)}</View>
 <Button title={pushBusy?'Please wait…':pushEnabled?'Disable notifications':'Enable notifications'} disabled={pushBusy} onPress={()=>void togglePush()}/>
 {pushEnabled&&<Button title="Save reminder timing" secondary disabled={pushBusy} onPress={()=>{setPushBusy(true);enablePush(userId!,lead).then(()=>Alert.alert('Saved','Reminder timing saved for this phone.')).catch(error=>Alert.alert('Not saved',errorText(error))).finally(()=>setPushBusy(false));}}/>}
 {pushEnabled&&<Button title="Send test notification" secondary disabled={pushBusy} onPress={()=>{setPushBusy(true);installationId().then(id=>phoneRequest('/api/push/test','POST',{id})).then(()=>Alert.alert('Test accepted','The push provider accepted the test. Check your phone notifications. This does not confirm delivery.')).catch(error=>Alert.alert('Test failed',errorText(error))).finally(()=>setPushBusy(false));}}/>}
 <Button title="Open phone notification settings" secondary onPress={()=>void openNotificationSettings()}/>
 <Text style={styles.subheading}>Account timezone</Text><TextInput accessibilityLabel="Account timezone" autoCapitalize="none" value={zoneDraft} onChangeText={setZoneDraft} style={styles.input}/><Button title="Save timezone" onPress={()=>void saveZone()}/>
 <Text style={styles.subheading}>Your workspace</Text><Text style={styles.muted}>{session.user.email}</Text><Button title="Open calendar, projects and weekly review" secondary onPress={()=>void Linking.openURL(APP_ORIGIN+'/today')}/><Button title="Manage AI connections on web" secondary onPress={()=>void Linking.openURL(APP_ORIGIN+'/settings/integrations')}/><Button title="Sign out" secondary onPress={()=>void logout()}/>
 </ScrollView>:<>
 {focus&&<View style={styles.focus}><Text style={styles.text}>Focus started {new Date(focus.started_at).toLocaleString('en-US',{timeZone:zone})}</Text><Button title="Stop focus" disabled={mutation} onPress={()=>void stopFocus()}/></View>}
 {message?<View style={styles.content}><Text accessibilityRole="alert" style={styles.error}>{message}</Text><Button title="Retry" secondary onPress={()=>void loadRef.current()}/></View>:null}
 <FlatList data={plans} keyExtractor={plan=>plan.id} refreshing={refreshing} onRefresh={()=>void loadRef.current()} contentContainerStyle={styles.list} ListEmptyComponent={<Text style={styles.muted}>{refreshing?'Loading…':tab==='Trash'?'Nothing in Trash.':'No plans here yet. Add one when you are ready.'}</Text>} ListFooterComponent={more?<Button title="Load more" secondary disabled={refreshing} onPress={()=>void loadRef.current(true)}/>:null} renderItem={({item})=><View style={styles.card}>
 <Text style={[styles.subheading,item.is_done&&styles.completed]}>{item.title}</Text><Text style={styles.muted}>{item.scheduled_date??'Inbox'}{item.scheduled_time?' · '+item.scheduled_time.slice(0,5):''} · {item.priority}{item.estimated_minutes?' · '+item.estimated_minutes+' min':''}</Text>
 {item.notes?<Text style={styles.text}>{item.notes}</Text>:null}
 {tab==='Trash'?<Button title="Restore" secondary disabled={mutation} onPress={()=>void changePlan(item,{deleted_at:null})}/>:<View style={styles.row}>
 <Button title={item.is_done?'Reopen':'✓ Complete'} disabled={mutation} onPress={()=>void changePlan(item,{is_done:!item.is_done,completed_at:item.is_done?null:new Date().toISOString()})}/>
 <Button title="Edit" secondary disabled={mutation} onPress={()=>setEditor({plan:item,draft:draftFor(item)})}/>
 {!item.is_done&&!focus&&<Button title="Start focus" secondary disabled={mutation} onPress={()=>void startFocus(item)}/>}
 <Button title="Trash" secondary disabled={mutation} onPress={()=>Alert.alert('Move to Trash?',item.title,[{text:'Cancel',style:'cancel'},{text:'Move to Trash',style:'destructive',onPress:()=>void changePlan(item,{deleted_at:new Date().toISOString()})}])}/>
 </View>}
 </View>}/>
 <View style={styles.footer}><Button title="+ Add plan" onPress={()=>setEditor({draft:{...draftFor(),date:tab==='Today'?localDay(zone):''}})}/></View>
 </>}
 <Modal visible={Boolean(editor)} animationType="slide" onRequestClose={()=>{if(!saving)Alert.alert('Discard changes?','Your unsaved input will be lost.',[{text:'Keep editing',style:'cancel'},{text:'Discard',style:'destructive',onPress:()=>setEditor(null)}]);}}>
 <SafeAreaView style={styles.screen}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={styles.flex}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
 <Text style={styles.heading}>{editor?.plan?'Edit plan':'New plan'}</Text><Text style={styles.muted}>Dates and times use {zone}. Leave the date empty for Inbox. Edits apply to this occurrence only.</Text>
 {editor&&(['title','date','time','notes','estimate'] as const).map(key=><View key={key}><Text style={styles.text}>{{title:'Title',date:'Date (YYYY-MM-DD, optional)',time:'Time (HH:MM, optional)',notes:'Notes (optional)',estimate:'Estimated minutes (optional)'}[key]}</Text><TextInput accessibilityLabel={key} value={editor.draft[key]} onChangeText={value=>setEditor(current=>current?{...current,draft:{...current.draft,[key]:value}}:null)} style={[styles.input,key==='notes'&&styles.notes]} multiline={key==='notes'} keyboardType={key==='estimate'?'number-pad':'default'} maxLength={key==='title'?120:key==='notes'?2000:key==='date'?10:key==='time'?5:4}/></View>)}
 <Text style={styles.text}>Priority</Text><View style={styles.row}>{['low','normal','high'].map(priority=><Button key={priority} title={priority} secondary={editor?.draft.priority!==priority} onPress={()=>setEditor(current=>current?{...current,draft:{...current.draft,priority}}:null)}/>)}</View>
 <Button title={saving?'Saving…':'Save plan'} disabled={saving} onPress={()=>void savePlan()}/><Button title="Cancel" secondary disabled={saving} onPress={()=>Alert.alert('Discard changes?','Your unsaved input will be lost.',[{text:'Keep editing',style:'cancel'},{text:'Discard',style:'destructive',onPress:()=>setEditor(null)}])}/>
 </ScrollView></KeyboardAvoidingView></SafeAreaView>
 </Modal>
 </SafeAreaView>;
}
export default function App(){return <SafeAreaProvider><AppContent/></SafeAreaProvider>;}
const styles=StyleSheet.create({
 flex:{flex:1},screen:{flex:1,backgroundColor:'#f8fafc'},content:{padding:20,gap:14},header:{paddingHorizontal:20,paddingTop:10,paddingBottom:12},heading:{fontSize:27,fontWeight:'700',color:'#0f172a'},subheading:{fontSize:18,fontWeight:'600',color:'#0f172a'},text:{fontSize:16,lineHeight:24,color:'#334155'},muted:{fontSize:14,lineHeight:21,color:'#64748b'},error:{fontSize:15,lineHeight:22,color:'#b91c1c'},input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#cbd5e1',borderRadius:10,padding:13,fontSize:16,color:'#0f172a'},notes:{minHeight:100,textAlignVertical:'top'},button:{backgroundColor:'#0f172a',borderRadius:9,paddingVertical:12,paddingHorizontal:15,alignItems:'center',justifyContent:'center',minHeight:44},buttonText:{color:'#fff',fontSize:15,fontWeight:'600'},secondary:{backgroundColor:'#e2e8f0'},secondaryText:{color:'#0f172a'},disabled:{opacity:0.5},tabs:{flexGrow:0,maxHeight:64},tabContent:{paddingHorizontal:16,paddingVertical:6,gap:8},row:{flexDirection:'row',flexWrap:'wrap',gap:8},list:{padding:16,gap:12,flexGrow:1},card:{backgroundColor:'#fff',padding:16,gap:10,borderRadius:12,borderWidth:1,borderColor:'#e2e8f0'},completed:{textDecorationLine:'line-through',color:'#64748b'},footer:{padding:16,borderTopWidth:1,borderColor:'#e2e8f0'},focus:{margin:16,padding:12,gap:10,backgroundColor:'#e0f2fe',borderRadius:10}
});

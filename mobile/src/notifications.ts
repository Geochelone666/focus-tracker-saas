import {Platform,Linking} from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import {deviceRequest} from './client';
const INSTALLATION='focus_push_installation',ENABLED='focus_push_user';
Notifications.setNotificationHandler({handleNotification:async()=>({shouldPlaySound:true,shouldSetBadge:false,shouldShowBanner:true,shouldShowList:true})});
export async function installationId(){let id=await SecureStore.getItemAsync(INSTALLATION);if(!id){id=Crypto.randomUUID();await SecureStore.setItemAsync(INSTALLATION,id);}return id;}
export async function enablePush(userId:string,leadMinutes:number){
 if(!Device.isDevice)throw new Error('Use a physical phone to enable push notifications.');
 const projectId=Constants.expoConfig?.extra?.eas?.projectId??Constants.easConfig?.projectId;
 if(!projectId)throw new Error('Push setup is incomplete. This build needs its EAS project ID.');
 if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('schedule-reminders',{name:'Schedule reminders',importance:Notifications.AndroidImportance.HIGH,sound:'default'});
 let permission=await Notifications.getPermissionsAsync();
 if(!permission.granted){if(!permission.canAskAgain)throw new Error('Notifications are blocked. Open phone settings to allow them.');permission=await Notifications.requestPermissionsAsync({ios:{allowAlert:true,allowBadge:false,allowSound:true}});}
 if(!permission.granted)throw new Error('Permission was not granted. Your schedules still work without notifications.');
 const token=(await Notifications.getExpoPushTokenAsync({projectId})).data;
 await deviceRequest('POST',{id:await installationId(),expo_token:token,platform:Platform.OS,name:Device.modelName??'My phone',lead_minutes:leadMinutes});
 await SecureStore.setItemAsync(ENABLED,userId);
 return true;
}
export async function disablePush(){
 await deviceRequest('DELETE',{id:await installationId()});
 await SecureStore.deleteItemAsync(ENABLED);
}
export async function refreshPush(userId:string){
 if(await SecureStore.getItemAsync(ENABLED)!==userId)return false;
 const permission=await Notifications.getPermissionsAsync();
 if(!permission.granted){await disablePush();return false;}
 const projectId=Constants.expoConfig?.extra?.eas?.projectId??Constants.easConfig?.projectId;
 if(!projectId)return false;
 const token=(await Notifications.getExpoPushTokenAsync({projectId})).data;
 const result=await deviceRequest('PATCH',{id:await installationId(),expo_token:token});
 if(!result.enabled)await SecureStore.deleteItemAsync(ENABLED);
 return Boolean(result.enabled);
}
export const openNotificationSettings=()=>Linking.openSettings();

export const pushOptedIn=async(userId:string)=>(await SecureStore.getItemAsync(ENABLED))===userId;

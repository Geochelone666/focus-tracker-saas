import type {ExpoConfig} from 'expo/config';
const projectId=process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
const config:ExpoConfig={
 name:'Focus Tracker',slug:'focus-tracker-mobile',version:'1.0.0',platforms:['ios','android'],orientation:'portrait',scheme:'focus-tracker',userInterfaceStyle:'light',
 ios:{supportsTablet:true,bundleIdentifier:process.env.IOS_BUNDLE_IDENTIFIER??'com.geochelone666.focustracker',config:{usesNonExemptEncryption:false}},
 android:{package:process.env.ANDROID_PACKAGE??'com.geochelone666.focustracker',googleServicesFile:process.env.GOOGLE_SERVICES_JSON,blockedPermissions:['android.permission.RECORD_AUDIO','android.permission.CAMERA','android.permission.ACCESS_FINE_LOCATION','android.permission.ACCESS_COARSE_LOCATION','android.permission.READ_CONTACTS','android.permission.WRITE_CONTACTS']},
 plugins:[['expo-notifications',{defaultChannel:'schedule-reminders'}],['expo-secure-store',{configureAndroidBackup:true,faceIDPermission:false}]],
 extra:{...(projectId?{eas:{projectId}}:{})}
};
export default config;

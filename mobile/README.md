# Optional native Focus Tracker client

This Expo SDK 54 / React Native client supports iOS and Android. The default deployment uses the installable web app described in [phone notification setup](../docs/phone-notifications.md), which needs no developer accounts. This directory is optional and is not an APK/IPA download or an App Store listing.

The native client provides email sign-in/signup, Today/Inbox/All/Trash, dated and undated capture, notes/priority/estimates, one-occurrence edits, completion/reopen, restore, task-linked focus, account timezone, and server notifications. Calendar/projects/weekly review/AI connection management open the existing web workspace in the browser and may need a separate browser login. Native project pickers, a full native calendar, offline editing, and native dark mode are not implemented. Sessions are stored in encrypted SecureStore with chunked writes. AI editing keys are never used to sign the app in; ordinary Supabase user sessions and RLS are used.

## Local checks (no accounts)

```
cd mobile
npm ci --ignore-scripts
npm run typecheck
EXPO_OFFLINE=1 npm run check
EXPO_OFFLINE=1 npm run export:check
```

These checks export iOS/Android Hermes JavaScript bundles, not signed installable binaries. Do not load this code in Expo Go to test remote push: use a development build on a physical device. Expo's offline dependency check compares bundled SDK versions and cannot establish current registry security status.

## Native setup and signed builds

1. Create a free Expo/EAS account and project. Before the first build, choose your permanent `IOS_BUNDLE_IDENTIFIER` and `ANDROID_PACKAGE`; set the project UUID as `EXPO_PUBLIC_EAS_PROJECT_ID`.
2. Copy `.env.example` to `.env` (ignored), fill the public Supabase URL/anon key and HTTPS web origin, and configure the same public variables in the EAS build environment. Never include service-role, cron, VAPID private, APNs, or Google service-account secrets in `EXPO_PUBLIC_*` values.
3. Install/run the official EAS CLI in your own authenticated environment. Use `eas build:configure`, `eas build --profile development --platform android` / `ios`, or the `preview` profile for an internally distributed Android APK. The iOS preview profile uses provisioning for registered devices; TestFlight requires a production/App Store build followed by submission. `eas.json` defines both profiles but no account-specific credentials. Replace the default Expo icon/branding with store-ready artwork before submission.
4. Android: register an app in Firebase for the chosen package. Configure FCM v1 credentials in EAS; inject `google-services.json` as the secret file referenced by `GOOGLE_SERVICES_JSON`. Do not commit it. APK sideloading does not require a Google Play developer account. Store distribution has separate registration requirements.
5. iOS: configure signing, Push Notifications capability, and an APNs key in EAS for your Apple Developer team. Broad TestFlight/App Store distribution generally requires the paid Apple Developer program. EAS build quotas and account pricing depend on the provider/plan. No cloud builds or store submissions have been started from this repository change.
6. On the server, complete the same database/cron setup as the PWA. Optionally enable Expo enhanced push security and set its server-only `EXPO_ACCESS_TOKEN` in Vercel. If enhanced security is enabled, this token is required for sends and receipts. Never put it in the mobile environment.
7. Install on physical devices, sign in, then Settings → Enable notifications. Android creates its channel before asking permission. iOS denial requires the user to change phone settings. Reminder timing can be saved per phone; Send test notification checks server/provider acceptance. Confirm background delivery, tap navigation, and timezone behavior on both systems. Provider acceptance does not prove display.

Logout disconnects this phone before removing its local account session. If the disconnect request fails, stay online and retry so old-account reminders are not retained. Account switching cannot take over an existing device/token registration owned by another account. Disconnect it from the old account first. Remote web disconnection is respected on the next resume and never silently re-enables push. Titles/notes are not sent in notifications.

## Dependencies

Versions are locked separately from the web application. The Metro configuration maps Supabase's optional Node `ws` import to React Native's WebSocket; Node stream/socket polyfills are not bundled. Patched PostCSS is overridden for build tools. Registry audit advisories remaining in Expo's transitive build tooling (notably node-forge and image-size) must be rechecked before a production store release; do not blindly apply `npm audit fix --force`, which currently suggests an incompatible Expo downgrade. The native client has not undergone signed-device or store validation.

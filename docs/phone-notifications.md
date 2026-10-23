# Installable app and background reminders

The default release path is an installable web app (PWA) on the existing HTTPS site. It needs **no Expo, Apple Developer, or Google Play account**. The optional `mobile/` Expo native client is kept for a future signed-app release; it is not needed for web push.

## User flow

- **iPhone/iPad:** iOS/iPadOS 16.4 or newer. Open the site in Safari → Share → Add to Home Screen → open the new Focus Tracker icon. Sign in, open Settings → Manage phone reminders, and tap Enable notifications. Permission must be requested from a user tap in the installed app; an ordinary Safari tab is insufficient.
- **Android:** use a supported modern browser such as Chrome → Install app / Add to Home Screen. Open the icon, sign in with the same account as your computer, and enable notifications under Settings. The browser may require repeated engagement before showing an install prompt; the browser menu remains available.
- Choose at-start or 5/10/15/30/60-minute advance reminders per device, send a test, or disable the device. Permission is optional. The app never asks for contacts or location.
- Click a reminder to open the current version of that plan. If logged out, successful login returns to the plan. Browser logout disconnects that browser's device row first; other phones remain connected. Remote Disconnect phone stops future sends. Clearing website storage removes the local marker, so remove any old registration from another device before re-enabling.
- Data remains in Supabase. Existing cross-device page refresh applies. The service worker handles notifications only and does **not** cache private tasks/pages. Internet access is required to load the application; offline editing is not implemented.

## Required setup before deployment

1. Apply `supabase/migrations/20261023010000_mobile_push.sql` after all prior migrations. It is transactional and rerunnable. Do not run `supabase/tests/*.sql` in production; those scripts are regression checks for a disposable test project.
2. Run `npm run push:keys` in the repository. It creates `.env.push.local` with mode 0600, refuses to overwrite existing keys, and never logs private values. This file is ignored by Git; it is not automatically loaded by Next.js. Keep it private. Do not put any of its secrets in `NEXT_PUBLIC_*`, chat messages, GitHub, screenshots, or mobile build variables.
3. Set these **server-only Vercel environment variables**, then redeploy:

| Name | Value |
| --- | --- |
| `WEB_PUSH_PUBLIC_KEY` | generated VAPID public key (the config endpoint exposes this public key only) |
| `WEB_PUSH_PRIVATE_KEY` | generated VAPID private key |
| `WEB_PUSH_SUBJECT` | your actual support email as `mailto:you@your-domain.com`, or an HTTPS contact URL |
| `CRON_SECRET` | generated random scheduler secret, at least 32 characters |
| `SUPABASE_SERVICE_ROLE_KEY` | the project's legacy service-role API key from Supabase settings; server only |

The existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` remain unchanged. Keep the same VAPID keys across deployments; rotating them requires devices to unsubscribe and subscribe again.

4. In Supabase Vault create secrets named **`focus_app_origin`** (the production HTTPS origin without a trailing slash) and **`focus_cron_secret`** (exactly the same `CRON_SECRET` as Vercel). Then run `supabase/mobile-push-cron.sql` in the SQL Editor. It enables pg_cron/pg_net and creates/replaces `focus-mobile-reminders` to POST to `/api/push/dispatch` every minute. These extensions are for hosted Supabase; the optional scheduler script is deliberately outside `migrations/` so local PostgreSQL/PGlite checks do not require hosted extensions. If using an alternative scheduler, send an authenticated POST every minute with `Authorization: Bearer CRON_SECRET`.
5. Wait for the application deployment to become Ready. Install on a physical iPhone and Android phone, sign in, and enable notifications. Send a test. Create a timed plan a few minutes ahead using the matching lead time; close the app and verify delivery and tap navigation. Check Supabase Cron job run history and Vercel function status if reminders do not arrive. A 200 dispatcher response reports accepted sends, not confirmed display on the phone. Check `receiptCheckFailed` and `cleanupFailed` as well as HTTP status.

No Vercel cron configuration is included: minute-level Vercel Cron is not available on every hosting plan. The Supabase scheduler avoids requiring that feature, but your actual Supabase/Vercel traffic and compute quotas still apply. Existing hosting quotas or provider changes may create costs; the app does not guarantee unlimited free delivery.

## Delivery rules and privacy

- Timed, unfinished, untrashed plans only; inbox and all-day tasks do not send reminders. Read the saved account IANA timezone; invalid/missing values fall back to America/Toronto, matching the application default.
- A one-minute scheduler selects reminders currently due, with up to five minutes' catch-up and no starts older than one minute. Long outages skip stale reminders. Delivery is best-effort, not an exact alarm: OS Focus/Do Not Disturb, battery restrictions, network status, browser force-stop, and push providers can delay or suppress notifications.
- Spring-forward nonexistent times are skipped. Ambiguous fall-back times use PostgreSQL's standard-time (later) occurrence, once. This deliberate backend policy differs from the foreground Coming up list, which can list either occurrence.
- At most ten registered devices per account. Registrations expire from eligibility after 30 days without an app visit; visible visits send a heartbeat. Web heartbeats never recreate a revoked registration or re-enable a disabled device. Device opt-in is separate from AI access-key permissions.
- Atomic two-minute leases and a unique device/plan/start key prevent normal duplicate scheduler claims. At most three attempts are allowed while still due. Network timeouts or a process failure after provider acceptance can still produce a duplicate; there is no exactly-once promise. Changes are rechecked just before send, but an already in-flight or delivered notification cannot be withdrawn.
- Default push messages contain no task title or notes. Only a random task identifier is included for navigation. On opening, the server checks the current account's ownership; private routes cannot be opened under another account. This avoids exposing private task text on lock screens or to push providers.
- Only allowlisted Apple, Google, Mozilla, and Windows push hosts are accepted. Validate endpoints again before dispatch to prevent SSRF even when an account bypasses the UI and writes directly through Supabase. Server-only functions use explicit grants; anonymous/users/AI keys cannot dispatch jobs or read delivery internals.
- Web push success means acceptance by the browser push service, not proof the user saw it. Expired subscriptions (HTTP 404/410) are disabled. Native Expo tickets are checked after 15 minutes; APNs/FCM acceptance likewise does not prove display. Delivery rows are cleaned up after 30 days. Device names and last-seen metadata are visible only to the owner; provider credentials remain on the server.

## Optional native apps later

See `mobile/README.md`. Source and both platform JavaScript bundles can be checked without accounts. Generating installable signed binaries, real-device push validation, TestFlight/App Store distribution, and store review require additional setup. A native client is not bundled into the Vercel web deployment. The PWA remains the immediate route for users without developer accounts.

## Validation receipt

356 automated tests across 30 files passed, including all migrations applied in CLI order, rerunning the new migration, and the transactional SQL checks for owner isolation, service-role-only dispatch, leases/retries, completion/rescheduling, disabled phones, web/native jobs, DST gaps and ambiguous times. TypeScript and lint checks and the Next.js production build passed. The optional native client passed its own typecheck and SDK dependency baseline check and exported both iOS/Android Hermes bundles.

A local fixture-backed Chromium check verified registration and disconnection UI using simulated permission/subscription data, actual service-worker activation, install manifest/assets, the owned-plan route, mobile layouts, and iPhone installation gating using a user-agent fixture. These checks did not exercise real APNs/FCM/browser push providers, physical iPhones/Android phones, App Store signing, a hosted Supabase scheduler, or production delivery. Live device delivery remains a required rollout check after deployment configuration.

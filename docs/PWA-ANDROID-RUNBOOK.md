# Workflow PWA and Android demo wrapper

The web app remains the source of truth. Netlify serves the app at
`https://workflow-application.netlify.app`; Railway continues to host the
Playwright worker, and Cloudflare remains the fallback runtime/object-storage
boundary.

## PWA safety boundary

- `public/manifest.webmanifest` starts the installed app at the authenticated
  session resolver, not the marketing homepage.
- `public/sw.js` caches only hashed Next static assets and static branding.
- Documents, RSC responses, API routes, Clerk requests, downloads, and Server
  Actions are always network-only. This prevents stale authenticated state or
  action IDs from being served from a service-worker cache.
- The install prompt uses `beforeinstallprompt` where supported, remembers a
  dismissal for seven days, and gives iOS Share → Add to Home Screen guidance.

## Android wrapper

Capacitor is configured as a thin remote-origin wrapper. It must point to the
Netlify session resolver and never to the Cloudflare Worker:

```text
https://workflow-application.netlify.app/auth/complete?next=%2Fdashboard
```

The wrapper does not replace Clerk or implement a second auth system. Clerk
continues to resolve the session and route the user to login, onboarding, or
dashboard. OAuth compatibility must be verified on a real device because
embedded WebViews and provider policies vary.

## Build commands

Install dependencies and generate the native project once:

```powershell
npm install
npx cap add android
npx cap sync android
```

With Android Studio/SDK configured, produce a debug APK:

```powershell
cd android
.\gradlew.bat assembleDebug
```

Output:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Set `CAPACITOR_APP_ORIGIN` only for a controlled preview. Do not put secrets in
the wrapper configuration, and do not publish this demo APK to the Play Store
without completing native OAuth/deep-link review.

## Owner actions before a real APK acceptance

1. Confirm `workflow-application.netlify.app` is added to Clerk's allowed
   origins/redirect configuration for the testing instance.
2. Test email and Google auth on a physical Android device.
3. Confirm session persistence after force-close/relaunch.
4. Provide an approved splash artwork if a branded native splash is required;
   the repository currently contains the Workflow logo/icon assets but no
   dedicated splash artwork.

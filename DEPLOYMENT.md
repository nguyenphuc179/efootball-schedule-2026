# Deployment Guide

## 1. Prerequisites

* Node.js 20+ and npm 10+
* A Firebase project (create one free at https://console.firebase.google.com)
* `npm install -g firebase-tools` (Firebase CLI)

## 2. Install dependencies

```bash
cd football-tournament-platform
npm install --legacy-peer-deps
```

`--legacy-peer-deps` is currently required because `@angular/fire@20.0.1`'s peer range trails the
newest Angular 20.x patch releases. This project's exact dependency set has been installed and
build-verified (`ng build --configuration production` completes cleanly) with this flag.

## 3. Create & configure your Firebase project

1. In the Firebase Console, create a project (or use an existing one).
2. Add a **Web app** to the project → copy the `firebaseConfig` object.
3. Paste those values into `src/environments/environment.ts` (dev) and
   `src/environments/environment.prod.ts` (prod) — replace every `REPLACE_WITH_...` placeholder.
4. Copy the same values into `src/firebase-messaging-sw.js` (service workers can't read Angular
   environment files — this is the one place the config is duplicated by necessity).
5. Enable products in the console:
   * **Authentication** → Sign-in method → enable *Email/Password* and *Google*.
   * **Firestore Database** → Create database (start in production mode — the rules in this repo
     already lock it down).
   * **Storage** → Get started (same, production mode).
   * **Cloud Messaging** → note the **Web Push certificate** (VAPID key) under
     Project Settings → Cloud Messaging → Web configuration, and paste it into
     `environment.fcmVapidKey`.
6. Set your project as default for the CLI:
   ```bash
   firebase login
   firebase use --add   # pick your project, alias it "default"
   ```
   (or edit `.firebaserc` directly with your project ID).

## 4. Local development

```bash
npm start                 # ng serve — http://localhost:4200
```

To develop fully offline against the **Firebase Emulator Suite** (recommended, avoids touching
production data while building):

```bash
firebase init emulators   # if not already configured — ports are pre-set in firebase.json
firebase emulators:start
```

With `environment.useEmulators = true` (default in dev), `app.config.ts` automatically connects
`connectAuthEmulator`, `connectFirestoreEmulator` and `connectStorageEmulator` to `localhost`. Flip
it to `false` to point dev at real Firebase.

## 5. Deploy Firestore/Storage security rules & indexes

Do this **before** first shipping any data-writing feature:

```bash
npm run deploy:rules      # firestore.rules + storage.rules
npm run deploy:indexes    # firestore.indexes.json
```

## 6. Build & deploy the app to Firebase Hosting

```bash
npm run deploy:hosting    # builds production bundle, deploys dist/football-tournament-platform/browser
# or, to deploy hosting + rules + indexes together:
npm run deploy
```

After the first deploy, the CLI prints your Hosting URL (`https://<project-id>.web.app`). Add that
domain under **Authentication → Settings → Authorized domains** if it isn't already listed
(Firebase adds the default hosting domain automatically; add any custom domain manually).

### Copying `firebase-messaging-sw.js` into the build

Angular's `assets` array in `angular.json` only copies files under `src/assets/`. Because this file
must be served from the site **root** (`/firebase-messaging-sw.js`, required by the FCM SDK), it's
listed directly:

```jsonc
// angular.json → build → options → assets
"assets": ["src/favicon.ico", "src/assets", "src/manifest.webmanifest", "src/firebase-messaging-sw.js"]
```//
(already included in this repo's `angular.json`; just remember to keep the config values inside that
file in sync with `environment.prod.ts` whenever you rotate Firebase config.)

## 7. Custom domain (optional)

Firebase Hosting → Add custom domain → follow the DNS verification (TXT record) + A/AAAA or CNAME
records it gives you. TLS is provisioned automatically.

## 8. Recommended (optional) Cloud Function for push fan-out

The client can register FCM tokens and *receive* pushes, but the actual "send to N devices" call
must happen server-side (FCM Admin SDK, not exposed to browsers). If you want real push delivery
(not just in-app notification-center entries), add a small Cloud Function:

```bash
firebase init functions   # TypeScript template
```

```ts
// functions/src/index.ts
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase-admin/app';

initializeApp();

export const fanOutNotification = onDocumentCreated('notifications/{id}', async (event) => {
  const notif = event.data?.data();
  if (!notif) return;
  const db = getFirestore();

  let tokens: string[] = [];
  if (notif.audience === 'all') {
    const usersSnap = await db.collection('users').get();
    tokens = usersSnap.docs.flatMap((d) => d.data()['fcmTokens'] ?? []);
  } else if (notif.targetUid) {
    const userSnap = await db.doc(`users/${notif.targetUid}`).get();
    tokens = userSnap.data()?.['fcmTokens'] ?? [];
  }
  if (!tokens.length) return;

  await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title: notif.title, body: notif.body },
    data: { url: notif.tournamentId ? `/tournaments/${notif.tournamentId}` : '/' },
  });
});
```

```bash
firebase deploy --only functions
```

This keeps the front-end architecture "Firebase-only," with the function as a thin, optional fan-out
worker — the app is fully usable (in-app notifications + realtime data) without it.

## 9. CI/CD (optional GitHub Actions)

```yaml
# .github/workflows/deploy.yml
name: Deploy to Firebase Hosting
on:
  push:
    branches: [main]
jobs:
  build_and_deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run build:prod
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'
          projectId: your-project-id
          channelId: live
```

## 10. Production checklist

- [ ] Real Firebase config in both environment files + `firebase-messaging-sw.js`
- [ ] `firestore.rules` / `storage.rules` deployed and manually re-tested with the Rules Playground
- [ ] Composite indexes deployed (`npm run deploy:indexes`) — Firestore will otherwise throw
      "requires an index" errors the first time each compound query runs in production
- [ ] Lighthouse run on the deployed URL (mobile profile) — confirm PWA installability + >90 scores
- [ ] Test "Add to Home Screen" on a real Android and iPhone device
- [ ] Test offline: airplane mode → browse cached tournament → make an admin edit → re-enable
      network → confirm it syncs
- [ ] Authorized domains include your production Hosting URL / custom domain
- [ ] (If using) Cloud Function deployed and a test notification confirmed delivered to a real device

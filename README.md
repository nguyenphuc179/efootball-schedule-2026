# PitchPro — Football Tournament Management Platform

A mobile-first Progressive Web App for creating and running football tournaments: fixtures, live
results, real-time standings, statistics, QR sharing and QR check-in — built with Angular 20 and
Firebase.

> 80% of usage is expected to be on mobile — every screen here is designed mobile-first (bottom
> navigation, full-screen dialogs, one-handed result entry, card-based standings) and
> progressively enhanced for tablet/desktop, not the other way around.

## Docs

Full architecture, schema and deployment docs live in `../docs/` alongside this project:

* `ARCHITECTURE.md` — system architecture, folder structure, data flow, performance & security strategy
* `ER_DIAGRAM.md` — entity-relationship diagram (Mermaid)
* `FIRESTORE_SCHEMA.md` — full Firestore collection/field reference
* `ROUTING.md` — route table, guards, bottom-nav mapping
* `UX_WIREFRAMES.md` — mobile-first wireframes and interaction rules
* `SECURITY.md` — Firestore/Storage rules explained
* `DEPLOYMENT.md` — step-by-step Firebase setup & Hosting deployment

## Quick start

```bash
npm install --legacy-peer-deps
```

> **Why `--legacy-peer-deps`?** `@angular/fire@20.0.1`'s published peer dependency range trails the
> very latest Angular 20.x patch releases (it pins `@angular/platform-browser-dynamic@20.0.7`,
> which conflicts with newer `@angular/common` patch versions). This is a common, temporary
> ecosystem lag — the flag is safe here and this exact dependency set has been installed and
> **verified with a real `ng build --configuration production`** (see below) as part of building
> this project. Re-check `npm ls @angular/fire` occasionally and drop the flag once AngularFire
> publishes a release that matches.

Edit your Firebase config before running:

1. Create a Firebase project and add a Web app (see `DEPLOYMENT.md` §3).
2. Paste your Firebase config into `src/environments/environment.ts`,
   `src/environments/environment.prod.ts`, and `src/firebase-messaging-sw.js`.
3. Enable Authentication (Email/Password + Google), Firestore, Storage, Cloud Messaging in the
   Firebase Console.
4. `npm start` → http://localhost:4200 (uses the Firebase Emulator Suite by default — run
   `firebase emulators:start` in another terminal, or set `useEmulators: false` to hit real Firebase).

## Tech stack

Angular 20 (standalone + Signals) · Angular Material · Tailwind CSS · RxJS · Firebase (Auth,
Firestore, Storage, Cloud Messaging, Hosting) · Angular Service Worker (PWA) · Chart.js / ng2-charts
· `qrcode` / `html5-qrcode`.

## Project status

This codebase implements every module in the spec end-to-end at varying depth:

* **Fully implemented** (real Firestore reads/writes, business logic, mobile UI): authentication,
  tournament CRUD, team CRUD, fixture generation (round robin + knockout brackets), result entry,
  real-time standings engine, home page, tournament detail tabs, matches list, bottom navigation,
  PWA/offline scaffolding, security rules.
* **Functionally implemented, simpler UI polish**: statistics charts, admin dashboard, QR share/QR
  check-in, FCM push registration + in-app notification center, group+knockout hybrid fixtures.

Anything not wired to a real Firebase project will simply show empty states until you complete the
setup steps above — there is no mock/fake data layer, this is a real Firebase client from the start.

**Build verification performed while producing this codebase:** `npm install --legacy-peer-deps`,
`npx tsc -p tsconfig.app.json --noEmit` (clean), and `ng build --configuration production` (clean —
initial bundle ≈319 kB gzipped, one non-blocking budget warning from the Firebase+Material+Tailwind
baseline and one non-blocking CommonJS warning from the `qrcode` package). No emulator/live-Firebase
run was performed since that requires your own Firebase project credentials.

## Scripts

See `package.json` — `npm start`, `npm run build:prod`, `npm run deploy`, `npm run emulators`, etc.

## License

Proprietary — built for the requesting organization. Adapt as needed.


Cách sửa ngay — set tài khoản thành admin
Firebase Console → Authentication → Users → copy User UID của bạn
Firestore Database → collection users → mở doc có id = UID đó
Sửa field role: viewer → admin → Save
Về app reload trang (để docData nạp lại role) → bấm Create Tournament sẽ vào form
Link nhanh: https://console.firebase.google.com/project/efootball-schedule-2026/firestore/data/~2Fusers


https://imgur.com/

https://imgbb.com/
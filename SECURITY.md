# Security Rules — Explained

Full rule source: `firestore.rules` and `storage.rules` at the project root. This document explains
the reasoning; keep it in sync if you change the rules.

## Roles

Role lives on `users/{uid}.role` (`'admin' | 'viewer'`), set to `'viewer'` at signup. There is no
`'guest'` role document — a guest is simply `request.auth == null`.

## Firestore rules summary

| Collection | Guest read | Viewer read | Viewer write | Admin write |
|---|---|---|---|---|
| `users/{uid}` | ✗ (must be signed in) | own doc, and others' (needed to resolve display names) | own doc, cannot change own `role` | full |
| `tournaments` | ✓ | ✓ | ✗ | ✓ |
| `teams` (+`players` sub) | ✓ | ✓ | ✗, unless `managerUid == uid` (own team only) | ✓ |
| `matches` | ✓ | ✓ | ✗ | ✓ |
| `standings` (+`rows` sub) | ✓ | ✓ | ✗ | ✓ (written by `ResultService` transactions) |
| `notifications` | ✗ | own/broadcast only, can toggle `read` | ✗ (only `read` field, own doc) | ✓ |
| `checkins` | ✗ | ✓ (read, transparency at venue) | ✗, unless own team (`managerUid`) | ✓ |

Every collection ends with an explicit **default-deny** fallback (`match /{document=**}`), so any
future collection added to the schema is inaccessible until a rule is written for it — fail closed,
not open.

## Why role can't be self-elevated

```
allow update: if isOwnUser(uid) && request.resource.data.role == resource.data.role;
allow update: if isAdmin();
```

A viewer can update their own profile (display name, photo, FCM tokens, favorite teams) but the
`role` field must be unchanged in that same write — the *only* way `role` changes is a second rule
branch that requires the requester to already be `isAdmin()`. This prevents a compromised or
malicious client from just writing `role: 'admin'` to their own document.

## Why `teams` allows a non-admin write path

Real tournaments have team managers who aren't the tournament admin. Rather than force every roster
edit through the organizer, `managerUid` on the team document grants that one user narrow write
access to that one team (and its `players` sub-collection, and creating a `checkins` doc for that
team). This mirrors "Team Manager" as an implicit fourth role without adding RBAC complexity.

## Storage rules summary

* Tournament banners: admin-only upload, public read, 5MB limit, must be an image content-type.
* Team logos: any signed-in user may upload (kept permissive since team creation flows sometimes
  happen team-side) — tighten to admin/manager-only (`isAdmin() || request.auth.uid == team manager`)
  if you need stricter control; the Firestore-side `teams` write rule is the real gatekeeper for
  which team document the URL gets attached to.
* User avatars: only the user themselves can write their own avatar path.

## Testing rules before you rely on them

```bash
firebase emulators:start --only firestore
# then, in a second terminal, run the Firebase Rules unit test harness (see
# https://firebase.google.com/docs/firestore/security/test-rules-emulator) or use the
# Rules Playground in the console against your deployed rules.
```

Never deploy new rules without testing at least: (1) a guest read of `tournaments`, (2) a viewer
attempting to write `tournaments` (must fail), (3) a viewer attempting to set their own `role` to
`admin` (must fail), (4) an admin write to every collection (must succeed).

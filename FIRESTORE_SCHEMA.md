# Firestore Database Design

## Collections overview

```
users/{uid}
tournaments/{tournamentId}
teams/{teamId}
  └── players/{playerId}          (sub-collection)
matches/{matchId}
standings/{tournamentId}
  └── rows/{teamId}                (sub-collection — one doc per team's standing row)
checkins/{checkinId}
lineups/{tournamentId}__{email}
  └── images/{slot}                (sub-collection, slot ∈ '1'..'4')
activityLogs/{logId}
activityLogSeen/{uid}
```

Top-level (not nested under `tournaments/{id}/...`) is used for `teams`, `matches`, `activityLogs`
and `checkins` — each carries a `tournamentId` field instead — because Firestore collection-group
and simple `where()` queries across a flat collection are cheaper and simpler to paginate than deep
nested paths, and several screens (e.g. "all my upcoming matches across tournaments") need to query
across tournaments.

## `users/{uid}`

| Field | Type | Notes |
|---|---|---|
| uid | string | = document id, mirrors Firebase Auth UID |
| email | string | |
| displayName | string | |
| photoURL | string \| null | |
| role | `'admin' \| 'viewer'` | default `'viewer'` on signup |
| fcmTokens | string[] | registered device tokens for push |
| favoriteTeamIds | string[] | optional, for personalized notifications |
| createdDate | Timestamp | |

## `tournaments/{tournamentId}`

| Field | Type | Notes |
|---|---|---|
| id | string | |
| name | string | |
| description | string | |
| image | string (URL) | banner/logo in Storage |
| location | string | |
| startDate | Timestamp | |
| endDate | Timestamp | |
| status | `'upcoming' \| 'ongoing' \| 'completed'` | derived at create/update time from dates, editable by admin |
| type | `'round_robin' \| 'knockout' \| 'group_knockout'` | |
| numberOfTeams | number | target team count, used by fixture generator |
| createdBy | string (uid) | |
| createdDate | Timestamp | |

## `teams/{teamId}`

| Field | Type | Notes |
|---|---|---|
| id | string | |
| tournamentId | string | FK |
| teamName | string | |
| logo | string (URL) | |
| manager | string | display name of the manager |
| managerUid | string \| null | optional linked account, grants roster/check-in rights |
| managerPhotoURL | string \| null | cached from the manager's login profile at save time |
| managerEmail | string \| null | cached from the manager's login profile at save time (lowercased/trimmed); lets the external lineup capture tool find "which tournaments does this Gmail manage a team in" via a public `where('managerEmail', '==', email)` query — see `LINEUP_TOOL_INTEGRATION.md` |
| playersCount | number | maintained counter |
| createdDate | Timestamp | |

### `teams/{teamId}/players/{playerId}`

| Field | Type |
|---|---|
| id | string |
| teamId | string |
| fullName | string |
| shirtNumber | number |
| position | `'GK' \| 'DF' \| 'MF' \| 'FW'` |
| goals | number |
| yellowCards | number |
| redCards | number |

## `matches/{matchId}`

| Field | Type | Notes |
|---|---|---|
| id | string | |
| tournamentId | string | FK |
| round | string | e.g. `"Round 1"`, `"Quarter Final"`, `"Semi Final"`, `"Final"` |
| groupName | string \| null | set only for `group_knockout` group stage |
| homeTeamId | string | FK |
| awayTeamId | string | FK |
| homeScore | number \| null | null until played |
| awayScore | number \| null | null until played |
| matchDate | Timestamp | |
| matchTime | string | `"HH:mm"` |
| location | string | pitch/venue name |
| status | `'scheduled' \| 'live' \| 'completed' \| 'postponed'` | |

## `standings/{tournamentId}` + `standings/{tournamentId}/rows/{teamId}`

Parent doc just tracks `lastUpdated`; each team's row is its own sub-document so the UI can listen to
the whole sub-collection with one `collectionData()` call, already sorted by the query
(`orderBy('points','desc'), orderBy('goalDifference','desc'), orderBy('goalsFor','desc'), orderBy('teamName','asc')`)
mirroring the required ranking priority.

| Field | Type |
|---|---|
| teamId | string |
| teamName | string (denormalized) |
| teamLogo | string (denormalized) |
| groupName | string \| null |
| played, won, drawn, lost | number |
| goalsFor, goalsAgainst, goalDifference | number |
| points | number |
| position | number (computed client-side after sort, or maintained on write) |
| form | `('W'\|'D'\|'L')[]` | last 5 results, for a Sofascore-style form strip |

## `checkins/{checkinId}`

| Field | Type |
|---|---|
| id | string |
| tournamentId | string |
| teamId | string |
| checkedInByUid | string |
| checkedInAt | Timestamp |
| method | `'qr_scan' \| 'manual'` |

## `lineups/{tournamentId}__{email}/images/{slot}`

Squad lineup screenshots, keyed only by the manager's Gmail address (no Firebase Auth involved) —
see `LINEUP_TOOL_INTEGRATION.md` for the full contract with the external capture tool that reads
and writes this collection directly via Firestore's public REST API.

| Field | Type | Notes |
|---|---|---|
| image | string (`data:image/...;base64,...`) | the only field allowed on the doc; < ~900 KB |

`slot` is one of `'1'`, `'2'`, `'3'`, `'4'` — a fixed capacity of 4 screenshots per manager per
tournament, not a Firestore auto-id. Public read; public create/update (validated by
`firestore.rules`); delete is admin-only from the app.

## `activityLogs/{logId}`

Admin-only audit trail — one entry per notable mutation across the app (tournament/team CRUD,
match results, fixture generation, polls, role changes, lineup uploads, Hall of Fame entries,
manager portraits). Written by `ActivityLogService.log()` (`src/app/core/services/activity-log.service.ts`)
as the last step of each action; immutable once written.

| Field | Type | Notes |
|---|---|---|
| actorUid | string | must equal `request.auth.uid` at write time (enforced by firestore.rules) |
| actorEmail | string \| null | snapshot at write time |
| actorName | string | snapshot at write time (survives a later rename) |
| action | string | machine key, see `ActivityAction` in `src/app/models/activity-log.model.ts` |
| description | string | human-readable Vietnamese sentence, built inline at the call site |
| tournamentId | string \| null | present for tournament-scoped actions, null otherwise |
| sourcePath | string | `Router.url` at write time (e.g. `/ranking`) — which screen the actor was on; auto-captured, never passed by callers |
| menuKey | string | stable bucket for `sourcePath` (see `menuInfoForPath` in `shared/utils/activity-menu.util.ts`) — lets the "/history" page filter with a plain equality `where()` |
| createdDate | Timestamp | |

Public create (any signed-in, non-disabled user, but only stamped with their own uid); read is
admin-only; entries can never be edited, but an admin MAY delete them (bulk "Xoá tất cả" / "Xoá
theo bộ lọc" on "/history", via `ActivityLogService.deleteAll` — equality-only filters, no
composite index needed since there's no `orderBy` on a delete). This is a deliberate compromise on
the "immutable audit trail" ideal; `deleteAll` always logs the purge itself as a fresh
`activity_log_purge` entry afterwards, so at minimum the fact that a purge happened survives. The
"/history" page paginates this collection (`ActivityLogService.getPaged`, 100/page) rather than
streaming it live.

## `activityLogSeen/{uid}` + `activityLogSeen/{uid}/items/{logId}`

One admin's own "seen" state for the activity log bell badge — doc id is the admin's uid. Every
`activityLogs` entry with `createdDate > lastSeenAt` counts as unseen UNLESS its id also has a doc
in the `items` sub-collection ("mark this one as seen" on the "/history" page). "Mark all as seen"
only ever touches the parent doc (bumps `lastSeenAt` to now); it doesn't need to clean up `items`
since anything covered by the new `lastSeenAt` is already seen regardless. Kept fully separate from
(and never writes to) the immutable `activityLogs` entries themselves.

| Field | Type | Notes |
|---|---|---|
| lastSeenAt | number (epoch millis) | on the parent `{uid}` doc |

| `items/{logId}` field | Type | Notes |
|---|---|---|
| seenAt | number (epoch millis) | doc id is the `activityLogs` entry's own id |

Private: only that uid (and only if they're an admin) may read or write their own cursor/items.

## Indexing

See `firestore.indexes.json` for the composite indexes required by the query patterns above
(matches by tournament+date, matches by tournament+round+date, matches by tournament+status, teams
by tournament+name, tournaments by status+date, check-ins by tournament+date). `activityLogs` has
three, one per "/history" filter combination: `menuKey`+date (screen filter alone), `actorUid`+date
(manager filter alone), and `actorUid`+`menuKey`+date (both filters together). The unfiltered
listing and the bell's unseen-count query need no composite index — both are a single
`orderBy`/inequality on `createdDate`, served by the automatic single-field index.

The "/history" manager filter itself only lists managers who are both active (`!disabled` on their
`users/{uid}` profile) and have logged at least one action (`ActivityLogService.hasActed`, a
`where('actorUid','==',uid) limit(1)` check per candidate — cheap since the candidate list, built
from `teams.managerUid` across every tournament, is small).

## Pagination pattern

All list services (`TournamentService.listPaged`, `MatchService.listPaged`) follow the same cursor
pattern:

```ts
query(collectionRef, orderBy('startDate', 'desc'), startAfter(lastVisibleDoc), limit(20))
```

The last document snapshot of the previous page is kept in a signal and passed as the cursor for
"load more" — no `offset()` (expensive in Firestore) is ever used.

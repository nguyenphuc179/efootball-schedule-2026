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
notifications/{notificationId}
checkins/{checkinId}
```

Top-level (not nested under `tournaments/{id}/...`) is used for `teams`, `matches`, `notifications`
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

## `notifications/{notificationId}`

| Field | Type | Notes |
|---|---|---|
| id | string | |
| title, body | string | |
| type | see ER diagram enum | |
| audience | `'all' \| 'user'` | |
| targetUid | string \| null | required when `audience==='user'` |
| tournamentId | string \| null | for deep-linking |
| read | boolean | per-user; for `audience:'all'` this is tracked client-side via a `readIds` map or a `notifications_read/{uid}` doc in production scale |
| createdDate | Timestamp | |

## `checkins/{checkinId}`

| Field | Type |
|---|---|
| id | string |
| tournamentId | string |
| teamId | string |
| checkedInByUid | string |
| checkedInAt | Timestamp |
| method | `'qr_scan' \| 'manual'` |

## Indexing

See `firestore.indexes.json` for the composite indexes required by the query patterns above
(matches by tournament+date, matches by tournament+round+date, matches by tournament+status,
teams by tournament+name, tournaments by status+date, notifications by user+date, check-ins by
tournament+date).

## Pagination pattern

All list services (`TournamentService.listPaged`, `MatchService.listPaged`) follow the same cursor
pattern:

```ts
query(collectionRef, orderBy('startDate', 'desc'), startAfter(lastVisibleDoc), limit(20))
```

The last document snapshot of the previous page is kept in a signal and passed as the cursor for
"load more" — no `offset()` (expensive in Firestore) is ever used.

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
| manager | string | cached display name of the manager (`userDisplayName` at save time — admin override name if set, else login name/email); also read by the external capture tool off this same public doc as the human-friendly `actorName` for its "/history" entries — see `LINEUP_TOOL_INTEGRATION.md` |
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
| penaltyHome, penaltyAway | number \| null | shootout score; only set on a level knockout match |

Public read; create/delete are admin-only. Update is admin-only for every field EXCEPT the result
fields (`homeScore`, `awayScore`, `penaltyHome`, `penaltyAway`, `status`), which a team manager may
also set for a match their own team is playing in (home or away) — enforced by firestore.rules via
`request.resource.data.diff(resource.data).affectedKeys().hasOnly([...])`, so a manager touching any
other field (schedule, teams, round, tournamentId, ...) is rejected outright. Re-editing an already
`completed` match is allowed (for both admin and the manager) — `StandingsService.recalculate()` is
a full recompute from every match's current data, not an incremental delta, so it's safe to re-run.

## `standings/{tournamentId}` + `standings/{tournamentId}/rows/{teamId}`

Parent doc just tracks `lastUpdated`; each team's row is its own sub-document so the UI can listen to
the whole sub-collection with one `collectionData()` call, already sorted by the query
(`orderBy('points','desc'), orderBy('goalDifference','desc'), orderBy('goalsFor','desc'), orderBy('teamName','asc')`)
mirroring the required ranking priority.

Public read; write is open to any signed-in, non-disabled member (not scoped to admin or to "your
own team's row"). This looks broader than it needs to be, but it's forced by how writes actually
happen: `recalculate()` re-derives and batch-writes EVERY team's row in the tournament as one atomic
commit whenever any match changes, and Firestore batches are all-or-nothing — once a team manager
can update their own match's result, restricting this to "your own row" would make the batch's
OTHER rows fail the rule and roll back the entire write. Acceptable because `standings` is a fully
recomputable cache of `matches` (the real source of truth) — a bad write here is undone by the next
legitimate `recalculate()`, never a lasting data-integrity problem.

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

## `lineups/{tournamentId}__{email}/approvals/{slot}`

Admin-only "reviewed this screenshot" flag, one doc per slot — kept in its own subcollection
instead of a field on `images/{slot}` so it never has to satisfy that doc's public,
locked-down `hasOnly(['image'])` write contract above. `LineupService.upload`/`remove` delete the
matching approval whenever this app's own UI replaces or deletes an image; the external capture
tool writes straight to `images/{slot}` and knows nothing about this collection, so a re-upload via
the tool can leave a stale `approved: true` behind.

| Field | Type | Notes |
|---|---|---|
| approved | boolean | the only field allowed on the doc |

Public read (so a manager can see their own approval status); create/update/delete all admin-only.

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
| subjectUid | string \| null | the user this action is ABOUT when different from the actor — a team's `managerUid` for `team_create`/`team_update`/`team_delete`/`player_add`/`player_remove` (set by `TeamService`), or the manager whose lineup slot an admin/the capture tool touched for `lineup_upload`/`lineup_remove`; `null` when not applicable. Lets that user read the entry back even though they're not the actor — see the read rule below |
| sourcePath | string | `Router.url` at write time (e.g. `/ranking`) — which screen the actor was on; auto-captured, never passed by callers |
| menuKey | string | stable bucket for `sourcePath` (see `menuInfoForPath` in `shared/utils/activity-menu.util.ts`) — lets the "/history" page filter with a plain equality `where()` |
| createdDate | Timestamp | |

Public create (any signed-in, non-disabled user, but only stamped with their own uid); entries can
never be edited, but an admin MAY delete them (bulk "Xoá tất cả" / "Xoá theo bộ lọc" on "/history",
via `ActivityLogService.deleteAll` — equality-only filters, no composite index needed since there's
no `orderBy` on a delete). This is a deliberate compromise on the "immutable audit trail" ideal;
`deleteAll` always logs the purge itself as a fresh `activity_log_purge` entry afterwards, so at
minimum the fact that a purge happened survives.

Read is admin-only for the FULL collection ("/history"'s admin view, `ActivityLogService.getPaged`,
100/page). A second read rule additionally lets any signed-in, non-disabled user read an entry
where they're the `actorUid` OR the `subjectUid` — their own personal feed on that same "/history"
route/page, "Thông báo của tôi" (`ActivityLogService.getMine()`, fetched once and paginated
client-side rather than via Firestore cursor, since one person's own volume is small). The manager
filter and bulk delete are hidden from that view (delete stays admin-only regardless).

A third `create` rule (see `firestore.rules`) also lets the external lineup capture tool write its
own `lineup_upload` entries directly, unauthenticated — same tradeoff as the public write on
`lineups` below. These are pinned to `actorUid == 'capture-tool'`, `action == 'lineup_upload'`, and
a `sourcePath`/`menuKey` that must point at the tournament the image belongs to, so the branch can't
be used to write anything else. See `LINEUP_TOOL_INTEGRATION.md` for the exact write the tool must
perform, including the optional `subjectUid` it should send so the manager sees it on their own
feed. Because `'capture-tool'` is never a real Firebase uid, these entries never match the
"/history" admin per-manager filter (which only lists real managers) — they only ever appear in the
unfiltered admin list, the "Giải đấu"/tournaments menu filter, or the subject manager's own feed.

## `activityLogSeen/{uid}` + `activityLogSeen/{uid}/items/{logId}`

One user's own "seen" state for their view of the activity log bell badge (the full feed for an
admin, their personal feed for anyone else) — doc id is that user's uid. Every `activityLogs` entry
with `createdDate > lastSeenAt` counts as unseen UNLESS its id also has a doc in the `items`
sub-collection ("mark this one as seen" on the "/history" page). "Mark all as seen" only ever
touches the parent doc (bumps `lastSeenAt` to now); it doesn't need to clean up `items` since
anything covered by the new `lastSeenAt` is already seen regardless. Kept fully separate from (and
never writes to) the immutable `activityLogs` entries themselves.

| Field | Type | Notes |
|---|---|---|
| lastSeenAt | number (epoch millis) | on the parent `{uid}` doc |

| `items/{logId}` field | Type | Notes |
|---|---|---|
| seenAt | number (epoch millis) | doc id is the `activityLogs` entry's own id |

Private: only that uid — signed in and not disabled, no admin requirement — may read or write their
own cursor/items.

## Indexing

See `firestore.indexes.json` for the composite indexes required by the query patterns above
(matches by tournament+date, matches by tournament+round+date, matches by tournament+status, teams
by tournament+name, tournaments by status+date, check-ins by tournament+date). `activityLogs` has
five: `menuKey`+date, `actorUid`+date, `actorUid`+`menuKey`+date, `subjectUid`+date, and
`subjectUid`+`menuKey`+date. The admin "/history" manager filter and a non-admin's personal feed
both need the `subjectUid`-side indexes too, not just `actorUid`-side — see below. The admin's
unfiltered listing and unseen-count query need no composite index — both are a single
`orderBy`/inequality on `createdDate`, served by the automatic single-field index.

The "/history" manager filter dropdown lists managers who are both active (`!disabled` on their
`users/{uid}` profile) and have SOME activity to show (`ActivityLogService.hasActed` — checks both
`actorUid == uid` and `subjectUid == uid`, since a manager's only trace in the log is often a
capture-tool/admin-driven `lineup_upload` entry where they're the `subjectUid`, not the actor;
checking `actorUid` alone silently hid every such manager from the dropdown, and from the filtered
results even if they had been selectable — `ActivityLogService.streamFiltered`/`deleteAll` both
merge `actorUid == managerUid` and `subjectUid == managerUid` for the same reason). Candidates come
from `teams.managerUid` across every tournament, a small list, so the per-candidate check stays
cheap even doing two lookups instead of one.

## Pagination pattern

All list services (`TournamentService.listPaged`, `MatchService.listPaged`) follow the same cursor
pattern:

```ts
query(collectionRef, orderBy('startDate', 'desc'), startAfter(lastVisibleDoc), limit(20))
```

The last document snapshot of the previous page is kept in a signal and passed as the cursor for
"load more" — no `offset()` (expensive in Firestore) is ever used.

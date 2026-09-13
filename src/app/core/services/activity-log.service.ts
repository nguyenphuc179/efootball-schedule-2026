import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { limit, orderBy, where } from '@angular/fire/firestore';
import { Observable, combineLatest, map, of, switchMap } from 'rxjs';
import { FirestoreBaseService } from './firestore-base.service';
import { AuthService } from './auth.service';
import { userDisplayName } from '../../models/user.model';
import { menuInfoForPath } from '../../shared/utils/activity-menu.util';
import { ActivityAction, ActivityLog, ActivityLogSeen, ActivityLogSeenItem } from '../../models/activity-log.model';

const PATH = 'activityLogs';
const SEEN_PATH = 'activityLogSeen';
const SEEN_ITEMS_SUBPATH = (uid: string) => `${SEEN_PATH}/${uid}/items`;
/** Bound for the live "unseen" badge query — a banking-app-style badge doesn't need an exact
 *  count past this; the bell shows "99+" once it's hit. */
const UNSEEN_CAP = 100;

export interface SeenState {
  /** Everything with `createdDate <= lastSeenAt` is seen, regardless of `seenIds`. */
  lastSeenAt: number;
  /** Entries newer than `lastSeenAt` that were individually marked seen (see `markSeen`). */
  seenIds: Set<string>;
}

/**
 * App-wide audit trail. Any signed-in user may write an entry (see firestore.rules — the write
 * side is intentionally open so every action-taking service can log without extra auth plumbing),
 * but only for themselves as actor. Reading back is where the scopes differ: an admin can read
 * every entry ("/history"); anyone else can only read entries where they're the actor or the
 * `subjectUid` — see `streamMine()`, their own personal feed on that same page/route.
 *
 * Lives under core/services (not a feature folder) because AuthService itself needs to call
 * `log()` for role/lock-out changes — keeping this in core avoids a core -> feature -> core import
 * cycle with AuthService.
 */
@Injectable({ providedIn: 'root' })
export class ActivityLogService {
  private fs = inject(FirestoreBaseService);
  private auth = inject(AuthService);
  private router = inject(Router);

  private firebaseUser$ = toObservable(this.auth.firebaseUser);

  /** The current signed-in user's resolved display name (admin override → login name → email) —
   *  the same name `log()` stamps as `actorName`. Exposed so a caller building a description string
   *  can name the actor inline (e.g. "PhucNT18 đã xoá ảnh đội hình...") instead of relying solely on
   *  the separate actorName/actorEmail line the "/history" page renders below it. */
  currentActorName(): string {
    const email = this.auth.appUser()?.email ?? this.auth.firebaseUser()?.email ?? null;
    return userDisplayName(this.auth.appUser(), this.auth.firebaseUser()?.displayName || email || 'Unknown');
  }

  /**
   * Records one action by the currently signed-in user. Never throws — a logging failure must
   * never break the real mutation it's attached to, so callers can simply `await` this as their
   * last step without extra try/catch boilerplate.
   *
   * `subjectUid` names the user the action is ABOUT when that's someone other than the actor (e.g.
   * an admin uploading/removing a manager's lineup slot) — it's what lets that other user read this
   * entry back under firestore.rules despite not being the actor. Leave it `null` (the default)
   * when the action has no distinct subject.
   */
  async log(
    action: ActivityAction,
    description: string,
    tournamentId: string | null = null,
    subjectUid: string | null = null
  ): Promise<void> {
    try {
      const uid = this.auth.firebaseUser()?.uid;
      if (!uid) return;
      const email = this.auth.appUser()?.email ?? this.auth.firebaseUser()?.email ?? null;
      const name = this.currentActorName();
      const sourcePath = this.router.url;
      await this.fs.add<Omit<ActivityLog, 'id' | 'createdDate'>>(PATH, {
        actorUid: uid,
        actorEmail: email,
        actorName: name,
        action,
        description,
        tournamentId,
        subjectUid,
        sourcePath,
        menuKey: menuInfoForPath(sourcePath).key,
      });
    } catch (err) {
      console.error('[ActivityLogService] log failed', action, err);
    }
  }

  /** Live "/history" admin listing, newest first, capped at `limitCount` — optionally restricted to
   *  one menu bucket and/or one actor (see firestore.indexes.json for the composite indexes each
   *  combination needs). A live `streamCollection` rather than a one-shot fetch so the list itself
   *  updates in real time (e.g. from a capture-tool upload elsewhere) instead of only the bell badge
   *  — `ActivityLogComponent` grows `limitCount` for "load more" instead of a cursor, which also
   *  keeps re-subscribing correctly instead of stitching pages of a stale snapshot together. */
  streamFiltered(menuKey: string | null, actorUid: string | null, limitCount: number): Observable<ActivityLog[]> {
    const constraints = [];
    if (actorUid) constraints.push(where('actorUid', '==', actorUid));
    if (menuKey) constraints.push(where('menuKey', '==', menuKey));
    constraints.push(orderBy('createdDate', 'desc'), limit(limitCount));
    return this.fs.streamCollection<ActivityLog>(PATH, ...constraints);
  }

  /** One-shot check: has this uid ever logged an action? Powers the "/history" manager filter,
   *  which should only list managers who've actually done something — no live subscription needed
   *  for a filter dropdown, so a single `limit(1)` lookup per candidate is enough. */
  async hasActed(uid: string): Promise<boolean> {
    const rows = await this.fs.getOnce<ActivityLog>(PATH, where('actorUid', '==', uid), limit(1));
    return rows.length > 0;
  }

  /**
   * A non-admin's live personal feed: everything they were the actor OR the `subjectUid` of,
   * merged, de-duped, newest-first, capped at `limitCount` (same live-not-one-shot reasoning as
   * `streamFiltered`). Firestore can't OR two different fields in one query, so this combines two
   * live streams client-side — same merge shape as `streamUnseenCount()` below.
   */
  streamMine(uid: string, limitCount: number): Observable<ActivityLog[]> {
    const asActor$ = this.fs.streamCollection<ActivityLog>(
      PATH,
      where('actorUid', '==', uid),
      orderBy('createdDate', 'desc'),
      limit(limitCount)
    );
    const asSubject$ = this.fs.streamCollection<ActivityLog>(
      PATH,
      where('subjectUid', '==', uid),
      orderBy('createdDate', 'desc'),
      limit(limitCount)
    );
    return combineLatest([asActor$, asSubject$]).pipe(
      map(([asActor, asSubject]) => {
        const merged = new Map<string, ActivityLog>();
        for (const entry of [...asActor, ...asSubject]) merged.set(entry.id, entry);
        return [...merged.values()].sort((a, b) => b.createdDate - a.createdDate).slice(0, limitCount);
      })
    );
  }

  /** Live combination of the current user's bulk cursor + individually-marked-seen entry ids —
   *  the one source of truth both the bell badge and the "/history" list read "is this seen?"
   *  from. 0/empty (not an error) when signed out. */
  streamSeenState(): Observable<SeenState> {
    return this.firebaseUser$.pipe(
      switchMap((user) => {
        if (!user) return of<SeenState>({ lastSeenAt: 0, seenIds: new Set() });
        const lastSeenAt$ = this.fs
          .streamDoc<ActivityLogSeen>(`${SEEN_PATH}/${user.uid}`)
          .pipe(map((doc) => doc?.lastSeenAt ?? 0));
        const seenIds$ = this.fs
          .streamCollection<ActivityLogSeenItem>(SEEN_ITEMS_SUBPATH(user.uid))
          .pipe(map((items) => new Set(items.map((i) => i.id))));
        return combineLatest([lastSeenAt$, seenIds$]).pipe(
          map(([lastSeenAt, seenIds]) => ({ lastSeenAt, seenIds }))
        );
      })
    );
  }

  /** Live "unseen" count for the current user, capped at `UNSEEN_CAP` — feeds the bell icon's
   *  badge. Subtracts entries that were individually marked seen via `markSeen`. An admin's count
   *  is over the whole collection (they can read all of it); anyone else's is over just their own
   *  actor/subject entries (merged, since that's all firestore.rules lets them read) — each side
   *  capped independently, so the true total past `UNSEEN_CAP` per side is still just shown as
   *  "99+" rather than counted exactly, same tradeoff as the admin case. */
  streamUnseenCount(): Observable<number> {
    return this.streamSeenState().pipe(
      switchMap((state) => {
        if (this.auth.isAdmin()) {
          return this.fs
            .streamCollection<ActivityLog>(
              PATH,
              where('createdDate', '>', state.lastSeenAt),
              orderBy('createdDate', 'desc'),
              limit(UNSEEN_CAP)
            )
            .pipe(map((list) => list.filter((l) => !state.seenIds.has(l.id)).length));
        }
        const uid = this.auth.firebaseUser()?.uid;
        if (!uid) return of(0);
        const asActor$ = this.fs.streamCollection<ActivityLog>(
          PATH,
          where('actorUid', '==', uid),
          where('createdDate', '>', state.lastSeenAt),
          orderBy('createdDate', 'desc'),
          limit(UNSEEN_CAP)
        );
        const asSubject$ = this.fs.streamCollection<ActivityLog>(
          PATH,
          where('subjectUid', '==', uid),
          where('createdDate', '>', state.lastSeenAt),
          orderBy('createdDate', 'desc'),
          limit(UNSEEN_CAP)
        );
        return combineLatest([asActor$, asSubject$]).pipe(
          map(([asActor, asSubject]) => {
            const merged = new Map<string, ActivityLog>();
            for (const entry of [...asActor, ...asSubject]) merged.set(entry.id, entry);
            return [...merged.values()].filter((l) => !state.seenIds.has(l.id)).length;
          })
        );
      })
    );
  }

  /** Marks one entry as seen for the current user — this is what "subtracts" it from the bell
   *  badge without waiting for "mark all as seen". No-op (not an error) once it's already covered
   *  by the bulk cursor. */
  async markSeen(logId: string): Promise<void> {
    const uid = this.auth.firebaseUser()?.uid;
    if (!uid) return;
    await this.fs.set<Omit<ActivityLogSeenItem, 'id'>>(SEEN_ITEMS_SUBPATH(uid), logId, { seenAt: Date.now() });
  }

  /** Marks every current entry as seen for the current user (a single small cursor write — the
   *  immutable `activityLogs` entries themselves are never touched). Any previously
   *  individually-marked items become redundant but are harmless, so they're left as-is. */
  async markAllSeen(): Promise<void> {
    const uid = this.auth.firebaseUser()?.uid;
    if (!uid) return;
    await this.fs.set<ActivityLogSeen>(SEEN_PATH, uid, { lastSeenAt: Date.now() }, true);
  }

  /**
   * Deletes every entry matching the given filters (both null = deletes the whole collection).
   * Equality-only filters need no composite index (no `orderBy` for a delete). Records the purge
   * itself as a brand-new entry afterwards — the deleted rows are gone, but the fact that someone
   * cleared the log at this time is not.
   */
  async deleteAll(menuKey: string | null, actorUid: string | null): Promise<number> {
    const constraints = [];
    if (actorUid) constraints.push(where('actorUid', '==', actorUid));
    if (menuKey) constraints.push(where('menuKey', '==', menuKey));
    const count = await this.fs.removeMatching(PATH, ...constraints);

    const scope = actorUid && menuKey ? `manager + menu "${menuKey}"` : actorUid ? 'manager' : menuKey ? `menu "${menuKey}"` : 'toàn bộ';
    await this.log('activity_log_purge', `Đã xoá ${count} dòng nhật ký hoạt động (phạm vi: ${scope})`);
    return count;
  }
}

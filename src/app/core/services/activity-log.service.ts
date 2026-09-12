import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { DocumentData, QueryDocumentSnapshot, limit, orderBy, where } from '@angular/fire/firestore';
import { Observable, combineLatest, map, of, switchMap } from 'rxjs';
import { FirestoreBaseService, PagedResult } from './firestore-base.service';
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
 * Admin-only audit trail. Any signed-in user may write an entry (see firestore.rules — the write
 * side is intentionally open so every action-taking service can log without extra auth plumbing),
 * but only for themselves as actor, and only an admin may ever read the collection back.
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

  /**
   * Records one action by the currently signed-in user. Never throws — a logging failure must
   * never break the real mutation it's attached to, so callers can simply `await` this as their
   * last step without extra try/catch boilerplate.
   */
  async log(action: ActivityAction, description: string, tournamentId: string | null = null): Promise<void> {
    try {
      const uid = this.auth.firebaseUser()?.uid;
      if (!uid) return;
      const email = this.auth.appUser()?.email ?? this.auth.firebaseUser()?.email ?? null;
      const name = userDisplayName(this.auth.appUser(), this.auth.firebaseUser()?.displayName || email || 'Unknown');
      const sourcePath = this.router.url;
      await this.fs.add<Omit<ActivityLog, 'id' | 'createdDate'>>(PATH, {
        actorUid: uid,
        actorEmail: email,
        actorName: name,
        action,
        description,
        tournamentId,
        sourcePath,
        menuKey: menuInfoForPath(sourcePath).key,
      });
    } catch (err) {
      console.error('[ActivityLogService] log failed', action, err);
    }
  }

  /** One page of the audit trail, newest first — optionally restricted to one menu bucket and/or
   *  one actor (see firestore.indexes.json for the composite indexes each combination needs). */
  async getPaged(
    pageSize: number,
    cursor: QueryDocumentSnapshot<DocumentData> | null,
    menuKey: string | null,
    actorUid: string | null = null
  ): Promise<PagedResult<ActivityLog>> {
    const constraints = [];
    if (actorUid) constraints.push(where('actorUid', '==', actorUid));
    if (menuKey) constraints.push(where('menuKey', '==', menuKey));
    constraints.push(orderBy('createdDate', 'desc'));
    return this.fs.getPaged<ActivityLog>(PATH, pageSize, cursor, ...constraints);
  }

  /** One-shot check: has this uid ever logged an action? Powers the "/history" manager filter,
   *  which should only list managers who've actually done something — no live subscription needed
   *  for a filter dropdown, so a single `limit(1)` lookup per candidate is enough. */
  async hasActed(uid: string): Promise<boolean> {
    const rows = await this.fs.getOnce<ActivityLog>(PATH, where('actorUid', '==', uid), limit(1));
    return rows.length > 0;
  }

  /** Live combination of the current admin's bulk cursor + individually-marked-seen entry ids —
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

  /** Live "unseen" count for the current admin, capped at `UNSEEN_CAP` — feeds the bell icon's
   *  badge. Subtracts entries that were individually marked seen via `markSeen`. */
  streamUnseenCount(): Observable<number> {
    return this.streamSeenState().pipe(
      switchMap((state) =>
        this.fs
          .streamCollection<ActivityLog>(
            PATH,
            where('createdDate', '>', state.lastSeenAt),
            orderBy('createdDate', 'desc'),
            limit(UNSEEN_CAP)
          )
          .pipe(map((list) => list.filter((l) => !state.seenIds.has(l.id)).length))
      )
    );
  }

  /** Marks one entry as seen for the current admin — this is what "subtracts" it from the bell
   *  badge without waiting for "mark all as seen". No-op (not an error) once it's already covered
   *  by the bulk cursor. */
  async markSeen(logId: string): Promise<void> {
    const uid = this.auth.firebaseUser()?.uid;
    if (!uid) return;
    await this.fs.set<Omit<ActivityLogSeenItem, 'id'>>(SEEN_ITEMS_SUBPATH(uid), logId, { seenAt: Date.now() });
  }

  /** Marks every current entry as seen for the current admin (a single small cursor write — the
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

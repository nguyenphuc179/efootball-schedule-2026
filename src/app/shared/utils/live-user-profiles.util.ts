import { Observable, catchError, combineLatest, map, of, switchMap } from 'rxjs';
import { FirestoreBaseService } from '../../core/services/firestore-base.service';
import { AppUser } from '../../models/user.model';

/** Builds the stable, order-independent key `liveUserProfiles` expects from any list of
 *  (possibly missing) uids — callers recompute this from their own data so the profile stream
 *  below only re-subscribes when the actual SET of uids changes. */
export function uidsKey(uids: (string | null | undefined)[]): string {
  return [...new Set(uids.filter((u): u is string => !!u))].sort().join('|');
}

/** Resolves each uid's current `users/{uid}` profile live — used everywhere a denormalized name
 *  snapshot (a team's `manager`, a champion's `playerName`, a poll's `createdByName`, ...) needs
 *  to stay in sync with the account instead of freezing at save time. Firestore rules require
 *  sign-in to read even a single `users/{uid}` doc (`allow get: if isSignedIn()`), so for a
 *  signed-out viewer this silently resolves to an empty map — callers should keep a denormalized
 *  fallback for that case. */
export function liveUserProfiles(
  fs: FirestoreBaseService,
  uidsKey$: Observable<string>
): Observable<Map<string, AppUser>> {
  return uidsKey$.pipe(
    switchMap((key) => {
      const uids = key ? key.split('|') : [];
      if (!uids.length) return of(new Map<string, AppUser>());
      return combineLatest(
        uids.map((uid) => fs.streamDoc<AppUser>(`users/${uid}`).pipe(catchError(() => of(undefined))))
      ).pipe(
        map(
          (users) =>
            new Map(uids.map((uid, i) => [uid, users[i]] as const).filter((e): e is [string, AppUser] => !!e[1]))
        )
      );
    })
  );
}

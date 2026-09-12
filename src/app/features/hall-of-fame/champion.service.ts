import { Injectable, computed, inject } from '@angular/core';
import { orderBy } from '@angular/fire/firestore';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, map, of, switchMap } from 'rxjs';
import { FirestoreBaseService } from '../../core/services/firestore-base.service';
import { Champion, ChampionDraft } from '../../models/champion.model';
import { AppUser, userDisplayName } from '../../models/user.model';

const PATH = 'champions';

/** A Champion with its display name/email resolved live from the linked account, if any. */
export type ChampionResolved = Champion & { email?: string };

@Injectable({ providedIn: 'root' })
export class ChampionService {
  private fs = inject(FirestoreBaseService);

  /** Public Hall of Fame — newest season first. */
  readonly all = toSignal(
    this.fs.streamCollection<Champion>(PATH, orderBy('season', 'desc')),
    { initialValue: [] as Champion[] }
  );

  /** Stable, order-independent key so the profile stream below only re-subscribes when the
   *  actual SET of linked-account uids changes. */
  private managerUidsKey = computed(() =>
    [...new Set(this.all().map((c) => c.managerUid).filter((u): u is string => !!u))].sort().join('|')
  );

  /** Live current name + email for every champion linked to an account, keyed by uid. Firestore
   *  rules require sign-in to read a `users/{uid}` doc — for a guest this silently resolves to
   *  nothing per uid, and `allResolved` below falls back to the entry's stored `playerName`. */
  private managerProfiles = toSignal(
    toObservable(this.managerUidsKey).pipe(
      switchMap((key) => {
        const uids = key ? key.split('|') : [];
        if (!uids.length) return of(new Map<string, AppUser>());
        return combineLatest(
          uids.map((uid) => this.fs.streamDoc<AppUser>(`users/${uid}`).pipe(catchError(() => of(undefined))))
        ).pipe(
          map(
            (users) =>
              new Map(
                uids.map((uid, i) => [uid, users[i]] as const).filter((e): e is [string, AppUser] => !!e[1])
              )
          )
        );
      })
    ),
    { initialValue: new Map<string, AppUser>() }
  );

  /** `all()` with each entry's display name resolved live from its linked account (if any) — a
   *  rename shows up immediately instead of waiting for the entry to be re-saved — plus the
   *  manager's email for admins. Use this for display; `all()` stays the raw stored data. */
  readonly allResolved = computed<ChampionResolved[]>(() =>
    this.all().map((c) => {
      const profile = c.managerUid ? this.managerProfiles().get(c.managerUid) : undefined;
      return {
        ...c,
        playerName: (profile && userDisplayName(profile, '')) || c.playerName,
        email: profile?.email?.trim() || undefined,
      };
    })
  );

  create(draft: ChampionDraft): Promise<string> {
    return this.fs.add<ChampionDraft>(PATH, draft);
  }

  update(id: string, draft: Partial<ChampionDraft>): Promise<void> {
    return this.fs.update(PATH, id, draft);
  }

  remove(id: string): Promise<void> {
    return this.fs.remove(PATH, id);
  }
}

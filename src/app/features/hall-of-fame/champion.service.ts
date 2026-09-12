import { Injectable, computed, inject } from '@angular/core';
import { orderBy } from '@angular/fire/firestore';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FirestoreBaseService } from '../../core/services/firestore-base.service';
import { ActivityLogService } from '../../core/services/activity-log.service';
import { Champion, ChampionDraft } from '../../models/champion.model';
import { AppUser, userDisplayName } from '../../models/user.model';
import { liveUserProfiles, uidsKey } from '../../shared/utils/live-user-profiles.util';

const PATH = 'champions';

/** A Champion with its display name/email resolved live from the linked account, if any. */
export type ChampionResolved = Champion & { email?: string };

@Injectable({ providedIn: 'root' })
export class ChampionService {
  private fs = inject(FirestoreBaseService);
  private activityLog = inject(ActivityLogService);

  /** Public Hall of Fame — newest season first. */
  readonly all = toSignal(
    this.fs.streamCollection<Champion>(PATH, orderBy('season', 'desc')),
    { initialValue: [] as Champion[] }
  );

  /** Stable, order-independent key so the profile stream below only re-subscribes when the
   *  actual SET of linked-account uids changes. */
  private managerUidsKey = computed(() => uidsKey(this.all().map((c) => c.managerUid)));

  /** Live current name + email for every champion linked to an account, keyed by uid — falls
   *  back to the entry's stored `playerName` for a guest viewer (see `liveUserProfiles`). */
  private managerProfiles = toSignal(liveUserProfiles(this.fs, toObservable(this.managerUidsKey)), {
    initialValue: new Map<string, AppUser>(),
  });

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

  async create(draft: ChampionDraft): Promise<string> {
    const id = await this.fs.add<ChampionDraft>(PATH, draft);
    await this.activityLog.log(
      'champion_create',
      `Đã thêm nhà vô địch mùa ${draft.season}: ${draft.playerName}`,
      draft.tournamentId ?? null
    );
    return id;
  }

  async update(id: string, draft: Partial<ChampionDraft>): Promise<void> {
    await this.fs.update(PATH, id, draft);
    const champion = this.all().find((c) => c.id === id);
    await this.activityLog.log(
      'champion_update',
      `Đã cập nhật nhà vô địch mùa ${draft.season ?? champion?.season ?? ''}: ${draft.playerName ?? champion?.playerName ?? id}`,
      draft.tournamentId ?? champion?.tournamentId ?? null
    );
  }

  async remove(id: string): Promise<void> {
    const champion = this.all().find((c) => c.id === id);
    await this.fs.remove(PATH, id);
    await this.activityLog.log(
      'champion_delete',
      `Đã xoá nhà vô địch mùa ${champion?.season ?? ''}: ${champion?.playerName ?? id}`,
      champion?.tournamentId ?? null
    );
  }
}

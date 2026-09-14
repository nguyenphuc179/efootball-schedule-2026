import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, map, of, switchMap } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TeamService } from '../teams/team.service';
import { LineupService } from './lineup.service';
import { AuthService } from '../../core/services/auth.service';
import { FirestoreBaseService } from '../../core/services/firestore-base.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { liveUserProfiles, uidsKey } from '../../shared/utils/live-user-profiles.util';
import { downscaleToDataUri } from '../../shared/utils/image-downscale.util';
import { AppUser, userDisplayName } from '../../models/user.model';
import { LineupImage } from '../../models/lineup.model';
import { Team } from '../../models/team.model';

interface ManagerOption {
  key: string; // managerUid, or `team:<teamId>` when there's no linked account
  /** Same as `key` when there's a linked account, `null` otherwise — kept separate from `key` so
   *  callers logging an action about this manager (see `LineupService.upload`/`remove`) never
   *  accidentally stamp the `team:<teamId>` placeholder as a Firebase uid. */
  uid: string | null;
  name: string;
  email: string | null;
}

/** How many of a manager's uploaded lineup slots are approved — powers both the dropdown's
 *  "N/M đã duyệt" hint and the tournament-wide pending-review summary banner. */
interface ManagerLineupStatus {
  total: number;
  approved: number;
}

/**
 * "Đội hình thi đấu" tab. Images normally come from an external capture tool via Firestore's
 * public REST API (see firestore.rules `lineups/{parentId}/images/{slot}`). Managers who can't run
 * that tool (e.g. console/PS5 players) instead send a screenshot to an admin, who uploads it here
 * manually — same storage shape, filling whichever of the 4 slots is still free. Admins can also
 * delete a bad/stale image. Dropdown is scoped to this tournament's own teams.
 */
@Component({
  selector: 'app-lineup-view',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (managers().length === 0) {
      <app-empty-state icon="groups" [title]="'LINEUP.NO_MANAGERS' | translate" />
    } @else {
      @if (auth.isAdmin() && pendingApprovalCount() > 0) {
        <div class="mb-3 text-xs font-medium bg-amber-50 text-amber-700 rounded-lg px-3 py-2 flex items-center gap-1.5">
          <span class="material-icons text-[16px]">pending_actions</span>
          {{ 'LINEUP.PENDING_APPROVAL_SUMMARY' | translate: { count: pendingApprovalCount() } }}
        </div>
      }

      <label class="flex flex-col gap-1 mb-4">
        <span class="text-sm font-medium text-gray-600">{{ 'LINEUP.SELECT_MANAGER_LABEL' | translate }}</span>
        <select class="input-field" [value]="selectedKey()" (change)="selectedKey.set($any($event.target).value)">
          @for (m of managers(); track m.key) {
            @let status = managerLineupStatus().get(m.key);
            <option [value]="m.key">
              {{ m.name }}{{ status && status.total > 0 ? (' - ' + ('LINEUP.APPROVAL_PROGRESS_SUFFIX' | translate: { approved: status.approved, total: status.total })) : '' }}
            </option>
          }
        </select>
      </label>

      @if (selectedManager(); as manager) {
        @if (!manager.email) {
          <p class="text-sm text-gray-400">{{ 'LINEUP.NO_ACCOUNT' | translate }}</p>
        } @else {
          @if (images().length === 0) {
            <app-empty-state icon="image" [title]="'LINEUP.EMPTY_TITLE' | translate" [subtitle]="'LINEUP.EMPTY_SUBTITLE' | translate" />
          }
          @if (images().length > 0 || canUpload()) {
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3" [class.mt-3]="images().length === 0">
              @for (img of images(); track img.id) {
                <div
                  class="relative rounded-xl overflow-hidden bg-surface-muted aspect-square"
                  [class.ring-2]="approvals().get(img.id)"
                  [class.ring-green-500]="approvals().get(img.id)"
                >
                  <button type="button" class="w-full h-full block" (click)="preview.set(img.image)">
                    <img [src]="img.image" class="w-full h-full object-contain" alt="" />
                  </button>
                  <span class="absolute top-1.5 left-1.5 text-[10px] font-semibold bg-black/60 text-white rounded px-1.5 py-0.5">
                    {{ 'LINEUP.IMAGE_NUMBER' | translate: { n: img.id } }}
                  </span>
                  @if (auth.isAdmin()) {
                    <button
                      type="button"
                      class="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center"
                      (click)="remove(img.id)"
                      [attr.aria-label]="'COMMON.REMOVE' | translate"
                    >
                      <span class="material-icons text-[16px]">close</span>
                    </button>
                    <button
                      type="button"
                      class="absolute bottom-1.5 inset-x-1.5 text-[11px] font-semibold rounded-lg py-1 flex items-center justify-center gap-1 disabled:opacity-50"
                      [class]="approvals().get(img.id) ? 'bg-green-600 text-white' : 'bg-black/60 text-white'"
                      [disabled]="approvingSlot() === img.id"
                      (click)="toggleApprove(img.id, !approvals().get(img.id))"
                    >
                      <span class="material-icons text-[14px]">
                        {{ approvingSlot() === img.id ? 'hourglass_top' : (approvals().get(img.id) ? 'check_circle' : 'radio_button_unchecked') }}
                      </span>
                      {{ (approvals().get(img.id) ? 'LINEUP.APPROVED' : 'LINEUP.APPROVE') | translate }}
                    </button>
                  } @else {
                    @if (canUpload() && !approvals().get(img.id)) {
                      <button
                        type="button"
                        class="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center"
                        (click)="remove(img.id)"
                        [attr.aria-label]="'COMMON.REMOVE' | translate"
                      >
                        <span class="material-icons text-[16px]">close</span>
                      </button>
                    }
                    @if (approvals().get(img.id)) {
                      <span class="absolute bottom-1.5 inset-x-1.5 text-[11px] font-semibold rounded-lg py-1 bg-green-600 text-white text-center">
                        {{ 'LINEUP.APPROVED' | translate }}
                      </span>
                    }
                  }
                </div>
              }
              @if (canUpload() && freeSlots().length > 0) {
                <div class="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-2 p-2">
                  <button
                    type="button"
                    class="flex flex-col items-center gap-0.5 text-gray-500 active:text-primary-600 disabled:opacity-50"
                    [disabled]="uploading()"
                    (click)="cameraInput.click()"
                  >
                    <span class="material-icons text-[22px]">{{ uploading() ? 'hourglass_top' : 'photo_camera' }}</span>
                    <span class="text-[11px] font-medium">{{ 'LINEUP.TAKE_PHOTO' | translate }}</span>
                  </button>
                  <button
                    type="button"
                    class="flex flex-col items-center gap-0.5 text-gray-400 active:text-primary-600 disabled:opacity-50"
                    [disabled]="uploading()"
                    (click)="fileInput.click()"
                  >
                    <span class="material-icons text-[18px]">add_photo_alternate</span>
                    <span class="text-[11px] font-medium">{{ 'LINEUP.ADD_IMAGE' | translate }}</span>
                  </button>
                </div>
                <!-- capture="environment" opens the device's rear camera directly on mobile, skipping the
                     gallery/camera chooser — for managers on console (PS5, etc.) photographing their TV screen. -->
                <input #cameraInput type="file" accept="image/*" capture="environment" hidden (change)="onFileSelected($event)" />
                <input #fileInput type="file" accept="image/*" hidden (change)="onFileSelected($event)" />
              }
            </div>
          }
          @if (uploadError()) {
            <p class="text-xs text-red-500 mt-2">{{ uploadError() }}</p>
          }
          @if (approveError()) {
            <p class="text-xs text-red-500 mt-2">{{ approveError() }}</p>
          }
        }
      }
    }

    @if (preview(); as src) {
      <div
        class="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
        (click)="preview.set(null)"
      >
        <img [src]="src" class="max-w-full max-h-full object-contain" alt="" (click)="$event.stopPropagation()" />
        <button
          type="button"
          class="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center"
          (click)="preview.set(null)"
          [attr.aria-label]="'COMMON.CLOSE' | translate"
        >
          <span class="material-icons">close</span>
        </button>
      </div>
    }
  `,
})
export class LineupViewComponent {
  private teamService = inject(TeamService);
  private lineupService = inject(LineupService);
  private fs = inject(FirestoreBaseService);
  private dialog = inject(MatDialog);
  private translate = inject(TranslateService);
  auth = inject(AuthService);

  tournamentId = input.required<string>();

  private teams = toSignal(
    toObservable(this.tournamentId).pipe(switchMap((id) => this.teamService.streamByTournament(id))),
    { initialValue: [] as Team[] }
  );

  private managerUidsKey = computed(() => uidsKey(this.teams().map((t) => t.managerUid)));
  private managerProfiles = toSignal(liveUserProfiles(this.fs, toObservable(this.managerUidsKey)), {
    initialValue: new Map<string, AppUser>(),
  });

  managers = computed<ManagerOption[]>(() => {
    const profiles = this.managerProfiles();
    const seen = new Set<string>();
    const list: ManagerOption[] = [];
    for (const t of this.teams()) {
      const key = t.managerUid ?? `team:${t.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const profile = t.managerUid ? profiles.get(t.managerUid) : undefined;
      const name = (profile && userDisplayName(profile, '')) || t.manager?.trim() || t.teamName;
      const email = profile?.email?.trim().toLowerCase() || null;
      list.push({ key, uid: t.managerUid ?? null, name, email });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  });

  /** Live upload/approval tally per manager, keyed by `ManagerOption.key` — powers the "N/M đã
   *  duyệt" hint in the dropdown so an admin can tell at a glance who still needs a screenshot or a
   *  review without clicking through every manager, plus `pendingApprovalCount` below. Two
   *  listeners (images + approvals) per manager with a linked email, which is fine at this app's
   *  team-count scale. Re-subscribes whenever the manager list changes. */
  managerLineupStatus = toSignal(
    toObservable(this.managers).pipe(
      switchMap((list) => {
        const withEmail = list.filter((m) => m.email);
        if (withEmail.length === 0) return of(new Map<string, ManagerLineupStatus>());
        return combineLatest(
          withEmail.map((m) =>
            combineLatest([
              this.lineupService.streamImages(this.tournamentId(), m.email!),
              this.lineupService.streamApprovals(this.tournamentId(), m.email!),
            ]).pipe(
              map(([imgs, approvals]): [string, ManagerLineupStatus] => [
                m.key,
                { total: imgs.length, approved: imgs.filter((img) => approvals.get(img.id)).length },
              ])
            )
          )
        ).pipe(map((entries) => new Map(entries)));
      })
    ),
    { initialValue: new Map<string, ManagerLineupStatus>() }
  );

  /** Sum of not-yet-approved uploaded images across every manager in this tournament — the
   *  admin-only "N ảnh đang chờ duyệt" banner above the dropdown. */
  pendingApprovalCount = computed(() => {
    let pending = 0;
    for (const status of this.managerLineupStatus().values()) pending += status.total - status.approved;
    return pending;
  });

  /** Backfills `teams.managerEmail`/`teams.manager` for teams saved before those were in sync with
   *  the manager's account — either the field didn't exist yet, the account's email changed, or an
   *  admin renamed the account (`systemDisplayName`) after the team was last saved. Both are cached
   *  snapshots (not live), and the external capture tool reads them straight off this public-read
   *  `teams` doc: `managerEmail` for its tournament lookup, `manager` as the nice display name to
   *  log with instead of a raw Gmail address (see LINEUP_TOOL_INTEGRATION.md). Runs opportunistically
   *  whenever an admin opens this tab, using data already loaded for the dropdown. */
  private backfillManagerFields = effect(() => {
    if (!this.auth.isAdmin()) return;
    const profiles = this.managerProfiles();
    for (const team of this.teams()) {
      if (!team.managerUid) continue;
      const profile = profiles.get(team.managerUid);
      if (!profile) continue;
      const email = profile.email?.trim().toLowerCase() || null;
      const name = userDisplayName(profile, team.manager);
      const patch: { managerEmail?: string; manager?: string } = {};
      if (email && team.managerEmail !== email) patch.managerEmail = email;
      if (name && team.manager !== name) patch.manager = name;
      if (Object.keys(patch).length > 0) {
        this.teamService.update(team.id, patch).catch((err) => console.error('[Lineup] backfill manager fields', err));
      }
    }
  });

  selectedKey = signal<string>('');
  preview = signal<string | null>(null);

  /** A signed-in non-admin manager should land straight on their own team's slot instead of
   *  whichever manager sorts first alphabetically — that's the one they can actually upload to. */
  private autoSelectOwnManager = effect(() => {
    if (this.auth.isAdmin() || this.selectedKey()) return;
    const uid = this.auth.firebaseUser()?.uid;
    if (!uid) return;
    const mine = this.managers().find((m) => m.uid === uid);
    if (mine) this.selectedKey.set(mine.key);
  });

  @HostListener('document:keydown.escape')
  closePreview(): void {
    this.preview.set(null);
  }

  selectedManager = computed(() => {
    const list = this.managers();
    if (!list.length) return null;
    return list.find((m) => m.key === this.selectedKey()) ?? list[0];
  });

  private imageQueryKey = computed(() => {
    const m = this.selectedManager();
    return m?.email ? `${this.tournamentId()}|${m.email}` : '';
  });

  images = toSignal(
    toObservable(this.imageQueryKey).pipe(
      switchMap((key) => {
        if (!key) return of([] as LineupImage[]);
        const [tournamentId, email] = key.split('|');
        return this.lineupService.streamImages(tournamentId, email);
      })
    ),
    { initialValue: [] as LineupImage[] }
  );

  /** Live approved/not-approved lookup for the selected manager's slots — see `LineupApproval`. */
  approvals = toSignal(
    toObservable(this.imageQueryKey).pipe(
      switchMap((key) => {
        if (!key) return of(new Map<string, boolean>());
        const [tournamentId, email] = key.split('|');
        return this.lineupService.streamApprovals(tournamentId, email);
      })
    ),
    { initialValue: new Map<string, boolean>() }
  );

  /** Manual upload fallback (e.g. console/PS5 managers who can't run the capture tool) — either an
   *  admin uploading on the manager's behalf, or the manager themselves (signed in, linked account,
   *  viewing their own slot) capturing/picking a photo of their own screen directly. Never lets a
   *  manager upload into another manager's slot. */
  canUpload = computed(() => {
    const manager = this.selectedManager();
    if (!manager?.email) return false;
    if (this.auth.isAdmin()) return true;
    const uid = this.auth.firebaseUser()?.uid;
    return !!uid && !!manager.uid && uid === manager.uid;
  });

  freeSlots = computed(() => {
    const used = new Set(this.images().map((img) => img.id));
    return ['1', '2', '3', '4'].filter((slot) => !used.has(slot));
  });

  uploading = signal(false);
  uploadError = signal('');

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow picking the same file again later
    if (!file) return;

    const manager = this.selectedManager();
    const slot = this.freeSlots()[0];
    if (!manager?.email || !slot) return;

    this.uploadError.set('');
    this.uploading.set(true);
    try {
      const image = await downscaleToDataUri(file);
      await this.lineupService.upload(this.tournamentId(), manager.email, slot, image, manager.name, manager.uid);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.uploadError.set(`${this.translate.instant('LINEUP.UPLOAD_FAILED')} (${detail})`);
    } finally {
      this.uploading.set(false);
    }
  }

  async remove(slot: string): Promise<void> {
    const manager = this.selectedManager();
    if (!manager?.email) return;

    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: this.translate.instant('LINEUP.DELETE_CONFIRM_TITLE'),
        message: this.translate.instant('LINEUP.DELETE_CONFIRM_MESSAGE'),
        destructive: true,
        confirmLabel: this.translate.instant('COMMON.DELETE'),
      },
      width: '90vw',
      maxWidth: '400px',
    });

    const confirmed = await ref.afterClosed().toPromise();
    if (!confirmed) return;

    await this.lineupService.remove(this.tournamentId(), manager.email, slot, manager.name, manager.uid);
  }

  approvingSlot = signal<string | null>(null);
  approveError = signal('');

  async toggleApprove(slot: string, approved: boolean): Promise<void> {
    const manager = this.selectedManager();
    if (!manager?.email || this.approvingSlot()) return;

    this.approveError.set('');
    this.approvingSlot.set(slot);
    try {
      await this.lineupService.setApproved(this.tournamentId(), manager.email, slot, approved, manager.name, manager.uid);
    } catch (err) {
      console.error('[Lineup] setApproved', err);
      this.approveError.set(this.translate.instant('LINEUP.APPROVE_FAILED'));
    } finally {
      this.approvingSlot.set(null);
    }
  }
}

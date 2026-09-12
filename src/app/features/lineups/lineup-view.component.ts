import { ChangeDetectionStrategy, Component, HostListener, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TeamService } from '../teams/team.service';
import { LineupService } from './lineup.service';
import { AuthService } from '../../core/services/auth.service';
import { FirestoreBaseService } from '../../core/services/firestore-base.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { liveUserProfiles, uidsKey } from '../../shared/utils/live-user-profiles.util';
import { AppUser, userDisplayName } from '../../models/user.model';
import { LineupImage } from '../../models/lineup.model';
import { Team } from '../../models/team.model';

interface ManagerOption {
  key: string; // managerUid, or `team:<teamId>` when there's no linked account
  name: string;
  email: string | null;
}

/**
 * "Đội hình thi đấu" tab. Images here come exclusively from an external capture tool via
 * Firestore's public REST API (see firestore.rules `lineups/{parentId}/images/{slot}`) — this app
 * only reads and (for admins) deletes them. Dropdown is scoped to this tournament's own teams.
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
      <label class="flex flex-col gap-1 mb-4">
        <span class="text-sm font-medium text-gray-600">{{ 'LINEUP.SELECT_MANAGER_LABEL' | translate }}</span>
        <select class="input-field" [value]="selectedKey()" (change)="selectedKey.set($any($event.target).value)">
          @for (m of managers(); track m.key) {
            <option [value]="m.key">{{ m.name }}</option>
          }
        </select>
      </label>

      @if (selectedManager(); as manager) {
        @if (!manager.email) {
          <p class="text-sm text-gray-400">{{ 'LINEUP.NO_ACCOUNT' | translate }}</p>
        } @else if (images().length === 0) {
          <app-empty-state icon="image" [title]="'LINEUP.EMPTY_TITLE' | translate" [subtitle]="'LINEUP.EMPTY_SUBTITLE' | translate" />
        } @else {
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            @for (img of images(); track img.id) {
              <div class="relative rounded-xl overflow-hidden bg-surface-muted aspect-square">
                <button type="button" class="w-full h-full block" (click)="preview.set(img.image)">
                  <img [src]="img.image" class="w-full h-full object-contain" alt="" />
                </button>
                @if (auth.isAdmin()) {
                  <button
                    type="button"
                    class="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center"
                    (click)="remove(img.id)"
                    [attr.aria-label]="'COMMON.REMOVE' | translate"
                  >
                    <span class="material-icons text-[16px]">close</span>
                  </button>
                }
              </div>
            }
          </div>
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
      list.push({ key, name, email });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  });

  selectedKey = signal<string>('');
  preview = signal<string | null>(null);

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

    await this.lineupService.remove(this.tournamentId(), manager.email, slot);
  }
}

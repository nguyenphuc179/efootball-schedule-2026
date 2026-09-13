import { ChangeDetectionStrategy, Component, Inject, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { ManagerRank, RankingService } from './ranking.service';
import { ChampionService } from '../hall-of-fame/champion.service';
import { ManagerImageService } from './manager-image.service';
import { initialsAvatar } from '../../shared/utils/avatar.util';

export interface ManagerDetailDialogData {
  manager: ManagerRank;
}

/**
 * "Xếp hạng" row detail — opened by clicking a manager's row. Shows their all-time record (already
 * on the leaderboard row) plus what that total is made of: every tournament/team they've played
 * for with its own W-D-L, and any Hall of Fame trophies. Read-only; editing the portrait stays on
 * the leaderboard row itself (`ManagerImageFormComponent`).
 */
@Component({
  selector: 'app-manager-detail',
  standalone: true,
  imports: [CommonModule, MatDialogModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh w-full flex flex-col bg-white">
      <div class="flex items-center justify-between h-14 px-4 border-b border-gray-100">
        <button class="w-9 h-9 flex items-center justify-center" (click)="dialogRef.close()">
          <span class="material-icons">close</span>
        </button>
        <h1 class="font-bold truncate px-2">{{ data.manager.manager }}</h1>
        <span class="w-9 h-9"></span>
      </div>

      <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
        <div class="flex flex-col items-center gap-1.5">
          <div
            class="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center"
            [style.background-color]="avatar().bg"
          >
            @if (portrait(); as url) {
              <img [src]="url" [alt]="data.manager.manager" class="w-full h-full object-cover" referrerpolicy="no-referrer" />
            } @else {
              <span class="text-2xl font-bold" [style.color]="avatar().fg">{{ avatar().initials }}</span>
            }
          </div>
          @if (data.manager.email) {
            <div class="text-xs text-gray-400">{{ data.manager.email }}</div>
          }
        </div>

        <div class="grid grid-cols-4 gap-2 text-center">
          <div class="card !p-2">
            <div class="text-lg font-extrabold text-primary-600">{{ data.manager.points }}</div>
            <div class="text-[10px] text-gray-400 uppercase tracking-wide">{{ 'STANDINGS.PTS_ABBR' | translate }}</div>
          </div>
          <div class="card !p-2">
            <div class="text-lg font-extrabold">{{ data.manager.wins }}</div>
            <div class="text-[10px] text-gray-400 uppercase tracking-wide">{{ 'RANKING.DETAIL_WINS' | translate }}</div>
          </div>
          <div class="card !p-2">
            <div class="text-lg font-extrabold">{{ data.manager.draws }}</div>
            <div class="text-[10px] text-gray-400 uppercase tracking-wide">{{ 'RANKING.DETAIL_DRAWS' | translate }}</div>
          </div>
          <div class="card !p-2">
            <div class="text-lg font-extrabold">{{ data.manager.losses }}</div>
            <div class="text-[10px] text-gray-400 uppercase tracking-wide">{{ 'RANKING.DETAIL_LOSSES' | translate }}</div>
          </div>
        </div>

        @if (trophies().length > 0) {
          <div>
            <h3 class="text-xs font-bold uppercase text-gray-400 mb-2">{{ 'RANKING.DETAIL_TROPHIES' | translate }}</h3>
            <div class="flex flex-col gap-2">
              @for (c of trophies(); track c.id) {
                <div class="flex items-center gap-2.5 card !py-2">
                  <span class="material-icons text-amber-500">military_tech</span>
                  <div class="min-w-0">
                    <div class="text-sm font-semibold truncate">{{ 'HALL_OF_FAME.SEASON' | translate: { season: c.season } }}</div>
                    <div class="text-xs text-gray-400 truncate">{{ c.club }}</div>
                  </div>
                </div>
              }
            </div>
          </div>
        }

        <div>
          <h3 class="text-xs font-bold uppercase text-gray-400 mb-2">{{ 'RANKING.DETAIL_HISTORY' | translate }}</h3>
          @if (history().length === 0) {
            <p class="text-sm text-gray-400">{{ 'RANKING.DETAIL_HISTORY_EMPTY' | translate }}</p>
          } @else {
            <div class="flex flex-col divide-y divide-gray-100">
              @for (h of history(); track h.tournamentId + h.teamName) {
                <button type="button" class="flex items-center gap-3 py-2.5 text-left w-full" (click)="openTournament(h.tournamentId)">
                  <span class="w-8 h-8 rounded-lg overflow-hidden bg-surface-muted flex items-center justify-center shrink-0">
                    @if (h.teamLogo) {
                      <img [src]="h.teamLogo" alt="" class="w-full h-full object-cover" />
                    } @else {
                      <span class="material-icons text-[16px] text-gray-300">shield</span>
                    }
                  </span>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-semibold truncate">{{ h.tournamentName }}</div>
                    <div class="text-xs text-gray-400 truncate">{{ h.teamName }} · {{ h.wins }}-{{ h.draws }}-{{ h.losses }}</div>
                  </div>
                  <span class="text-right shrink-0">
                    <span class="font-black text-sm">{{ h.points }}</span>
                    <span class="block text-[9px] text-gray-400 uppercase tracking-wide">{{ 'STANDINGS.PTS_ABBR' | translate }}</span>
                  </span>
                </button>
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class ManagerDetailComponent {
  private rankingService = inject(RankingService);
  private championService = inject(ChampionService);
  private images = inject(ManagerImageService);
  private router = inject(Router);

  constructor(
    public dialogRef: MatDialogRef<ManagerDetailComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ManagerDetailDialogData
  ) {}

  avatar = () => initialsAvatar(this.data.manager.manager);
  portrait = () => this.images.byManager().get(this.data.manager.manager);
  history = computed(() => this.rankingService.historyFor(this.data.manager));
  trophies = computed(() => this.championService.forManager(this.data.manager));

  openTournament(tournamentId: string): void {
    this.dialogRef.close();
    this.router.navigate(['/tournaments', tournamentId]);
  }
}

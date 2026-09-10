import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TournamentService } from '../tournament.service';
import { AuthService } from '../../../core/services/auth.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import {
  TOURNAMENT_STATUS_LABELS,
  TOURNAMENT_TYPE_LABELS,
  TournamentStatus,
} from '../../../models/tournament.model';

type FilterTab = 'all' | TournamentStatus;

@Component({
  selector: 'app-tournament-list',
  standalone: true,
  imports: [CommonModule, RouterLink, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-content-area px-4 pt-4 max-w-3xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-extrabold">Tournaments</h1>
        @if (auth.isAdmin()) {
          <a routerLink="/tournaments/create" class="btn-primary !py-2 !px-3 text-sm flex items-center gap-1">
            <span class="material-icons text-[18px]">add</span> New
          </a>
        }
      </div>

      <div class="flex gap-2 overflow-x-auto pb-3 -mx-4 px-4">
        @for (tab of tabs; track tab.value) {
          <button
            class="px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap"
            [class]="activeTab() === tab.value ? 'bg-primary-500 text-white' : 'bg-white border border-gray-200 text-gray-600'"
            (click)="activeTab.set(tab.value)"
          >
            {{ tab.label }}
          </button>
        }
      </div>

      @if (filtered().length === 0) {
        <app-empty-state icon="emoji_events" title="No tournaments" subtitle="Check back soon or create one." />
      } @else {
        <div class="flex flex-col gap-3 mt-2">
          @for (t of filtered(); track t.id) {
            <a [routerLink]="['/tournaments', t.id]" class="card flex gap-3 no-underline text-inherit">
              <div class="w-16 h-16 rounded-xl bg-primary-50 flex items-center justify-center overflow-hidden shrink-0">
                @if (t.image) {
                  <img [src]="t.image" [alt]="t.name" class="w-full h-full object-cover" width="64" height="64" />
                } @else {
                  <span class="material-icons text-primary-400 text-2xl">emoji_events</span>
                }
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold truncate">{{ t.name }}</div>
                <div class="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                  <span class="material-icons text-[14px]">place</span>{{ t.location }}
                </div>
                <div class="flex items-center gap-2 mt-1.5">
                  <span class="badge" [class]="statusClasses(t.status)">{{ statusLabels[t.status] }}</span>
                  <span class="text-[11px] text-gray-400">{{ typeLabels[t.type] }}</span>
                </div>
              </div>
            </a>
          }
        </div>
      }
    </div>
  `,
})
export class TournamentListComponent {
  private tournamentService = inject(TournamentService);
  auth = inject(AuthService);
  typeLabels = TOURNAMENT_TYPE_LABELS;
  statusLabels = TOURNAMENT_STATUS_LABELS;

  activeTab = signal<FilterTab>('all');
  tabs: { label: string; value: FilterTab }[] = [
    { label: 'All', value: 'all' },
    { label: 'In Progress', value: 'in_progress' },
    { label: 'Completed', value: 'completed' },
  ];

  tournaments = this.tournamentService.all;

  filtered = computed(() => {
    const tab = this.activeTab();
    const list = this.tournaments();
    return tab === 'all' ? list : list.filter((t) => t.status === tab);
  });

  statusClasses(status: TournamentStatus): string {
    return status === 'completed'
      ? 'bg-gray-100 text-gray-600'
      : 'bg-amber-50 text-accent-amber';
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TournamentService } from '../tournament.service';
import { QrService } from '../../../core/services/qr.service';
import { AuthService } from '../../../core/services/auth.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { TeamListComponent } from '../../teams/team-list/team-list.component';
import { FixturesListComponent } from '../../fixtures/fixtures-list/fixtures-list.component';
import { StandingsViewComponent } from '../../standings/standings-view/standings-view.component';
import { StatisticsComponent } from '../../statistics/statistics.component';
import { SwipeDirective } from '../../../shared/directives/swipe.directive';
import { TOURNAMENT_TYPE_LABELS } from '../../../models/tournament.model';

type TabKey = 'overview' | 'teams' | 'fixtures' | 'results' | 'standings' | 'statistics';
const TAB_ORDER: TabKey[] = ['overview', 'teams', 'fixtures', 'results', 'standings', 'statistics'];

@Component({
  selector: 'app-tournament-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    LoadingSpinnerComponent,
    TeamListComponent,
    FixturesListComponent,
    StandingsViewComponent,
    StatisticsComponent,
    SwipeDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!tournament()) {
      <app-loading-spinner label="Loading tournament…" />
    } @else {
      <div class="app-content-area">
        <!-- Banner + summary -->
        <div class="relative h-40 bg-gradient-to-br from-primary-600 to-primary-800 flex items-end">
          @if (tournament()!.image) {
            <img [src]="tournament()!.image" class="absolute inset-0 w-full h-full object-cover" alt="" />
            <div class="absolute inset-0 bg-black/40"></div>
          }
          <button class="absolute top-3 left-3 w-9 h-9 rounded-full bg-black/30 flex items-center justify-center text-white z-10" (click)="router.navigate(['/tournaments'])">
            <span class="material-icons">arrow_back</span>
          </button>
          <div class="relative z-10 text-white p-4">
            <h1 class="text-xl font-extrabold">{{ tournament()!.name }}</h1>
            <div class="text-xs opacity-90 flex items-center gap-3 mt-1">
              <span class="flex items-center gap-1"><span class="material-icons text-[14px]">place</span>{{ tournament()!.location }}</span>
              <span class="flex items-center gap-1"><span class="material-icons text-[14px]">event</span>{{ dateRange() }}</span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <span class="badge bg-primary-50 text-primary-700">{{ typeLabels[tournament()!.type] }}</span>
          <button class="btn-secondary !py-1.5 !px-3 text-xs flex items-center gap-1 ml-auto" (click)="share()">
            <span class="material-icons text-[16px]">share</span> Share
          </button>
          <a [routerLink]="['/tournaments', tournament()!.id, 'checkin']" class="btn-secondary !py-1.5 !px-3 text-xs flex items-center gap-1">
            <span class="material-icons text-[16px]">qr_code_scanner</span> Check-in
          </a>
          @if (auth.isAdmin()) {
            <a [routerLink]="['/tournaments', tournament()!.id, 'edit']" class="w-8 h-8 flex items-center justify-center text-gray-400">
              <span class="material-icons text-[18px]">edit</span>
            </a>
          }
        </div>

        <!-- Sticky tabs -->
        <div class="sticky-tabs flex overflow-x-auto border-b border-gray-100">
          @for (tab of tabs; track tab.key) {
            <button
              class="px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2"
              [class]="activeTab() === tab.key ? 'border-primary-500 text-primary-700' : 'border-transparent text-gray-500'"
              (click)="activeTab.set(tab.key)"
            >
              {{ tab.label }}
            </button>
          }
        </div>

        <!-- Swipeable panel -->
        <div class="swipe-panel p-4" appSwipe (swipeLeft)="nextTab()" (swipeRight)="prevTab()">
          @switch (activeTab()) {
            @case ('overview') {
              <div class="card">
                <h3 class="font-bold mb-2">About</h3>
                <p class="text-sm text-gray-600 whitespace-pre-line">{{ tournament()!.description || 'No description provided.' }}</p>
                <div class="grid grid-cols-2 gap-3 mt-4 text-sm">
                  <div><span class="text-gray-400">Teams</span><div class="font-semibold">{{ tournament()!.numberOfTeams }}</div></div>
                  <div><span class="text-gray-400">Status</span><div class="font-semibold capitalize">{{ tournament()!.status }}</div></div>
                </div>
              </div>
            }
            @case ('teams') {
              <app-team-list [tournamentId]="tournament()!.id" />
            }
            @case ('fixtures') {
              <app-fixtures-list [tournamentId]="tournament()!.id" filter="upcoming" />
            }
            @case ('results') {
              <app-fixtures-list [tournamentId]="tournament()!.id" filter="completed" />
            }
            @case ('standings') {
              <app-standings-view [tournamentId]="tournament()!.id" />
            }
            @case ('statistics') {
              <app-statistics [tournamentId]="tournament()!.id" />
            }
          }
        </div>
      </div>
    }
  `,
})
export class TournamentDetailComponent {
  private route = inject(ActivatedRoute);
  router = inject(Router);
  private tournamentService = inject(TournamentService);
  private qrService = inject(QrService);
  auth = inject(AuthService);
  typeLabels = TOURNAMENT_TYPE_LABELS;

  private id = this.route.snapshot.paramMap.get('id')!;
  tournament = toSignal(this.tournamentService.streamOne(this.id));

  activeTab = signal<TabKey>((this.route.snapshot.queryParamMap.get('tab') as TabKey) ?? 'overview');

  tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'teams', label: 'Teams' },
    { key: 'fixtures', label: 'Fixtures' },
    { key: 'results', label: 'Results' },
    { key: 'standings', label: 'Standings' },
    { key: 'statistics', label: 'Statistics' },
  ];

  dateRange = computed(() => {
    const t = this.tournament();
    if (!t) return '';
    const fmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${fmt(t.startDate)} – ${fmt(t.endDate)}`;
  });

  nextTab(): void {
    const idx = TAB_ORDER.indexOf(this.activeTab());
    this.activeTab.set(TAB_ORDER[Math.min(idx + 1, TAB_ORDER.length - 1)]);
  }

  prevTab(): void {
    const idx = TAB_ORDER.indexOf(this.activeTab());
    this.activeTab.set(TAB_ORDER[Math.max(idx - 1, 0)]);
  }

  async share(): Promise<void> {
    const t = this.tournament();
    if (!t) return;
    const url = this.qrService.tournamentShareUrl(t.id);
    if (navigator.share) {
      await navigator.share({ title: t.name, url }).catch(() => undefined);
    } else {
      await navigator.clipboard.writeText(url).catch(() => undefined);
    }
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { TournamentService } from '../tournament.service';
import { MatchService } from '../../fixtures/match.service';
import { QrService } from '../../../core/services/qr.service';
import { AuthService } from '../../../core/services/auth.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { TeamListComponent } from '../../teams/team-list/team-list.component';
import { FixturesListComponent } from '../../fixtures/fixtures-list/fixtures-list.component';
import { GroupStageComponent } from '../group-stage/group-stage.component';
import { FinalStageComponent } from '../final-stage/final-stage.component';
import { StandingsViewComponent } from '../../standings/standings-view/standings-view.component';
import { StandingsService } from '../../standings/standings.service';
import { StatisticsComponent } from '../../statistics/statistics.component';
import { SwipeDirective } from '../../../shared/directives/swipe.directive';
import { TOURNAMENT_STATUS_LABELS, TOURNAMENT_TYPE_LABELS } from '../../../models/tournament.model';
import { Match } from '../../../models/match.model';

type TabKey =
  | 'overview'
  | 'teams'
  | 'fixtures'
  | 'results'
  | 'groupStage'
  | 'finalStage'
  | 'standings'
  | 'statistics';

@Component({
  selector: 'app-tournament-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    LoadingSpinnerComponent,
    TeamListComponent,
    FixturesListComponent,
    GroupStageComponent,
    FinalStageComponent,
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
        <div class="relative min-h-[11rem] md:min-h-0 bg-gradient-to-br from-primary-600 to-primary-800 overflow-hidden">
          @if (tournament()!.image) {
            <!-- full-width at the image's own ratio: fills the width, no letterbox; capped so a tall image can't take over -->
            <img [src]="tournament()!.image" class="block w-full h-auto max-h-[30rem] object-cover" alt="" />
          } @else {
            <div class="h-44 md:h-56"></div>
          }
          <div class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent"></div>
          <button class="absolute top-3 left-3 w-9 h-9 rounded-full bg-black/30 flex items-center justify-center text-white z-10" (click)="router.navigate(['/tournaments'])">
            <span class="material-icons">arrow_back</span>
          </button>
          <div class="absolute inset-x-0 bottom-0 z-10 text-white p-4">
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
          @if (auth.isAdmin()) {
            @if (tournament()!.status === 'completed') {
              <button
                class="btn-secondary !py-1.5 !px-3 text-xs flex items-center gap-1"
                [disabled]="isSavingStatus()"
                (click)="reopenTournament()"
              >
                <span class="material-icons text-[16px]">lock_open</span> {{ isSavingStatus() ? '…' : 'Reopen' }}
              </button>
            } @else if (canEndTournament()) {
              <button
                class="btn-secondary !py-1.5 !px-3 text-xs flex items-center gap-1 !text-accent-red"
                [disabled]="isSavingStatus()"
                (click)="endTournament()"
              >
                <span class="material-icons text-[16px]">emoji_events</span> {{ isSavingStatus() ? '…' : 'End' }}
              </button>
            }
            @if (matches().length > 0) {
              <button
                class="btn-secondary !py-1.5 !px-3 text-xs flex items-center gap-1"
                [disabled]="isResetting()"
                (click)="resetMatches()"
              >
                <span class="material-icons text-[16px]">restart_alt</span> {{ isResetting() ? '…' : 'Reset' }}
              </button>
            }
            <a [routerLink]="['/tournaments', tournament()!.id, 'edit']" class="w-8 h-8 flex items-center justify-center text-gray-400">
              <span class="material-icons text-[18px]">edit</span>
            </a>
            <button
              class="w-8 h-8 flex items-center justify-center text-gray-400 disabled:opacity-40"
              [disabled]="isDeleting()"
              (click)="deleteTournament()"
              aria-label="Delete tournament"
            >
              <span class="material-icons text-[18px]">delete_outline</span>
            </button>
          }
        </div>

        <!-- Sticky tabs -->
        <div class="sticky-tabs flex overflow-x-auto border-b border-gray-100">
          @for (tab of tabs(); track tab.key) {
            <button
              class="flex-1 sm:flex-none px-2 sm:px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2"
              [class]="visibleTab() === tab.key ? 'border-primary-500 text-primary-700' : 'border-transparent text-gray-500'"
              (click)="activeTab.set(tab.key)"
            >
              <span class="sm:hidden">{{ tab.short }}</span>
              <span class="hidden sm:inline">{{ tab.label }}</span>
            </button>
          }
        </div>

        <!-- Swipeable panel -->
        <div class="swipe-panel p-4" appSwipe (swipeLeft)="nextTab()" (swipeRight)="prevTab()">
          @switch (visibleTab()) {
            @case ('overview') {
              <div class="card">
                <h3 class="font-bold mb-2">About</h3>
                <p class="text-sm text-gray-600 whitespace-pre-line">{{ tournament()!.description || 'No description provided.' }}</p>
                <div class="grid grid-cols-2 gap-3 mt-4 text-sm">
                  <div><span class="text-gray-400">Teams</span><div class="font-semibold">{{ tournament()!.numberOfTeams }}</div></div>
                  <div><span class="text-gray-400">Status</span><div class="font-semibold">{{ statusLabels[tournament()!.status] }}</div></div>
                </div>

                @if (auth.isAdmin() && tournament()!.status !== 'completed' && !canEndTournament()) {
                  <p class="text-xs text-gray-400 mt-4 pt-4 border-t border-gray-100">
                    You can end this tournament (top bar) once the Final result is entered.
                  </p>
                }
              </div>
            }
            @case ('teams') {
              <app-team-list [tournamentId]="tournament()!.id" [maxTeams]="tournament()!.numberOfTeams" />
            }
            @case ('fixtures') {
              <app-fixtures-list [tournamentId]="tournament()!.id" filter="upcoming" />
            }
            @case ('results') {
              <app-fixtures-list [tournamentId]="tournament()!.id" filter="completed" />
            }
            @case ('groupStage') {
              <app-group-stage [tournamentId]="tournament()!.id" [locked]="tournament()!.status === 'completed'" />
            }
            @case ('finalStage') {
              <app-final-stage
                [tournamentId]="tournament()!.id"
                [tournamentType]="tournament()!.type"
                [locked]="tournament()!.status === 'completed'"
              />
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
  private matchService = inject(MatchService);
  private standingsService = inject(StandingsService);
  private qrService = inject(QrService);
  private dialog = inject(MatDialog);
  auth = inject(AuthService);
  typeLabels = TOURNAMENT_TYPE_LABELS;
  statusLabels = TOURNAMENT_STATUS_LABELS;

  private id = this.route.snapshot.paramMap.get('id')!;
  tournament = toSignal(this.tournamentService.streamOne(this.id));
  matches = toSignal(this.matchService.streamByTournament(this.id), {
    initialValue: [] as Match[],
  });
  isDeleting = signal(false);
  isSavingStatus = signal(false);
  isResetting = signal(false);

  /**
   * Can be ended once the Final is played. Knockout / group+knockout need an actual completed
   * "Final" match; a plain round-robin (no Final) ends when every match is played.
   */
  canEndTournament = computed(() => {
    const t = this.tournament();
    const ms = this.matches();
    if (!t || ms.length === 0) return false;
    const final = ms.find((m) => m.round === 'Final');
    if (final) return final.status === 'completed';
    return t.type === 'round_robin' && ms.every((m) => m.status === 'completed');
  });

  activeTab = signal<TabKey>((this.route.snapshot.queryParamMap.get('tab') as TabKey) ?? 'overview');

  /**
   * `group_knockout` swaps Fixtures/Results for the dedicated Group Stage / Final Stage tabs.
   * Plain `knockout` has no fixtures pipeline of its own either — it's just a bracket from the
   * start, so it reuses the same Final Stage tab/component (relabelled "Bracket") instead of a
   * separate Fixtures/Results pair. `short` is used on mobile so the bar fits without scrolling;
   * `label` is the full desktop name.
   */
  tabs = computed<{ key: TabKey; label: string; short: string }[]>(() => {
    const type = this.tournament()?.type;
    const middle: { key: TabKey; label: string; short: string }[] =
      type === 'group_knockout'
        ? [
            { key: 'groupStage', label: 'Group Stage', short: 'Groups' },
            { key: 'finalStage', label: 'Final Stage', short: 'Final' },
          ]
        : type === 'knockout'
          ? [{ key: 'finalStage', label: 'Bracket', short: 'Bracket' }]
          : [
              { key: 'fixtures', label: 'Fixtures', short: 'Fixtures' },
              { key: 'results', label: 'Results', short: 'Results' },
            ];
    return [
      { key: 'overview', label: 'Overview', short: 'Info' },
      { key: 'teams', label: 'Teams', short: 'Teams' },
      ...middle,
      { key: 'standings', label: 'Standings', short: 'Standings' },
      { key: 'statistics', label: 'Statistics', short: 'Stats' },
    ];
  });

  /** Falls back to Overview if the URL's ?tab= doesn't exist for this tournament type. */
  visibleTab = computed(() =>
    this.tabs().some((t) => t.key === this.activeTab()) ? this.activeTab() : 'overview'
  );

  dateRange = computed(() => {
    const t = this.tournament();
    if (!t) return '';
    const fmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${fmt(t.startDate)} – ${fmt(t.endDate)}`;
  });

  nextTab(): void {
    const order = this.tabs().map((t) => t.key);
    const idx = order.indexOf(this.visibleTab());
    this.activeTab.set(order[Math.min(idx + 1, order.length - 1)]);
  }

  prevTab(): void {
    const order = this.tabs().map((t) => t.key);
    const idx = order.indexOf(this.visibleTab());
    this.activeTab.set(order[Math.max(idx - 1, 0)]);
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

  async endTournament(): Promise<void> {
    const t = this.tournament();
    if (!t || this.isSavingStatus()) return;
    this.isSavingStatus.set(true);
    try {
      await this.tournamentService.endTournament(t.id);
    } finally {
      this.isSavingStatus.set(false);
    }
  }

  async reopenTournament(): Promise<void> {
    const t = this.tournament();
    if (!t || this.isSavingStatus()) return;
    this.isSavingStatus.set(true);
    try {
      await this.tournamentService.reopenTournament(t.id);
    } finally {
      this.isSavingStatus.set(false);
    }
  }

  /**
   * Wipes every match/result (and the standings derived from them) so the admin can regenerate
   * fixtures/groups/bracket and re-enter everything from scratch. Teams themselves are untouched.
   */
  async resetMatches(): Promise<void> {
    const t = this.tournament();
    if (!t || this.isResetting()) return;

    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Reset all matches?',
        message:
          "Every match and result in this tournament will be permanently deleted so you can regenerate fixtures and re-enter results from scratch. Teams aren't affected. This can't be undone.",
        destructive: true,
        confirmLabel: 'Reset',
      },
      width: '90vw',
      maxWidth: '400px',
    });

    const confirmed = await ref.afterClosed().toPromise();
    if (!confirmed) return;

    this.isResetting.set(true);
    try {
      await this.matchService.clearForTournament(t.id);
      await this.standingsService.recalculate(t.id);
    } finally {
      this.isResetting.set(false);
    }
  }

  async deleteTournament(): Promise<void> {
    const t = this.tournament();
    if (!t || this.isDeleting()) return;

    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete tournament?',
        message: `"${t.name}" and all of its teams, fixtures, results and standings will be permanently deleted. This can't be undone.`,
        destructive: true,
        confirmLabel: 'Delete',
      },
      width: '90vw',
      maxWidth: '400px',
    });

    const confirmed = await ref.afterClosed().toPromise();
    if (!confirmed) return;

    this.isDeleting.set(true);
    try {
      await this.tournamentService.remove(t.id);
      await this.router.navigate(['/tournaments']);
    } finally {
      this.isDeleting.set(false);
    }
  }
}

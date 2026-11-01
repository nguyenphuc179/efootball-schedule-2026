import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TournamentService } from '../tournament.service';
import { MatchService } from '../../fixtures/match.service';
import { QrService } from '../../../core/services/qr.service';
import { AuthService } from '../../../core/services/auth.service';
import { ActivityLogService } from '../../../core/services/activity-log.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { TeamListComponent } from '../../teams/team-list/team-list.component';
import { LineupViewComponent } from '../../lineups/lineup-view.component';
import { FixturesListComponent } from '../../fixtures/fixtures-list/fixtures-list.component';
import { GroupStageComponent } from '../group-stage/group-stage.component';
import { FinalStageComponent } from '../final-stage/final-stage.component';
import { StandingsViewComponent } from '../../standings/standings-view/standings-view.component';
import { StandingsService } from '../../standings/standings.service';
import { StatisticsComponent } from '../../statistics/statistics.component';
import { TournamentPermissionsComponent } from '../tournament-permissions/tournament-permissions.component';
import { TeamMatchComponent } from '../team-match/team-match.component';
import { GroupStandingsComponent } from '../team-match/group-standings.component';
import { FootballClubStatsComponent } from '../team-match/football-club-stats.component';
import { HeadToHeadComponent } from '../team-match/head-to-head.component';
import { StandingsExportComponent } from '../team-match/standings-export.component';
import { SwipeDirective } from '../../../shared/directives/swipe.directive';
import { OverflowMenuComponent } from '../../../shared/components/overflow-menu/overflow-menu.component';
import { dateLocale } from '../../../core/services/language.service';
import { TournamentOverviewComponent } from '../tournament-overview/tournament-overview.component';
import { TOURNAMENT_TYPE_LABELS } from '../../../models/tournament.model';
import { Match } from '../../../models/match.model';

type TabKey =
  | 'overview'
  | 'teams'
  | 'lineup'
  | 'fixtures'
  | 'results'
  | 'groupStage'
  | 'finalStage'
  | 'teamMatch'
  | 'standings'
  | 'statistics'
  | 'permissions';

@Component({
  selector: 'app-tournament-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    LoadingSpinnerComponent,
    TeamListComponent,
    LineupViewComponent,
    FixturesListComponent,
    GroupStageComponent,
    FinalStageComponent,
    TeamMatchComponent,
    GroupStandingsComponent,
    FootballClubStatsComponent,
    HeadToHeadComponent,
    StandingsExportComponent,
    StandingsViewComponent,
    StatisticsComponent,
    TournamentPermissionsComponent,
    SwipeDirective,
    OverflowMenuComponent,
    TournamentOverviewComponent,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!tournament()) {
      <app-loading-spinner [label]="'TOURNAMENT_DETAIL.LOADING' | translate" />
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
          <span class="badge bg-primary-50 text-primary-700 min-w-0 truncate">{{ typeLabels[tournament()!.type] | translate }}</span>
          <button
            class="w-8 h-8 flex items-center justify-center text-gray-400 ml-auto shrink-0"
            (click)="share()"
            [attr.aria-label]="(shareCopied() ? 'COMMON.LINK_COPIED' : 'COMMON.SHARE') | translate"
            [title]="(shareCopied() ? 'COMMON.LINK_COPIED' : 'COMMON.SHARE') | translate"
          >
            <span class="material-icons text-[18px]">{{ shareCopied() ? 'check' : 'share' }}</span>
          </button>
          @if (auth.isAdmin()) {
            @if (tournament()!.status !== 'completed' && canEndTournament()) {
              <button
                class="btn-secondary !py-1.5 !px-3 text-xs flex items-center gap-1 !text-accent-red whitespace-nowrap shrink-0"
                [disabled]="isSavingStatus()"
                (click)="endTournament()"
              >
                <span class="material-icons text-[16px]">emoji_events</span> {{ isSavingStatus() ? '…' : ('TOURNAMENT_DETAIL.END' | translate) }}
              </button>
            }
            <a
              [routerLink]="['/tournaments', tournament()!.id, 'edit']"
              class="w-8 h-8 flex items-center justify-center text-gray-400 shrink-0"
              [attr.aria-label]="'COMMON.EDIT' | translate"
              [title]="'COMMON.EDIT' | translate"
            >
              <span class="material-icons text-[18px]">edit</span>
            </a>
            <app-overflow-menu class="shrink-0" [label]="'COMMON.MORE_ACTIONS' | translate">
              @if (tournament()!.status === 'completed') {
                <button type="button" class="overflow-menu-item hover:bg-gray-50" [disabled]="isSavingStatus()" (click)="reopenTournament()">
                  <span class="material-icons text-[18px] text-gray-500">lock_open</span>
                  {{ 'TOURNAMENT_DETAIL.REOPEN_FULL' | translate }}
                </button>
              }
              @if (matches().length > 0) {
                <button type="button" class="overflow-menu-item hover:bg-gray-50" [disabled]="isResetting()" (click)="resetMatches()">
                  <span class="material-icons text-[18px] text-gray-500">{{ isResetting() ? 'hourglass_top' : 'restart_alt' }}</span>
                  {{ 'TOURNAMENT_DETAIL.RESET' | translate }}
                </button>
              }
              <button
                type="button"
                class="overflow-menu-item hover:bg-gray-50 text-accent-red font-semibold"
                [disabled]="isDeleting()"
                (click)="deleteTournament()"
              >
                <span class="material-icons text-[18px]">delete_outline</span>
                {{ 'TOURNAMENT_DETAIL.DELETE_TOURNAMENT' | translate }}
              </button>
            </app-overflow-menu>
          }
        </div>

        @if (shareLinkVisible(); as link) {
          <div class="px-4 py-2 border-b border-gray-100">
            <div class="flex items-center gap-2">
              <input
                #shareLinkInput
                readonly
                class="input-field flex-1 text-xs"
                [value]="link"
                (click)="shareLinkInput.select()"
              />
              <button
                type="button"
                class="w-9 h-9 flex items-center justify-center text-gray-400 shrink-0"
                (click)="shareLinkVisible.set(null)"
                [attr.aria-label]="'COMMON.CLOSE' | translate"
              >
                <span class="material-icons text-[18px]">close</span>
              </button>
            </div>
            <p class="text-[11px] text-gray-400 mt-1">{{ 'COMMON.SHARE_MANUAL_HINT' | translate }}</p>
          </div>
        }

        <!-- Sticky tabs -->
        <div class="sticky-tabs flex overflow-x-auto border-b border-gray-100">
          @for (tab of tabs(); track tab.key) {
            <button
              class="flex-1 sm:flex-none px-2 sm:px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2"
              [class]="visibleTab() === tab.key ? 'border-primary-500 text-primary-700' : 'border-transparent text-gray-500'"
              (click)="activeTab.set(tab.key)"
            >
              <span class="sm:hidden">{{ tab.short | translate }}</span>
              <span class="hidden sm:inline">{{ tab.label | translate }}</span>
            </button>
          }
        </div>

        <!-- Swipeable panel -->
        <div class="swipe-panel p-4" appSwipe (swipeLeft)="nextTab()" (swipeRight)="prevTab()">
          @switch (visibleTab()) {
            @case ('overview') {
              <app-tournament-overview [tournament]="tournament()!" [matches]="matches()" (goToTab)="openTab($event)" />
            }
            @case ('teams') {
              <app-team-list [tournamentId]="tournament()!.id" [maxTeams]="tournament()!.numberOfTeams" [tournamentType]="tournament()!.type" />
            }
            @case ('lineup') {
              <app-lineup-view [tournamentId]="tournament()!.id" />
            }
            @case ('fixtures') {
              <app-fixtures-list [tournamentId]="tournament()!.id" filter="upcoming" [canGenerate]="canGenerateFixtures()" />
            }
            @case ('results') {
              <app-fixtures-list [tournamentId]="tournament()!.id" filter="completed" [canGenerate]="canGenerateFixtures()" />
            }
            @case ('groupStage') {
              <app-group-stage
                [tournamentId]="tournament()!.id"
                [locked]="tournament()!.status === 'completed'"
                [canGenerate]="canGenerateFixtures()"
              />
            }
            @case ('finalStage') {
              <app-final-stage
                [tournamentId]="tournament()!.id"
                [tournamentType]="tournament()!.type"
                [locked]="tournament()!.status === 'completed'"
                [canGenerate]="canGenerateFixtures()"
              />
            }
            @case ('teamMatch') {
              <app-team-match
                [tournamentId]="tournament()!.id"
                [locked]="tournament()!.status === 'completed'"
                [canGenerate]="canGenerateFixtures()"
              />
            }
            @case ('standings') {
              @if (tournament()!.type === 'team_match') {
                <div class="flex flex-col gap-4">
                  <app-standings-export [tournamentId]="tournament()!.id" />
                  <app-group-standings [tournamentId]="tournament()!.id" />
                  <app-standings-view [tournamentId]="tournament()!.id" />
                  <app-standings-view [tournamentId]="tournament()!.id" club="A" />
                  <app-standings-view [tournamentId]="tournament()!.id" club="B" />
                </div>
              } @else {
                <app-standings-view [tournamentId]="tournament()!.id" />
              }
            }
            @case ('statistics') {
              @if (tournament()!.type === 'team_match') {
                <app-head-to-head [tournamentId]="tournament()!.id" />
                <app-football-club-stats [tournamentId]="tournament()!.id" />
              }
              <app-statistics [tournamentId]="tournament()!.id" />
            }
            @case ('permissions') {
              <app-tournament-permissions [tournamentId]="tournament()!.id" />
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
  private activityLog = inject(ActivityLogService);
  private qrService = inject(QrService);
  private dialog = inject(MatDialog);
  private translate = inject(TranslateService);
  auth = inject(AuthService);
  typeLabels = TOURNAMENT_TYPE_LABELS;

  /** True for admin OR the one manager an admin designated (see "Phân quyền" tab) to click every
   *  Generate button themselves — for visible transparency around the fixture/bracket draw. Passed
   *  down to the Fixtures/Results, Group Stage and Final Stage tabs alike; admin can always
   *  generate too, this only ever adds permission. */
  canGenerateFixtures = computed(() => {
    if (this.auth.isAdmin()) return true;
    const uid = this.auth.firebaseUser()?.uid;
    return !!uid && !!this.tournament()?.fixtureGeneratorUid && this.tournament()!.fixtureGeneratorUid === uid;
  });

  private id = this.route.snapshot.paramMap.get('id')!;
  tournament = toSignal(this.tournamentService.streamOne(this.id));
  matches = toSignal(this.matchService.streamByTournament(this.id), {
    initialValue: [] as Match[],
  });
  isDeleting = signal(false);
  isSavingStatus = signal(false);
  isResetting = signal(false);
  shareCopied = signal(false);
  /** Set when neither the Clipboard nor Web Share API worked — shows the link as plain text so
   *  it can be copied manually (both require a secure context, which plain-http LAN testing on
   *  a phone against the dev server doesn't have). */
  shareLinkVisible = signal<string | null>(null);

  /**
   * Can be ended once the Final is played. Knockout / group+knockout need an actual completed
   * "Final" match; round-robin and team_match end when every match is played.
   */
  canEndTournament = computed(() => {
    const t = this.tournament();
    const ms = this.matches();
    if (!t || ms.length === 0) return false;
    const final = ms.find((m) => m.round === 'Final');
    if (final) return final.status === 'completed';
    return (t.type === 'round_robin' || t.type === 'team_match') && ms.every((m) => m.status === 'completed');
  });

  activeTab = signal<TabKey>((this.route.snapshot.queryParamMap.get('tab') as TabKey) ?? 'overview');

  /**
   * `group_knockout` swaps Fixtures/Results for the dedicated Group Stage / Final Stage tabs.
   * Plain `knockout` has no fixtures pipeline of its own either — it's just a bracket from the
   * start, so it reuses the same Final Stage tab/component (relabelled "Bracket") instead of a
   * separate Fixtures/Results pair. `team_match` uses a dedicated TeamMatch tab.
   * `short` is used on mobile so the bar fits without scrolling; `label` is the full desktop name.
   */
  tabs = computed<{ key: TabKey; label: string; short: string }[]>(() => {
    const type = this.tournament()?.type;
    const middle: { key: TabKey; label: string; short: string }[] =
      type === 'group_knockout'
        ? [
            { key: 'groupStage', label: 'TOURNAMENT_DETAIL.TAB_GROUP_STAGE', short: 'TOURNAMENT_DETAIL.TAB_GROUPS_SHORT' },
            { key: 'finalStage', label: 'TOURNAMENT_DETAIL.TAB_FINAL_STAGE', short: 'TOURNAMENT_DETAIL.TAB_FINAL_SHORT' },
          ]
        : type === 'knockout'
          ? [{ key: 'finalStage', label: 'TOURNAMENT_DETAIL.TAB_BRACKET', short: 'TOURNAMENT_DETAIL.TAB_BRACKET' }]
          : type === 'team_match'
            ? [{ key: 'teamMatch', label: 'TOURNAMENT_DETAIL.TAB_TEAM_MATCH', short: 'TOURNAMENT_DETAIL.TAB_TEAM_MATCH' }]
            : [
                { key: 'fixtures', label: 'TOURNAMENT_DETAIL.TAB_FIXTURES', short: 'TOURNAMENT_DETAIL.TAB_FIXTURES' },
                { key: 'results', label: 'TOURNAMENT_DETAIL.TAB_RESULTS', short: 'TOURNAMENT_DETAIL.TAB_RESULTS' },
              ];
    return [
      { key: 'overview', label: 'TOURNAMENT_DETAIL.TAB_OVERVIEW', short: 'TOURNAMENT_DETAIL.TAB_INFO_SHORT' },
      { key: 'teams', label: 'ADMIN_OVERVIEW.TEAMS', short: 'ADMIN_OVERVIEW.TEAMS' },
      { key: 'lineup', label: 'TOURNAMENT_DETAIL.TAB_LINEUP', short: 'TOURNAMENT_DETAIL.TAB_LINEUP' },
      ...middle,
      { key: 'standings', label: 'TOURNAMENT_DETAIL.TAB_STANDINGS', short: 'TOURNAMENT_DETAIL.TAB_STANDINGS' },
      { key: 'statistics', label: 'TOURNAMENT_DETAIL.TAB_STATISTICS', short: 'TOURNAMENT_DETAIL.TAB_STATS_SHORT' },
      ...(this.auth.isAdmin()
        ? [{ key: 'permissions' as const, label: 'TOURNAMENT_DETAIL.TAB_PERMISSIONS', short: 'TOURNAMENT_DETAIL.TAB_PERMISSIONS_SHORT' }]
        : []),
    ];
  });

  /** Falls back to Overview if the URL's ?tab= doesn't exist for this tournament type. */
  visibleTab = computed(() =>
    this.tabs().some((t) => t.key === this.activeTab()) ? this.activeTab() : 'overview'
  );

  dateRange = computed(() => {
    const t = this.tournament();
    if (!t) return '';
    const locale = dateLocale(this.translate.currentLang());
    const fmt = (ms: number) => new Date(ms).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
    return `${fmt(t.startDate)} – ${fmt(t.endDate)}`;
  });

  /** Tab switch requested by a child (e.g. Overview's "See standings"); ignored if this
   *  tournament type has no such tab. */
  openTab(key: string): void {
    if (this.tabs().some((t) => t.key === key)) this.activeTab.set(key as TabKey);
  }

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

  /** Copies the link first (with a visible "Copied!" confirmation) — the reliable path a user
   *  actually wants when sending a tournament to others. Falls back to the native share sheet,
   *  and if NEITHER browser API is usable (both `navigator.clipboard` and `navigator.share`
   *  require a secure context — plain http on a phone testing against the dev server over the
   *  LAN has neither), reveals the link as plain selectable text so it can still be copied by
   *  hand. */
  async share(): Promise<void> {
    const t = this.tournament();
    if (!t) return;
    const url = this.qrService.tournamentShareUrl(t.id);

    try {
      await navigator.clipboard.writeText(url);
      this.shareCopied.set(true);
      setTimeout(() => this.shareCopied.set(false), 2000);
      return;
    } catch {
      /* clipboard unavailable/blocked — try the next option */
    }

    if (navigator.share) {
      try {
        await navigator.share({ title: t.name, url });
        return;
      } catch {
        /* user cancelled, or share unsupported here too — fall through */
      }
    }

    this.shareLinkVisible.set(url);
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
        title: this.translate.instant('TOURNAMENT_DETAIL.RESET_CONFIRM_TITLE'),
        message: this.translate.instant('TOURNAMENT_DETAIL.RESET_CONFIRM_MESSAGE'),
        destructive: true,
        confirmLabel: this.translate.instant('TOURNAMENT_DETAIL.RESET'),
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
      await this.activityLog.log('tournament_reset_matches', `Đã đặt lại toàn bộ trận đấu của giải đấu "${t.name}"`, t.id);
    } finally {
      this.isResetting.set(false);
    }
  }

  async deleteTournament(): Promise<void> {
    const t = this.tournament();
    if (!t || this.isDeleting()) return;

    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: this.translate.instant('TOURNAMENT_DETAIL.DELETE_CONFIRM_TITLE'),
        message: this.translate.instant('TOURNAMENT_DETAIL.DELETE_CONFIRM_MESSAGE', { name: t.name }),
        destructive: true,
        confirmLabel: this.translate.instant('COMMON.DELETE'),
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

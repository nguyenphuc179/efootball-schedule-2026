import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { MatchService } from '../../fixtures/match.service';
import { TeamService } from '../../teams/team.service';
import { FixtureGeneratorService } from '../../fixtures/fixture-generator.service';
import { TournamentService } from '../tournament.service';
import { AuthService } from '../../../core/services/auth.service';
import { Match } from '../../../models/match.model';
import { Team, teamGroup } from '../../../models/team.model';
import { MatchRowComponent } from '../../../shared/components/match-row/match-row.component';
import { TeamAvatarService } from '../../teams/team-avatar.service';
import { TeamAvatar } from '../../../shared/utils/team-avatar.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { compareGroups, computeGroupStats } from './group-stats.util';
import { playerLabel } from '../../../shared/utils/player-label.util';
import { findRuleViolations, violatingMatchCount } from './club-rules.util';
import { resolveTeamMatchRules } from '../../../models/tournament.model';
import { ExportSummary, buildExportRows, downloadBlob, renderPng, shareImage } from './team-match-export.util';
import { AppSelectComponent, AppSelectOption } from '../../../shared/components/app-select/app-select.component';
import { TranslateService } from '@ngx-translate/core';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-team-match',
  standalone: true,
  imports: [CommonModule, MatchRowComponent, EmptyStateComponent, AppSelectComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!hasGroupSetup()) {
      <app-empty-state
        icon="groups"
        [title]="'TEAM_MATCH.NO_SETUP_TITLE' | translate"
        [subtitle]="'TEAM_MATCH.NO_SETUP_SUBTITLE' | translate"
      />
    } @else {
      <div class="max-w-4xl mx-auto">
      <!-- Score card -->
      <div
        class="card mb-4 !p-4 sm:!p-6 overflow-hidden"
        style="background-image: linear-gradient(100deg, rgba(59,130,246,0.20) 0%, rgba(59,130,246,0) 38%, rgba(236,72,153,0) 62%, rgba(236,72,153,0.20) 100%)"
      >
        <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
          <!-- Team A -->
          <div class="flex flex-col items-center gap-2 text-center">
            <span class="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-extrabold tracking-wider text-white shadow" style="background-color: #3b82f6">
              @if (leader() === 'A') { <span class="material-icons text-[14px]">emoji_events</span> }
              {{ 'TEAM_MATCH.GROUP_A' | translate | uppercase }}
            </span>
            <div
              class="text-5xl sm:text-7xl font-black leading-none tabular-nums"
              [style.color]="'#60a5fa'"
              [style.text-shadow]="leader() === 'A' ? '0 0 28px #60a5fa99' : 'none'"
            >{{ groupAStats().points }}</div>
            <div class="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
              <span class="inline-flex items-baseline gap-0.5 rounded-lg px-1.5 py-0.5 sm:px-2 sm:py-0.5 text-[11px] sm:text-sm font-extrabold tabular-nums bg-primary-50 text-primary-700">{{ groupAStats().wins }}<span class="text-[8px] sm:text-[9px] font-bold opacity-80">{{ 'STANDINGS.WON_ABBR' | translate }}</span></span>
              <span class="inline-flex items-baseline gap-0.5 rounded-lg px-1.5 py-0.5 sm:px-2 sm:py-0.5 text-[11px] sm:text-sm font-extrabold tabular-nums bg-gray-100 text-gray-600">{{ groupAStats().draws }}<span class="text-[8px] sm:text-[9px] font-bold opacity-80">{{ 'STANDINGS.DRAWN_ABBR' | translate }}</span></span>
              <span class="inline-flex items-baseline gap-0.5 rounded-lg px-1.5 py-0.5 sm:px-2 sm:py-0.5 text-[11px] sm:text-sm font-extrabold tabular-nums bg-red-50 text-accent-red">{{ groupAStats().losses }}<span class="text-[8px] sm:text-[9px] font-bold opacity-80">{{ 'STANDINGS.LOST_ABBR' | translate }}</span></span>
              <span
                class="inline-flex items-baseline gap-0.5 rounded-lg px-1.5 py-0.5 sm:px-2 sm:py-0.5 text-[11px] sm:text-sm font-extrabold tabular-nums"
                [class]="groupAStats().goalDifference > 0 ? 'bg-primary-500 text-white' : groupAStats().goalDifference < 0 ? 'bg-accent-red text-white' : 'bg-gray-200 text-gray-600'"
              ><span class="text-[8px] sm:text-[9px] font-bold opacity-80">{{ 'STANDINGS.GD_ABBR' | translate }}</span>{{ groupAStats().goalDifference > 0 ? '+' : '' }}{{ groupAStats().goalDifference }}</span>
            </div>
          </div>

          <!-- Centre: progress -->
          <div class="flex flex-col items-center gap-2 px-1">
            <span class="w-11 h-11 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center">
              <span class="material-icons text-[26px]">sports_soccer</span>
            </span>
            <span class="text-sm font-extrabold tabular-nums">{{ completedCount() }}<span class="text-gray-400">/{{ matches().length }}</span></span>
            <div class="w-20 sm:w-28 h-1.5 rounded-full bg-gray-200 overflow-hidden">
              <div class="h-full rounded-full" style="background-image: linear-gradient(90deg, #3b82f6, #ec4899)" [style.width.%]="progressPct()"></div>
            </div>
          </div>

          <!-- Team B -->
          <div class="flex flex-col items-center gap-2 text-center">
            <span class="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-extrabold tracking-wider text-white shadow" style="background-color: #ec4899">
              @if (leader() === 'B') { <span class="material-icons text-[14px]">emoji_events</span> }
              {{ 'TEAM_MATCH.GROUP_B' | translate | uppercase }}
            </span>
            <div
              class="text-5xl sm:text-7xl font-black leading-none tabular-nums"
              [style.color]="'#f472b6'"
              [style.text-shadow]="leader() === 'B' ? '0 0 28px #f472b699' : 'none'"
            >{{ groupBStats().points }}</div>
            <div class="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
              <span class="inline-flex items-baseline gap-0.5 rounded-lg px-1.5 py-0.5 sm:px-2 sm:py-0.5 text-[11px] sm:text-sm font-extrabold tabular-nums bg-primary-50 text-primary-700">{{ groupBStats().wins }}<span class="text-[8px] sm:text-[9px] font-bold opacity-80">{{ 'STANDINGS.WON_ABBR' | translate }}</span></span>
              <span class="inline-flex items-baseline gap-0.5 rounded-lg px-1.5 py-0.5 sm:px-2 sm:py-0.5 text-[11px] sm:text-sm font-extrabold tabular-nums bg-gray-100 text-gray-600">{{ groupBStats().draws }}<span class="text-[8px] sm:text-[9px] font-bold opacity-80">{{ 'STANDINGS.DRAWN_ABBR' | translate }}</span></span>
              <span class="inline-flex items-baseline gap-0.5 rounded-lg px-1.5 py-0.5 sm:px-2 sm:py-0.5 text-[11px] sm:text-sm font-extrabold tabular-nums bg-red-50 text-accent-red">{{ groupBStats().losses }}<span class="text-[8px] sm:text-[9px] font-bold opacity-80">{{ 'STANDINGS.LOST_ABBR' | translate }}</span></span>
              <span
                class="inline-flex items-baseline gap-0.5 rounded-lg px-1.5 py-0.5 sm:px-2 sm:py-0.5 text-[11px] sm:text-sm font-extrabold tabular-nums"
                [class]="groupBStats().goalDifference > 0 ? 'bg-primary-500 text-white' : groupBStats().goalDifference < 0 ? 'bg-accent-red text-white' : 'bg-gray-200 text-gray-600'"
              ><span class="text-[8px] sm:text-[9px] font-bold opacity-80">{{ 'STANDINGS.GD_ABBR' | translate }}</span>{{ groupBStats().goalDifference > 0 ? '+' : '' }}{{ groupBStats().goalDifference }}</span>
            </div>
          </div>
        </div>

        @if (winnerLabel()) {
          <div class="mt-5 flex justify-center">
            <span
              class="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold border"
              [class]="winnerLabel()!.color"
              style="background-color: rgba(245, 166, 35, 0.14); border-color: rgba(245, 166, 35, 0.45)"
            >
              <span class="material-icons text-[18px] text-accent-amber">emoji_events</span>{{ winnerLabel()!.text | translate }}
            </span>
          </div>
        }
      </div>

      <!-- Toolbar: regenerate + download, one row, right-aligned -->
      @if ((canGenerate() && !locked()) || matches().length > 0) {
        <div class="flex flex-col items-end gap-1 mb-4">
          <div class="flex items-center justify-end gap-2">
            @if (canGenerate() && !locked()) {
              <button
                class="btn-primary flex items-center gap-1.5 !py-2 !px-4 text-sm"
                [disabled]="isGenerating()"
                (click)="generate()"
              >
                <span class="material-icons text-[18px]">{{ isGenerating() ? 'hourglass_top' : 'calendar_month' }}</span>
                {{ isGenerating() ? ('TEAM_MATCH.GENERATING' | translate) : (matches().length > 0 ? ('TEAM_MATCH.REGENERATE' | translate) : ('TEAM_MATCH.GENERATE' | translate)) }}
              </button>
            }
            @if (matches().length > 0) {
              <button class="btn-secondary flex items-center gap-1.5 !py-2 !px-4 text-sm" (click)="exportImage()">
                <span class="material-icons text-[18px]">download</span>{{ 'TEAM_MATCH.DOWNLOAD' | translate }}
              </button>
              <button class="btn-secondary flex items-center gap-1.5 !py-2 !px-4 text-sm" (click)="share()">
                <span class="material-icons text-[18px]">share</span>{{ 'TEAM_MATCH.SHARE' | translate }}
              </button>
            }
          </div>
          @if (generateError()) {
            <p class="text-xs text-red-500">{{ generateError() }}</p>
          }
          @if (shareMessage(); as msg) {
            <p class="text-xs text-primary-700 text-right max-w-md">{{ msg }}</p>
          }
        </div>
      }

      @if (matches().length === 0) {
        <app-empty-state icon="calendar_month" [title]="'TEAM_MATCH.NO_MATCHES_TITLE' | translate" [subtitle]="'TEAM_MATCH.NO_MATCHES_SUBTITLE' | translate" />
      } @else {
        <!-- Filters: club, then team (narrowed to the chosen club) -->
        @if (auth.isAdmin() && violationCount() > 0) {
          <div class="rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-xs px-3 py-2 mb-4 flex items-start gap-2">
            <span class="material-icons text-[16px] mt-px">warning</span>
            <span>{{ 'TEAM_MATCH.RULE_VIOLATIONS_BANNER' | translate: { count: violationCount() } }}</span>
          </div>
        }

        <div class="flex flex-wrap items-center gap-2 mb-3">
          @for (opt of statusChips; track opt.value) {
            <button
              type="button"
              class="px-3 py-1 rounded-full text-xs font-bold !min-h-0 h-8"
              [class]="statusFilter() === opt.value ? 'bg-primary-500 text-white' : 'bg-surface-muted text-gray-500'"
              (click)="statusFilter.set(opt.value)"
            >{{ opt.label | translate }}</button>
          }
          @if (myTeamIds().size > 0) {
            <button
              type="button"
              class="px-3 py-1 rounded-full text-xs font-bold !min-h-0 h-8 flex items-center gap-1"
              [class]="mineOnly() ? 'bg-accent-amber text-white' : 'bg-surface-muted text-gray-500'"
              (click)="mineOnly.set(!mineOnly())"
            ><span class="material-icons text-[14px]">person</span>{{ 'TEAM_MATCH.MINE' | translate }}</button>
          }
          <span class="ml-auto flex items-center gap-1">
            <button type="button" class="px-2 text-xs font-semibold text-gray-500 !min-h-0 h-8" (click)="expandAll()">{{ 'TEAM_MATCH.EXPAND_ALL' | translate }}</button>
            <span class="text-gray-300">|</span>
            <button type="button" class="px-2 text-xs font-semibold text-gray-500 !min-h-0 h-8" (click)="collapseAll()">{{ 'TEAM_MATCH.COLLAPSE_ALL' | translate }}</button>
          </span>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <div class="flex flex-col gap-1">
            <span class="text-xs font-medium text-gray-500">{{ 'TEAM_MATCH.FILTER_GROUP' | translate }}</span>
            <app-select [value]="groupFilter()" [options]="groupFilterOptions()" (valueChange)="setGroupFilter($event)" />
          </div>
          <div class="flex flex-col gap-1">
            <span class="text-xs font-medium text-gray-500">{{ 'TEAM_MATCH.FILTER_TEAM' | translate }}</span>
            <app-select [value]="teamFilter()" [options]="teamFilterOptions()" (valueChange)="teamFilter.set($event)" />
          </div>
          <div class="flex flex-col gap-1 col-span-2 sm:col-span-1">
            <span class="text-xs font-medium text-gray-500">{{ 'TEAM_MATCH.FILTER_CLUB' | translate }}</span>
            <app-select [value]="clubFilter()" [options]="clubFilterOptions()" (valueChange)="clubFilter.set($event)" />
          </div>
        </div>

        <!-- Matches grouped by the focused player (Club A by default) -->
        @for (group of matchGroups(); track group.player.id) {
          @let color = teamGroup(group.player) === 'B' ? '#ec4899' : '#3b82f6';
          @let open = !isCollapsed(group.player.id);
          <div class="mb-5">
            <button
              type="button"
              class="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 mb-2 text-left bg-gray-50 border-l-4"
              [style.border-left-color]="color"
              [attr.aria-expanded]="open"
              (click)="toggleGroup(group.player.id)"
            >
              <span class="material-icons text-gray-400 transition-transform" [class.-rotate-90]="!open">expand_more</span>
              @if (avatarsRecord()[group.player.id]; as av) {
                @if (av.src) {
                  <img [src]="av.src" alt="" class="w-8 h-8 rounded-full object-cover shrink-0" referrerpolicy="no-referrer" />
                } @else {
                  <span class="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" [style.background-color]="av.bg" [style.color]="av.fg">{{ av.initials }}</span>
                }
              }
              <span class="rounded-full px-2.5 py-0.5 text-[10px] font-extrabold tracking-wider text-white shrink-0" [style.background-color]="color">
                {{ (teamGroup(group.player) === 'B' ? 'TEAM_MATCH.GROUP_B' : 'TEAM_MATCH.GROUP_A') | translate | uppercase }}
              </span>
              <span class="min-w-0 flex-1 truncate font-bold text-sm">{{ group.player.teamName }}@if (group.player.manager) {<span class="font-medium text-gray-400">&nbsp;({{ group.player.manager }})</span>}</span>
            </button>
            @if (open) {
            <div class="flex flex-col gap-2">
              @for (match of group.matches; track match.id) {
                <app-match-row
                  [match]="match"
                  [showResultLink]="canEnterResult(match)"
                  [showRound]="false"
                  [avatars]="avatarsRecord()"
                  [managers]="managersRecord()"
                />
              }
            </div>
            }
          </div>
        }
      }
      </div>
    }
  `,
})
export class TeamMatchComponent {
  readonly teamGroup = teamGroup;
  readonly tournamentId = input.required<string>();
  readonly locked = input(false);
  readonly canGenerate = input(false);

  private matchService = inject(MatchService);
  private teamService = inject(TeamService);
  private fixtureGenerator = inject(FixtureGeneratorService);
  private tournamentService = inject(TournamentService);
  private teamAvatars = inject(TeamAvatarService);
  auth = inject(AuthService);

  private translate = inject(TranslateService);
  private dialog = inject(MatDialog);

  groupFilter = signal<string>('');
  teamFilter = signal<string>('');
  statusFilter = signal<'' | 'todo' | 'done'>('');
  mineOnly = signal(false);
  readonly statusChips: { value: '' | 'todo' | 'done'; label: string }[] = [
    { value: '', label: 'TEAM_MATCH.STATUS_ALL' },
    { value: 'todo', label: 'TEAM_MATCH.STATUS_TODO' },
    { value: 'done', label: 'TEAM_MATCH.STATUS_DONE' },
  ];

  /** Players whose result the signed-in user manages in this tournament (for the "Mine" chip). */
  myTeamIds = computed(() => {
    const uid = this.auth.firebaseUser()?.uid;
    return new Set(uid ? this.teams().filter((t) => t.managerUid === uid).map((t) => t.id) : []);
  });

  private collapsed = signal<Set<string>>(new Set());
  isCollapsed(id: string): boolean {
    return this.collapsed().has(id);
  }
  toggleGroup(id: string): void {
    this.collapsed.update((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }
  expandAll(): void {
    this.collapsed.set(new Set());
  }
  collapseAll(): void {
    this.collapsed.set(new Set(this.matchGroups().map((g) => g.player.id)));
  }
  /** Football club (Real Madrid, …) — keeps only matches either side played with it. */
  clubFilter = signal<string>('');

  private tournamentDoc = toSignal(
    toObservable(this.tournamentId).pipe(switchMap((id) => this.tournamentService.streamOne(id))),
    { initialValue: undefined }
  );

  isGenerating = signal(false);
  generateError = signal<string | null>(null);

  teams = toSignal(
    toObservable(this.tournamentId).pipe(switchMap((id) => this.teamService.streamByTournament(id))),
    { initialValue: [] as Team[] }
  );

  matches = toSignal(
    toObservable(this.tournamentId).pipe(switchMap((id) => this.matchService.streamByTournament(id))),
    { initialValue: [] as Match[] }
  );

  groupATeams = computed(() => this.teams().filter((t) => teamGroup(t) === 'A'));
  groupBTeams = computed(() => this.teams().filter((t) => teamGroup(t) === 'B'));
  groupAIds = computed(() => new Set(this.groupATeams().map((t) => t.id)));
  groupBIds = computed(() => new Set(this.groupBTeams().map((t) => t.id)));

  hasGroupSetup = computed(() => this.groupATeams().length > 0 && this.groupBTeams().length > 0);

  avatarsRecord = computed(() => {
    const rec: Record<string, TeamAvatar> = {};
    for (const team of this.teams()) {
      rec[team.id] = this.teamAvatars.resolve(team);
    }
    return rec;
  });

  private groupStats = computed(() => computeGroupStats(this.matches(), this.groupAIds(), this.groupBIds()));

  groupAStats = computed(() => this.groupStats().A);
  groupBStats = computed(() => this.groupStats().B);

  /** Which team is ahead (null while level / nothing played yet) — drives the crown + glow. */
  leader = computed(() => (this.completedCount() === 0 ? null : compareGroups(this.groupAStats(), this.groupBStats()).leader));

  progressPct = computed(() => (this.matches().length ? (this.completedCount() / this.matches().length) * 100 : 0));

  completedCount = computed(() => this.matches().filter((m) => m.status === 'completed').length);

  /** Verdict line: points, then goal difference, then goals scored; a draw only if all are level. */
  winnerLabel = computed((): { text: string; color: string } | null => {
    const played = this.completedCount();
    if (played === 0) return null;
    const done = played === this.matches().length;
    const { leader, decidedBy } = compareGroups(this.groupAStats(), this.groupBStats());
    if (!leader) return { text: done ? 'TEAM_MATCH.DRAW' : 'TEAM_MATCH.TIED', color: 'text-gray-500' };
    if (!done) return { text: `TEAM_MATCH.LEADING_${leader}`, color: 'text-primary-700' };
    const suffix = decidedBy === 'goalDifference' ? '_GD' : decidedBy === 'goalsFor' ? '_GF' : '';
    return { text: `TEAM_MATCH.WINNER_${leader}${suffix}`, color: 'text-primary-700' };
  });

  managersRecord = computed(() =>
    Object.fromEntries(this.teams().filter((t) => t.manager).map((t) => [t.id, t.manager]))
  );

  groupFilterOptions(): AppSelectOption[] {
    this.translate.currentLang();
    return [
      { value: '', label: this.translate.instant('TEAM_MATCH.ALL') },
      { value: 'A', label: this.translate.instant('TEAM_MATCH.GROUP_A') },
      { value: 'B', label: this.translate.instant('TEAM_MATCH.GROUP_B') },
    ];
  }

  /** Teams of the chosen club (everyone when no club is chosen). */
  teamFilterOptions = computed((): AppSelectOption[] => {
    this.translate.currentLang();
    const club = this.groupFilter();
    const pool = club === 'A' ? this.groupATeams() : club === 'B' ? this.groupBTeams() : [...this.groupATeams(), ...this.groupBTeams()];
    return [
      { value: '', label: this.translate.instant('TEAM_MATCH.ALL') },
      ...pool.map((t) => ({ value: t.id, label: playerLabel(t.teamName, t.manager) })),
    ];
  });

  setGroupFilter(club: string): void {
    this.groupFilter.set(club);
    // A team from the other club no longer applies.
    const team = this.teams().find((t) => t.id === this.teamFilter());
    if (club && team && teamGroup(team) !== club) this.teamFilter.set('');
  }

  /** Football clubs seen in matches or assigned to players — what the club filter offers. */
  clubFilterOptions = computed((): AppSelectOption[] => {
    this.translate.currentLang();
    const names = new Set<string>();
    for (const t of this.teams()) for (const c of t.allowedClubs ?? []) names.add(c);
    for (const m of this.matches()) {
      if (m.homeClub) names.add(m.homeClub);
      if (m.awayClub) names.add(m.awayClub);
    }
    return [
      { value: '', label: this.translate.instant('TEAM_MATCH.ALL') },
      ...[...names].sort((a, b) => a.localeCompare(b)).map((c) => ({ value: c, label: c })),
    ];
  });

  /** Saved matches that break the tournament's current club rules (admin heads-up). */
  violationCount = computed(() => {
    const rules = resolveTeamMatchRules(this.tournamentDoc());
    return violatingMatchCount(findRuleViolations(this.matches(), this.teams(), rules));
  });

  /** One block per player of the focused group (Group A unless B is filtered), listing their matches. */
  matchGroups = computed(() => {
    const club = this.clubFilter();
    const status = this.statusFilter();
    const mine = this.mineOnly() ? this.myTeamIds() : null;
    const ms = this.matches().filter(
      (m) =>
        (!club || m.homeClub === club || m.awayClub === club) &&
        (!status || (status === 'done' ? m.status === 'completed' : m.status !== 'completed')) &&
        (!mine || mine.has(m.homeTeamId) || mine.has(m.awayTeamId))
    );
    const filtered = !!club || !!status || !!mine;
    const teamId = this.teamFilter();
    const picked = this.teams().find((t) => t.id === teamId);
    const focusB = picked ? teamGroup(picked) === 'B' : this.groupFilter() === 'B';
    const players = (focusB ? this.groupBTeams() : this.groupATeams()).filter((t) => !teamId || t.id === teamId);
    return players
      .map((team) => ({
        player: team,
        matches: ms.filter((m) => (focusB ? m.awayTeamId : m.homeTeamId) === team.id),
      }))
      .filter((g) => !filtered || g.matches.length > 0);
  });

  canEnterResult(match: Match): boolean {
    if (this.locked()) return false;
    const uid = this.auth.firebaseUser()?.uid;
    if (!uid) return false;
    if (this.auth.isAdmin()) return true;
    return this.teams().some(
      (t) => (t.id === match.homeTeamId || t.id === match.awayTeamId) && t.managerUid === uid
    );
  }

  /** The same score card that sits at the top of this tab, for the downloaded / shared image. */
  private exportSummary(): ExportSummary {
    const record = (s: { wins: number; draws: number; losses: number; goalDifference: number }) =>
      s.wins + this.translate.instant('STANDINGS.WON_ABBR') + ' ' +
      s.draws + this.translate.instant('STANDINGS.DRAWN_ABBR') + ' ' +
      s.losses + this.translate.instant('STANDINGS.LOST_ABBR') + ' · ' +
      this.translate.instant('STANDINGS.GD_ABBR') + ' ' + (s.goalDifference > 0 ? '+' : '') + s.goalDifference;
    const a = this.groupAStats();
    const b = this.groupBStats();
    const verdict = this.winnerLabel();
    return {
      leftLabel: this.translate.instant('TEAM_MATCH.GROUP_A').toUpperCase(),
      leftPoints: a.points,
      leftRecord: record(a),
      rightLabel: this.translate.instant('TEAM_MATCH.GROUP_B').toUpperCase(),
      rightPoints: b.points,
      rightRecord: record(b),
      progress: this.completedCount() + '/' + this.matches().length,
      verdict: verdict ? this.translate.instant(verdict.text) : null,
    };
  }

  private exportTitle(): string {
    return this.tournamentDoc()?.name ?? 'Team battle';
  }

  shareMessage = signal<string | null>(null);
  private shareTimer?: ReturnType<typeof setTimeout>;

  private flashShare(key: string): void {
    this.shareMessage.set(this.translate.instant(key));
    clearTimeout(this.shareTimer);
    this.shareTimer = setTimeout(() => this.shareMessage.set(null), 9000);
  }

  /** "Share" the results image — see `shareImage`. */
  async share(): Promise<void> {
    const title = this.exportTitle();
    const png = renderPng(title, buildExportRows(this.matches(), this.teams()), this.exportSummary()).then((b) => {
      if (!b) throw new Error('no image');
      return b;
    });
    const result = await shareImage(png, title, this.tournamentDoc()?.facebookGroupUrl);
    const key = { copied: 'TEAM_MATCH.SHARE_COPIED', 'copied-no-group': 'TEAM_MATCH.SHARE_NO_GROUP', failed: 'TEAM_MATCH.SHARE_FAILED' }[result as string];
    if (key) this.flashShare(key);
  }

  async exportImage(): Promise<void> {
    const png = await renderPng(this.exportTitle(), buildExportRows(this.matches(), this.teams()), this.exportSummary());
    if (png) downloadBlob(png, this.exportTitle() + '.png');
  }

  /** Regenerating wipes every match (and the results / clubs saved on them) — always ask first. */
  private async confirmRegenerate(): Promise<boolean> {
    const total = this.matches().length;
    const done = this.completedCount();
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: this.translate.instant('TEAM_MATCH.REGENERATE_CONFIRM_TITLE'),
        message: this.translate.instant('TEAM_MATCH.REGENERATE_CONFIRM_MESSAGE', { total, done }),
        destructive: true,
        confirmLabel: this.translate.instant('TEAM_MATCH.REGENERATE'),
      },
      width: '90vw',
      maxWidth: '420px',
    });
    return !!(await firstValueFrom(ref.afterClosed()));
  }

  async generate(): Promise<void> {
    if (this.isGenerating()) return;
    if (this.matches().length > 0 && !(await this.confirmRegenerate())) return;
    this.generateError.set(null);
    this.isGenerating.set(true);
    try {
      const tournament = await this.tournamentService.getOnce(this.tournamentId());
      await this.fixtureGenerator.generateAndSave(
        this.tournamentId(),
        'team_match',
        this.teams(),
        tournament?.startDate ?? Date.now(),
        tournament?.location ?? ''
      );
    } catch (err: unknown) {
      this.generateError.set(err instanceof Error ? err.message : 'Không thể tạo lịch — thử lại sau.');
    } finally {
      this.isGenerating.set(false);
    }
  }
}

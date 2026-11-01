import { ActivatedRoute, Router } from "@angular/router";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";

import { CommonModule } from "@angular/common";
import { AuthService } from "../../../core/services/auth.service";
import { EmptyStateComponent } from "../../../shared/components/empty-state/empty-state.component";
import { LoadingSpinnerComponent } from "../../../shared/components/loading-spinner/loading-spinner.component";
import { Match } from "../../../models/match.model";
import { MatchService } from "../../fixtures/match.service";
import { ResultService } from "../result.service";
import { Team, teamGroup } from "../../../models/team.model";
import { ClubBlockReason, clubBlockReasons } from "../../tournament/team-match/club-rules.util";
import { TeamAvatarService } from "../../teams/team-avatar.service";
import { TeamService } from "../../teams/team.service";
import { TournamentService } from "../../tournament/tournament.service";
import { DEFAULT_TEAM_MATCH_RULES, TeamMatchRules, TournamentType, resolveTeamMatchRules } from "../../../models/tournament.model";
import { toSignal } from "@angular/core/rxjs-interop";
import { TranslatePipe, TranslateService } from "@ngx-translate/core";
import { AppSelectComponent, AppSelectOption } from "../../../shared/components/app-select/app-select.component";
import { roundLabel } from "../../../shared/utils/round-label.util";

/**
 * One-handed result entry: large +/- steppers (no keyboard), thumb-reachable Save button.
 * Matches the spec's mockup exactly: Team A [ score ] VS [ score ] Team B, then Save Result.
 */
@Component({
  selector: "app-result-entry",
  standalone: true,
  imports: [CommonModule, EmptyStateComponent, LoadingSpinnerComponent, AppSelectComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh flex flex-col bg-white">
      <div class="flex items-center h-14 px-4 border-b border-gray-100">
        <button class="w-9 h-9 flex items-center justify-center" (click)="goBack()">
          <span class="material-icons">arrow_back</span>
        </button>
        <h1 class="font-bold ml-1">{{ 'RESULT_ENTRY.TITLE' | translate }}</h1>
      </div>

      @if (accessDenied()) {
        <app-empty-state
          icon="block"
          [title]="'RESULT_ENTRY.ACCESS_DENIED_TITLE' | translate"
          [subtitle]="'RESULT_ENTRY.ACCESS_DENIED_SUBTITLE' | translate"
        />
      } @else if (!match()) {
        <app-loading-spinner [label]="'RESULT_ENTRY.LOADING' | translate" />
      } @else {
        <div class="flex-1 px-3 sm:px-4 py-6 sm:py-10 flex flex-col items-center gap-6">
          @if (roundText()) {
            <div class="text-[11px] sm:text-xs font-bold uppercase tracking-[0.25em] text-gray-400">{{ roundText() }}</div>
          }

          <div class="w-full max-w-3xl grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-6">
          <!-- Home -->
          <div
            class="card !p-3 sm:!p-6 flex flex-col items-center gap-2.5 sm:gap-3 min-w-0"
            [style.background-image]="panelBg('home')"
          >
            @if (isTeamMatch() && teamGroup(homeTeam())) {
              <span class="rounded-full px-3 py-0.5 text-[11px] font-extrabold tracking-wider text-white" [style.background-color]="sideColor('home')">
                {{ (teamGroup(homeTeam()) === 'A' ? 'TEAM_MATCH.GROUP_A' : 'TEAM_MATCH.GROUP_B') | translate | uppercase }}
              </span>
            }
            <div
              class="w-16 h-16 sm:w-24 sm:h-24 rounded-full flex items-center justify-center overflow-hidden text-xl font-bold"
              [style.background-color]="homeAvatar().bg"
              [style.color]="homeAvatar().fg"
              [style.box-shadow]="'0 0 0 4px ' + sideColor('home')"
            >
              @if (homeAvatar().src; as src) {
                <img [src]="src" class="w-full h-full object-cover" referrerpolicy="no-referrer" />
              } @else {
                {{ homeAvatar().initials }}
              }
            </div>
            <div class="text-center leading-tight">
              <div class="font-extrabold text-base sm:text-xl">{{ match()!.homeTeamName ?? homeTeam()?.teamName }}</div>
              @if (homeTeam()?.manager; as mgr) {
                <div class="text-xs sm:text-sm text-gray-400 mt-0.5">{{ mgr }}</div>
              }
            </div>

            @if (isTeamMatch()) {
              <div class="w-full min-h-[4.5rem] flex flex-col items-center justify-start">
                @if ((homeTeam()?.allowedClubs?.length ?? 0) > 0) {
                  <app-select class="w-full" centered [value]="homeClub()" [options]="clubOptions('home')" (valueChange)="homeClub.set($event)" [ariaLabel]="'RESULT_ENTRY.PLAYED_CLUB' | translate" />
                  @if (showClubError('home')) {
                    <div class="text-[11px] text-red-500 text-center mt-1">{{ 'RESULT_ENTRY.CLUB_REQUIRED' | translate }}</div>
                  }
                } @else {
                  <div class="text-[11px] text-gray-400 text-center">{{ 'RESULT_ENTRY.NO_ALLOWED_CLUBS' | translate }}</div>
                }
              </div>
            }

            <div class="flex flex-col items-center gap-1.5 mt-1">
              <button
                class="w-12 h-12 sm:w-14 sm:h-14 rounded-full text-white flex items-center justify-center shadow active:scale-95"
                [style.background-color]="sideColor('home')"
                (click)="inc('home')"
              >
                <span class="material-icons text-[26px]">add</span>
              </button>
              <div class="text-6xl sm:text-8xl font-black w-24 text-center tabular-nums leading-none py-1" [style.color]="scoreColor('home')">
                {{ homeScore() }}
              </div>
              <button
                class="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 flex items-center justify-center active:scale-95"
                [style.border-color]="sideColor('home')"
                [style.color]="sideColor('home')"
                [style.background-color]="sideColor('home') + '1a'"
                (click)="dec('home')"
              >
                <span class="material-icons text-[26px]">remove</span>
              </button>
            </div>
          </div>

          <div class="flex flex-col items-center gap-2">
            <span class="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-surface-muted text-gray-400 flex items-center justify-center text-sm sm:text-base font-black tracking-wider">VS</span>
          </div>

          <!-- Away -->
          <div
            class="card !p-3 sm:!p-6 flex flex-col items-center gap-2.5 sm:gap-3 min-w-0"
            [style.background-image]="panelBg('away')"
          >
            @if (isTeamMatch() && teamGroup(awayTeam())) {
              <span class="rounded-full px-3 py-0.5 text-[11px] font-extrabold tracking-wider text-white" [style.background-color]="sideColor('away')">
                {{ (teamGroup(awayTeam()) === 'A' ? 'TEAM_MATCH.GROUP_A' : 'TEAM_MATCH.GROUP_B') | translate | uppercase }}
              </span>
            }
            <div
              class="w-16 h-16 sm:w-24 sm:h-24 rounded-full flex items-center justify-center overflow-hidden text-xl font-bold"
              [style.background-color]="awayAvatar().bg"
              [style.color]="awayAvatar().fg"
              [style.box-shadow]="'0 0 0 4px ' + sideColor('away')"
            >
              @if (awayAvatar().src; as src) {
                <img [src]="src" class="w-full h-full object-cover" referrerpolicy="no-referrer" />
              } @else {
                {{ awayAvatar().initials }}
              }
            </div>
            <div class="text-center leading-tight">
              <div class="font-extrabold text-base sm:text-xl">{{ match()!.awayTeamName ?? awayTeam()?.teamName }}</div>
              @if (awayTeam()?.manager; as mgr) {
                <div class="text-xs sm:text-sm text-gray-400 mt-0.5">{{ mgr }}</div>
              }
            </div>

            @if (isTeamMatch()) {
              <div class="w-full min-h-[4.5rem] flex flex-col items-center justify-start">
                @if ((awayTeam()?.allowedClubs?.length ?? 0) > 0) {
                  <app-select class="w-full" centered [value]="awayClub()" [options]="clubOptions('away')" (valueChange)="awayClub.set($event)" [ariaLabel]="'RESULT_ENTRY.PLAYED_CLUB' | translate" />
                  @if (showClubError('away')) {
                    <div class="text-[11px] text-red-500 text-center mt-1">{{ 'RESULT_ENTRY.CLUB_REQUIRED' | translate }}</div>
                  }
                } @else {
                  <div class="text-[11px] text-gray-400 text-center">{{ 'RESULT_ENTRY.NO_ALLOWED_CLUBS' | translate }}</div>
                }
              </div>
            }

            <div class="flex flex-col items-center gap-1.5 mt-1">
              <button
                class="w-12 h-12 sm:w-14 sm:h-14 rounded-full text-white flex items-center justify-center shadow active:scale-95"
                [style.background-color]="sideColor('away')"
                (click)="inc('away')"
              >
                <span class="material-icons text-[26px]">add</span>
              </button>
              <div class="text-6xl sm:text-8xl font-black w-24 text-center tabular-nums leading-none py-1" [style.color]="scoreColor('away')">
                {{ awayScore() }}
              </div>
              <button
                class="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 flex items-center justify-center active:scale-95"
                [style.border-color]="sideColor('away')"
                [style.color]="sideColor('away')"
                [style.background-color]="sideColor('away') + '1a'"
                (click)="dec('away')"
              >
                <span class="material-icons text-[26px]">remove</span>
              </button>
            </div>
          </div>
          </div>

          @if (showPenalties()) {
            <div class="card !p-4 flex flex-col items-center gap-3 w-full max-w-sm">
              <div class="text-xs font-bold uppercase tracking-wide text-gray-400">{{ 'RESULT_ENTRY.PENALTY_SHOOTOUT' | translate }}</div>
              <div class="flex items-center justify-center gap-8 w-full">
              <div class="flex flex-col items-center gap-1.5">
                <button class="w-9 h-9 rounded-full bg-surface-muted flex items-center justify-center active:bg-gray-200" (click)="incPen('home')">
                  <span class="material-icons text-[18px]">expand_less</span>
                </button>
                <div class="text-3xl font-extrabold w-12 text-center tabular-nums">{{ penHome() }}</div>
                <button class="w-9 h-9 rounded-full bg-surface-muted flex items-center justify-center active:bg-gray-200" (click)="decPen('home')">
                  <span class="material-icons text-[18px]">expand_more</span>
                </button>
              </div>
                <div class="text-sm font-bold text-gray-300">{{ 'RESULT_ENTRY.PEN' | translate }}</div>
              <div class="flex flex-col items-center gap-1.5">
                <button class="w-9 h-9 rounded-full bg-surface-muted flex items-center justify-center active:bg-gray-200" (click)="incPen('away')">
                  <span class="material-icons text-[18px]">expand_less</span>
                </button>
                <div class="text-3xl font-extrabold w-12 text-center tabular-nums">{{ penAway() }}</div>
                <button class="w-9 h-9 rounded-full bg-surface-muted flex items-center justify-center active:bg-gray-200" (click)="decPen('away')">
                  <span class="material-icons text-[18px]">expand_more</span>
                </button>
              </div>
              </div>
            </div>
          }
        </div>

        <div class="sticky bottom-0 p-4 border-t border-gray-100 bg-white/95 backdrop-blur">
          <button
            class="btn-primary w-full max-w-3xl mx-auto block"
            [disabled]="isSaving() || (showPenalties() && penHome() === penAway())"
            (click)="save()"
          >
            {{ (isSaving() ? 'COMMON.SAVING' : 'RESULT_ENTRY.SAVE_RESULT') | translate }}
          </button>
        </div>
      }
    </div>
  `,
})
export class ResultEntryComponent {
  readonly teamGroup = teamGroup;

  /** Panel / ring colour: Team A blue, Team B pink in a team battle; otherwise green (home) vs blue (away). */
  sideColor(side: "home" | "away"): string {
    const group = this.isTeamMatch() ? teamGroup(side === "home" ? this.homeTeam() : this.awayTeam()) : null;
    if (group === "A") return "#3b82f6";
    if (group === "B") return "#ec4899";
    return side === "home" ? "#0fa863" : "#3b82f6";
  }

  panelBg(side: "home" | "away"): string {
    return "linear-gradient(180deg, " + this.sideColor(side) + "26 0%, transparent 55%)";
  }

  /** The leading side's score takes its colour; level or trailing stays neutral. */
  scoreColor(side: "home" | "away"): string | null {
    const mine = side === "home" ? this.homeScore() : this.awayScore();
    const other = side === "home" ? this.awayScore() : this.homeScore();
    return mine > other ? this.sideColor(side) : null;
  }

  private route = inject(ActivatedRoute);
  router = inject(Router);
  private matchService = inject(MatchService);
  private teamService = inject(TeamService);
  private teamAvatars = inject(TeamAvatarService);
  private tournamentService = inject(TournamentService);
  private resultService = inject(ResultService);
  private auth = inject(AuthService);
  private translate = inject(TranslateService);

  private matchId = this.route.snapshot.paramMap.get("id")!;
  match = signal<Match | undefined>(undefined);

  /** Team-match fixtures store the home team's name in `round` — that's no round label, so skip it. */
  roundText(): string {
    this.translate.currentLang();
    const m = this.match();
    if (!m || m.round === m.homeTeamName || m.round === m.awayTeamName) return '';
    return roundLabel(m.round, this.translate);
  }
  /** True once `load()` has resolved the match's two teams and found the signed-in user is
   *  neither an admin nor the manager of either one — the route itself only requires being
   *  signed in (see app.routes.ts), so this is what actually keeps the edit form away from
   *  someone who has no business touching this match. The real enforcement is
   *  firestore.rules' `matches` update rule; this is just the UI reflecting it early. */
  accessDenied = signal(false);
  homeTeam = signal<Team | undefined>(undefined);
  awayTeam = signal<Team | undefined>(undefined);
  homeAvatar = computed(() => this.teamAvatars.resolve(this.homeTeam()));
  awayAvatar = computed(() => this.teamAvatars.resolve(this.awayTeam()));
  private tournamentType = signal<TournamentType | undefined>(undefined);
  /** Every match of the tournament — used to hide clubs a player already used in another match. */
  private tournamentMatches = signal<Match[]>([]);
  private allTeams = signal<Team[]>([]);
  private rules = signal<TeamMatchRules>(DEFAULT_TEAM_MATCH_RULES);

  homeScore = signal(0);
  awayScore = signal(0);
  penHome = signal(0);
  penAway = signal(0);
  homeClub = signal('');
  awayClub = signal('');
  isSaving = signal(false);
  submitted = signal(false);

  isTeamMatch = computed(() => this.tournamentType() === "team_match");

  /** Only the clubs the admin assigned to that player; rule-blocked ones are greyed out with the reason. */
  clubOptions(side: "home" | "away"): AppSelectOption[] {
    this.translate.currentLang();
    const team = side === "home" ? this.homeTeam() : this.awayTeam();
    const current = side === "home" ? this.homeClub() : this.awayClub();
    const blocked = this.blockedClubs(side);
    const clubs = [...(team?.allowedClubs ?? [])];
    // A club saved earlier that admin has since removed from the list stays selectable as-is.
    if (current && !clubs.includes(current)) clubs.unshift(current);
    const noteKey: Record<ClubBlockReason, string> = {
      self: "RESULT_ENTRY.CLUB_TAKEN_SELF",
      opponent: "RESULT_ENTRY.CLUB_TAKEN_OPPONENT",
      teammate: "RESULT_ENTRY.CLUB_TAKEN_TEAMMATE",
    };
    return [
      { value: "", label: this.translate.instant("RESULT_ENTRY.NO_CLUB_SELECTED") },
      ...clubs.map((c) => {
        const reason = blocked.get(c);
        return reason && c !== current
          ? { value: c, label: c, disabled: true, note: this.translate.instant(noteKey[reason]) }
          : { value: c, label: c };
      }),
    ];
  }

  /** team_match: a side whose player has assigned clubs must pick one; sides with none are free. */
  private clubMissing(side: "home" | "away"): boolean {
    if (!this.isTeamMatch()) return false;
    const team = side === "home" ? this.homeTeam() : this.awayTeam();
    const picked = side === "home" ? this.homeClub() : this.awayClub();
    return this.rules().requireClub && (team?.allowedClubs?.length ?? 0) > 0 && !picked;
  }

  showClubError(side: "home" | "away"): boolean {
    return this.submitted() && this.clubMissing(side);
  }

  /** Show the shootout entry: a knockout match (no group) that's currently level. */
  showPenalties = computed(() => {
    const m = this.match();
    const type = this.tournamentType();
    if (!m || m.groupName) return false;
    if (type !== "knockout" && type !== "group_knockout") return false;
    return this.homeScore() === this.awayScore();
  });

  constructor() {
    this.load();
  }

  private async load(): Promise<void> {
    const found = await this.matchService.getById(this.matchId);
    if (!found) return;

    const [teams, tournament] = await Promise.all([
      this.teamService.getByTournamentOnce(found.tournamentId),
      this.tournamentService.getOnce(found.tournamentId),
    ]);
    const homeTeam = teams.find((t) => t.id === found.homeTeamId);
    const awayTeam = teams.find((t) => t.id === found.awayTeamId);

    const uid = this.auth.firebaseUser()?.uid;
    const allowed =
      this.auth.isAdmin() || (!!uid && (homeTeam?.managerUid === uid || awayTeam?.managerUid === uid));
    if (!allowed) {
      this.accessDenied.set(true);
      return;
    }

    this.match.set(found);
    this.homeScore.set(found.homeScore ?? 0);
    this.awayScore.set(found.awayScore ?? 0);
    this.penHome.set(found.penaltyHome ?? 0);
    this.penAway.set(found.penaltyAway ?? 0);
    this.homeClub.set(found.homeClub ?? "");
    this.awayClub.set(found.awayClub ?? "");
    this.homeTeam.set(homeTeam);
    this.awayTeam.set(awayTeam);
    this.tournamentType.set(tournament?.type);
    this.rules.set(resolveTeamMatchRules(tournament));
    this.allTeams.set(teams);
    if (tournament?.type === "team_match") {
      this.tournamentMatches.set(await this.matchService.getByTournamentOnce(found.tournamentId));
    }
  }

  /** Clubs this side may NOT pick in this match, with the reason (see club-rules.util). */
  private blockedClubs(side: "home" | "away"): Map<string, ClubBlockReason> {
    const team = side === "home" ? this.homeTeam() : this.awayTeam();
    return clubBlockReasons({
      matches: this.tournamentMatches(),
      teams: this.allTeams(),
      rules: this.rules(),
      matchId: this.matchId,
      teamId: team?.id ?? "",
      opponentClub: side === "home" ? this.awayClub() : this.homeClub(),
    });
  }

  /** The detail-page tab this match lives under, so we return the user right where they were. */
  private originTab(m: Match): string {
    if (m.groupName) return "groupStage";
    const type = this.tournamentType();
    if (type === "group_knockout" || type === "knockout") return "finalStage";
    if (type === "team_match") return "teamMatch";
    return "results";
  }

  goBack(): void {
    const m = this.match();
    if (m) {
      this.router.navigate(["/tournaments", m.tournamentId], {
        queryParams: { tab: this.originTab(m) },
      });
    } else {
      this.router.navigate(["/tournaments"]);
    }
  }

  inc(side: "home" | "away"): void {
    if (side === "home") this.homeScore.update((v) => v + 1);
    else this.awayScore.update((v) => v + 1);
  }

  dec(side: "home" | "away"): void {
    if (side === "home") this.homeScore.update((v) => Math.max(0, v - 1));
    else this.awayScore.update((v) => Math.max(0, v - 1));
  }

  incPen(side: "home" | "away"): void {
    if (side === "home") this.penHome.update((v) => v + 1);
    else this.penAway.update((v) => v + 1);
  }

  decPen(side: "home" | "away"): void {
    if (side === "home") this.penHome.update((v) => Math.max(0, v - 1));
    else this.penAway.update((v) => Math.max(0, v - 1));
  }

  async save(): Promise<void> {
    const m = this.match();
    if (!m || (this.showPenalties() && this.penHome() === this.penAway()))
      return;
    this.submitted.set(true);
    if (this.clubMissing("home") || this.clubMissing("away")) return;
    this.isSaving.set(true);
    try {
      const penalties = this.showPenalties()
        ? { home: this.penHome(), away: this.penAway() }
        : null;
      await this.resultService.saveResult(
        m,
        this.homeScore(),
        this.awayScore(),
        penalties,
        this.isTeamMatch()
          ? { home: this.homeClub() || null, away: this.awayClub() || null }
          : null,
      );
      this.router.navigate(["/tournaments", m.tournamentId], {
        queryParams: { tab: this.originTab(m) },
      });
    } finally {
      this.isSaving.set(false);
    }
  }
}

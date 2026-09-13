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
import { Team } from "../../../models/team.model";
import { TeamAvatarService } from "../../teams/team-avatar.service";
import { TeamService } from "../../teams/team.service";
import { TournamentService } from "../../tournament/tournament.service";
import { TournamentType } from "../../../models/tournament.model";
import { toSignal } from "@angular/core/rxjs-interop";
import { TranslatePipe } from "@ngx-translate/core";

/**
 * One-handed result entry: large +/- steppers (no keyboard), thumb-reachable Save button.
 * Matches the spec's mockup exactly: Team A [ score ] VS [ score ] Team B, then Save Result.
 */
@Component({
  selector: "app-result-entry",
  standalone: true,
  imports: [CommonModule, EmptyStateComponent, LoadingSpinnerComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh flex flex-col bg-white">
      <div class="flex items-center h-14 px-4 border-b border-gray-100">
        <button
          class="w-9 h-9 flex items-center justify-center"
          (click)="goBack()"
        >
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
        <div
          class="flex-1 flex flex-col items-center justify-center gap-8 px-6 py-8"
        >
          <div class="flex items-center justify-center gap-8 w-full max-w-sm">
            <div class="flex flex-col items-center gap-3 flex-1">
              <div
                class="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden text-xl font-bold"
                [style.background-color]="homeAvatar().bg"
                [style.color]="homeAvatar().fg"
              >
                @if (homeAvatar().src; as src) {
                  <img [src]="src" class="w-full h-full object-cover" referrerpolicy="no-referrer" />
                } @else {
                  {{ homeAvatar().initials }}
                }
              </div>
              <div class="font-semibold text-sm text-center">
                {{ match()!.homeTeamName ?? homeTeam()?.teamName }}
              </div>
              <div class="flex flex-col items-center gap-1">
                <button
                  class="w-11 h-11 rounded-full bg-surface-muted flex items-center justify-center active:bg-gray-200"
                  (click)="inc('home')"
                >
                  <span class="material-icons">expand_less</span>
                </button>
                <div
                  class="text-4xl font-extrabold w-16 text-center tabular-nums"
                >
                  {{ homeScore() }}
                </div>
                <button
                  class="w-11 h-11 rounded-full bg-surface-muted flex items-center justify-center active:bg-gray-200"
                  (click)="dec('home')"
                >
                  <span class="material-icons">expand_more</span>
                </button>
              </div>
            </div>

            <div class="font-bold text-gray-300 text-lg">VS</div>

            <div class="flex flex-col items-center gap-3 flex-1">
              <div
                class="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden text-xl font-bold"
                [style.background-color]="awayAvatar().bg"
                [style.color]="awayAvatar().fg"
              >
                @if (awayAvatar().src; as src) {
                  <img [src]="src" class="w-full h-full object-cover" referrerpolicy="no-referrer" />
                } @else {
                  {{ awayAvatar().initials }}
                }
              </div>
              <div class="font-semibold text-sm text-center">
                {{ match()!.awayTeamName ?? awayTeam()?.teamName }}
              </div>
              <div class="flex flex-col items-center gap-1">
                <button
                  class="w-11 h-11 rounded-full bg-surface-muted flex items-center justify-center active:bg-gray-200"
                  (click)="inc('away')"
                >
                  <span class="material-icons">expand_less</span>
                </button>
                <div
                  class="text-4xl font-extrabold w-16 text-center tabular-nums"
                >
                  {{ awayScore() }}
                </div>
                <button
                  class="w-11 h-11 rounded-full bg-surface-muted flex items-center justify-center active:bg-gray-200"
                  (click)="dec('away')"
                >
                  <span class="material-icons">expand_more</span>
                </button>
              </div>
            </div>
          </div>

          @if (showPenalties()) {
            <div
              class="flex flex-col items-center gap-3 w-full max-w-sm border-t border-gray-100 pt-6"
            >
              <div
                class="text-xs font-bold uppercase tracking-wide text-gray-400"
              >
                {{ 'RESULT_ENTRY.PENALTY_SHOOTOUT' | translate }}
              </div>
              <div class="flex items-center justify-center gap-8 w-full">
                <div class="flex flex-col items-center gap-1 flex-1">
                  <button
                    class="w-9 h-9 rounded-full bg-surface-muted flex items-center justify-center active:bg-gray-200"
                    (click)="incPen('home')"
                  >
                    <span class="material-icons text-[18px]">expand_less</span>
                  </button>
                  <div
                    class="text-2xl font-extrabold w-12 text-center tabular-nums"
                  >
                    {{ penHome() }}
                  </div>
                  <button
                    class="w-9 h-9 rounded-full bg-surface-muted flex items-center justify-center active:bg-gray-200"
                    (click)="decPen('home')"
                  >
                    <span class="material-icons text-[18px]">expand_more</span>
                  </button>
                </div>
                <div class="text-sm font-bold text-gray-300">{{ 'RESULT_ENTRY.PEN' | translate }}</div>
                <div class="flex flex-col items-center gap-1 flex-1">
                  <button
                    class="w-9 h-9 rounded-full bg-surface-muted flex items-center justify-center active:bg-gray-200"
                    (click)="incPen('away')"
                  >
                    <span class="material-icons text-[18px]">expand_less</span>
                  </button>
                  <div
                    class="text-2xl font-extrabold w-12 text-center tabular-nums"
                  >
                    {{ penAway() }}
                  </div>
                  <button
                    class="w-9 h-9 rounded-full bg-surface-muted flex items-center justify-center active:bg-gray-200"
                    (click)="decPen('away')"
                  >
                    <span class="material-icons text-[18px]">expand_more</span>
                  </button>
                </div>
              </div>
            </div>
          }
        </div>

        <div class="p-4 border-t border-gray-100">
          <button
            class="btn-primary w-full"
            [disabled]="
              isSaving() || (showPenalties() && penHome() === penAway())
            "
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
  private route = inject(ActivatedRoute);
  router = inject(Router);
  private matchService = inject(MatchService);
  private teamService = inject(TeamService);
  private teamAvatars = inject(TeamAvatarService);
  private tournamentService = inject(TournamentService);
  private resultService = inject(ResultService);
  private auth = inject(AuthService);

  private matchId = this.route.snapshot.paramMap.get("id")!;
  match = signal<Match | undefined>(undefined);
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

  homeScore = signal(0);
  awayScore = signal(0);
  penHome = signal(0);
  penAway = signal(0);
  isSaving = signal(false);

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
    this.homeTeam.set(homeTeam);
    this.awayTeam.set(awayTeam);
    this.tournamentType.set(tournament?.type);
  }

  /** The detail-page tab this match lives under, so we return the user right where they were. */
  private originTab(m: Match): string {
    if (m.groupName) return "groupStage";
    const type = this.tournamentType();
    if (type === "group_knockout" || type === "knockout") return "finalStage";
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
      );
      this.router.navigate(["/tournaments", m.tournamentId], {
        queryParams: { tab: this.originTab(m) },
      });
    } finally {
      this.isSaving.set(false);
    }
  }
}

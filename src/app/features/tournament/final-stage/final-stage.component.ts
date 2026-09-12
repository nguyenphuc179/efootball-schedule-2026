import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from "@angular/core";
import {
  FinalStageService,
  prettyRound,
  roundSortKey,
} from "../../fixtures/final-stage.service";
import { toObservable, toSignal } from "@angular/core/rxjs-interop";

import { AuthService } from "../../../core/services/auth.service";
import { BreakpointObserver } from "@angular/cdk/layout";
import { CommonModule } from "@angular/common";
import { ConfirmDialogComponent } from "../../../shared/components/confirm-dialog/confirm-dialog.component";
import { EmptyStateComponent } from "../../../shared/components/empty-state/empty-state.component";
import { FinalBracketComponent } from "./final-bracket.component";
import { FinalStageSeedDialogComponent } from "../../fixtures/final-stage-seed-dialog.component";
import { LoadingSpinnerComponent } from "../../../shared/components/loading-spinner/loading-spinner.component";
import { MatDialog } from "@angular/material/dialog";
import { Match } from "../../../models/match.model";
import { MatchRowComponent } from "../../../shared/components/match-row/match-row.component";
import { MatchService } from "../../fixtures/match.service";
import { Team } from "../../../models/team.model";
import { TeamAvatarService } from "../../teams/team-avatar.service";
import { TeamService } from "../../teams/team.service";
import { TournamentType } from "../../../models/tournament.model";
import { switchMap } from "rxjs";
import { TranslatePipe, TranslateService } from "@ngx-translate/core";

const roundBase = (round: string) => round.replace(/ \d+$/, "");

/**
 * "Final Stage" tab — the knockout bracket. Used both for `group_knockout` tournaments (locked
 * until every group match has a result; an admin then picks how many teams advance per group) and,
 * as the sole tab, for plain `knockout` tournaments (no group stage — every entered team goes
 * straight into the bracket once there are at least 2). "Winner/Loser of …" slots fill in
 * automatically as results are entered; the button re-runs that resolution.
 */
@Component({
  selector: "app-final-stage",
  standalone: true,
  imports: [
    CommonModule,
    MatchRowComponent,
    FinalBracketComponent,
    EmptyStateComponent,
    LoadingSpinnerComponent,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4">
      @if (isWorking()) {
        <app-loading-spinner [label]="'FINAL_STAGE.BUILDING' | translate" />
      } @else if (!hasFinalStage()) {
        @if (isPureKnockout()) {
          @if (auth.isAdmin() && !locked()) {
            @if (readyToSeed()) {
              <p class="text-sm text-gray-500">
                {{ 'FINAL_STAGE.TEAMS_ENTERED' | translate: { count: teamCount() } }}
              </p>
              <button
                class="btn-primary self-start flex items-center gap-1 !py-2 !px-4 text-sm"
                [disabled]="isSeeding()"
                (click)="openSeedDialog()"
              >
                <span class="material-icons text-[18px]">account_tree</span>
                {{ (isSeeding() ? 'COMMON.LOADING' : 'FINAL_STAGE.GENERATE_BRACKET') | translate }}
              </button>
            } @else {
              <app-empty-state
                icon="groups"
                [title]="'FINAL_STAGE.NOT_ENOUGH_TEAMS_TITLE' | translate"
                [subtitle]="'FINAL_STAGE.NOT_ENOUGH_TEAMS_SUBTITLE' | translate"
              />
            }
          } @else {
            <app-empty-state
              icon="account_tree"
              [title]="'FINAL_STAGE.NOT_SET_UP_TITLE' | translate"
              [subtitle]="'FINAL_STAGE.NOT_SET_UP_SUBTITLE' | translate"
            />
          }
        } @else if (!groupStageComplete()) {
          <app-empty-state
            icon="lock"
            [title]="'FINAL_STAGE.LOCKED_TITLE' | translate"
            [subtitle]="'FINAL_STAGE.LOCKED_SUBTITLE' | translate: { played: progress().played, total: progress().total }"
          />
        } @else if (auth.isAdmin() && !locked()) {
          <p class="text-sm text-gray-500">
            {{ 'FINAL_STAGE.GROUP_COMPLETE_HINT' | translate }}
          </p>
          <label class="flex items-center gap-2 text-sm">
            <span class="text-gray-600 font-medium"
              >{{ 'FINAL_STAGE.QUALIFIERS_PER_GROUP' | translate }}</span
            >
            <select
              class="input-field !py-1.5 !px-2.5 !w-auto"
              [value]="qualifiers()"
              (change)="qualifiers.set(+$any($event.target).value)"
            >
              @for (n of qualifierOptions(); track n) {
                <option [value]="n">{{ n }}</option>
              }
            </select>
          </label>
          <p class="text-xs text-gray-400">
            {{ 'FINAL_STAGE.KNOCKOUT_SIZE' | translate: { count: qualifiers() * 2, shape: bracketShape() | translate } }}
          </p>
          <button
            class="btn-primary self-start flex items-center gap-1 !py-2 !px-4 text-sm"
            [disabled]="isSeeding()"
            (click)="openSeedDialog()"
          >
            <span class="material-icons text-[18px]">account_tree</span>
            {{ (isSeeding() ? 'COMMON.LOADING' : 'FINAL_STAGE.GENERATE_FINAL_STAGE') | translate }}
          </button>
        } @else {
          <app-empty-state
            icon="account_tree"
            [title]="'FINAL_STAGE.NOT_SET_UP_TITLE' | translate"
            [subtitle]="'FINAL_STAGE.NOT_SET_UP_SUBTITLE' | translate"
          />
        }
      } @else {
        <div class="flex flex-wrap items-center gap-2">
          @if (view() === "list" && filterChips().length > 2) {
            @for (f of filterChips(); track f.value) {
              <button
                class="px-3 sm:px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0"
                [class]="
                  activeFilter() === f.value
                    ? 'bg-primary-500 text-white'
                    : 'bg-white border border-gray-200 text-gray-600'
                "
                (click)="activeFilter.set(f.value)"
              >
                <span class="sm:hidden">{{ f.short }}</span>
                <span class="hidden sm:inline">{{ f.label }}</span>
              </button>
            }
          }

          @if (auth.isAdmin() && !locked()) {
            <button
              class="btn-primary shrink-0 flex items-center gap-1 !py-2 !px-2.5 sm:!px-3 text-sm"
              [disabled]="isSeeding()"
              (click)="onGenerateClick()"
              [attr.aria-label]="'FINAL_STAGE.GENERATE_OR_UPDATE_ARIA' | translate"
            >
              <span class="material-icons text-[18px]">auto_fix_high</span>
              <span class="hidden sm:inline">{{ (isSeeding() ? 'COMMON.LOADING' : 'FINAL_STAGE.GENERATE_OR_UPDATE') | translate }}</span>
            </button>
          }

          <!-- Chart / List toggle, pinned to the right -->
          <div class="flex rounded-lg bg-gray-100 p-1 text-xs font-semibold shrink-0 ml-auto">
            @for (v of ["chart", "list"]; track v) {
              <button
                class="px-2.5 sm:px-3 py-1 rounded-md capitalize flex items-center"
                [class]="
                  view() === v
                    ? 'bg-white shadow-sm text-primary-700'
                    : 'text-gray-500'
                "
                (click)="view.set($any(v))"
                [attr.aria-label]="(v === 'chart' ? 'FINAL_STAGE.CHART' : 'FINAL_STAGE.LIST') | translate"
              >
                <span class="material-icons text-[16px] sm:hidden">{{ v === "chart" ? "account_tree" : "view_list" }}</span>
                <span class="hidden sm:inline">{{ (v === 'chart' ? 'FINAL_STAGE.CHART' : 'FINAL_STAGE.LIST') | translate }}</span>
              </button>
            }
          </div>
        </div>

        @if (view() === "chart") {
          <app-final-bracket
            [matches]="knockout()"
            [managers]="managerByTeam()"
          />
        } @else {
          @for (grp of matchGroups(); track grp.label) {
            <div class="flex flex-col gap-2">
              <h3
                class="text-xs font-extrabold uppercase tracking-wide text-gray-400"
              >
                {{ grp.label }}
              </h3>
              @for (mt of grp.matches; track mt.id) {
                <app-match-row
                  [match]="mt"
                  [managers]="managerByTeam()"
                  [avatars]="avatarsByTeam()"
                  [showRound]="false"
                  [showResultLink]="
                    auth.isAdmin() &&
                    mt.status !== 'completed' &&
                    !!mt.homeTeamId &&
                    !!mt.awayTeamId
                  "
                />
              }
            </div>
          } @empty {
            <p class="text-sm text-gray-400 py-4 text-center">{{ 'FINAL_STAGE.NO_MATCHES' | translate }}</p>
          }
        }
      }

      @if (errorMsg()) {
        <p class="text-sm text-accent-red">{{ errorMsg() }}</p>
      }
    </div>
  `,
})
export class FinalStageComponent {
  readonly tournamentId = input.required<string>();
  /** When the tournament is completed, hide the seed / update-bracket controls. */
  readonly locked = input(false);
  /** Distinguishes a plain knockout (no group stage) from `group_knockout`. */
  readonly tournamentType = input<TournamentType>("group_knockout");

  private matchService = inject(MatchService);
  private teamService = inject(TeamService);
  private teamAvatars = inject(TeamAvatarService);
  private finalStage = inject(FinalStageService);
  private dialog = inject(MatDialog);
  private breakpoints = inject(BreakpointObserver);
  private translate = inject(TranslateService);
  auth = inject(AuthService);

  activeFilter = signal<string>("all");
  view = signal<"chart" | "list">("list");
  qualifiers = signal(2);
  isWorking = signal(false);
  errorMsg = signal<string | null>(null);

  private matches = toSignal(
    toObservable(this.tournamentId).pipe(
      switchMap((id) => this.matchService.streamByTournament(id)),
    ),
    { initialValue: [] as Match[] },
  );

  private teams = toSignal(
    toObservable(this.tournamentId).pipe(
      switchMap((id) => this.teamService.streamByTournament(id)),
    ),
    { initialValue: [] as Team[] },
  );
  managerByTeam = computed(() =>
    Object.fromEntries(
      this.teams()
        .filter((t) => t.manager)
        .map((t) => [t.id, t.manager]),
    ),
  );
  avatarsByTeam = computed(() => this.teamAvatars.byId(this.teams()));

  hasFinalStage = computed(() => this.finalStage.hasFinalStage(this.matches()));
  groupStageComplete = computed(() =>
    this.finalStage.isGroupStageComplete(this.matches()),
  );
  progress = computed(() => this.finalStage.groupStageProgress(this.matches()));

  isPureKnockout = computed(() => this.tournamentType() === "knockout");
  teamCount = computed(() => this.teams().length);
  readyToSeed = computed(() => this.teamCount() >= 2);

  qualifierOptions = computed(() => {
    const max = Math.min(
      this.finalStage.maxQualifiersPerGroup(this.matches()),
      8,
    );
    return Array.from({ length: Math.max(0, max) }, (_, i) => i + 1);
  });

  /** Returns a translation KEY (piped through `| translate` in the template). */
  bracketShape = computed(() => {
    const q = this.qualifiers() * 2;
    if (q <= 2) return "FINAL_STAGE.SHAPE_SINGLE_FINAL";
    if (q <= 4) return "FINAL_STAGE.SHAPE_SEMI_FINAL";
    if (q <= 8) return "FINAL_STAGE.SHAPE_QUARTER_FINAL";
    return "FINAL_STAGE.SHAPE_FULL_BRACKET";
  });

  knockout = computed(() =>
    [...this.matches().filter((m) => !m.groupName)].sort(
      (a, b) => roundSortKey(a.round) - roundSortKey(b.round),
    ),
  );

  /** No knockout match has a result yet — safe to (re)draw the bracket without losing anything. */
  canReseed = computed(() => this.knockout().every((m) => m.status !== "completed"));

  filterChips = computed(() => {
    this.translate.currentLang();
    const bases: string[] = [];
    for (const m of this.knockout()) {
      const base = roundBase(m.round);
      if (!bases.includes(base)) bases.push(base);
    }
    const all = this.translate.instant("FINAL_STAGE.FILTER_ALL");
    return [
      { label: all, short: all, value: "all" },
      ...bases.map((b) => ({ label: prettyRound(b, this.translate), short: this.shortRound(b), value: b })),
    ];
  });

  /** Compact chip label so the round filter fits on one line without scrolling. */
  private shortRound(base: string): string {
    switch (base) {
      case "Quarter Final":
        return this.translate.instant("MATCH.QF_ABBR");
      case "Semi Final":
        return this.translate.instant("MATCH.SF_ABBR");
      case "Third Place":
        return this.translate.instant("MATCH.THIRD_ABBR");
      case "Final":
        return this.translate.instant("MATCH.FINAL");
    }
    const ro = /^Round of (\d+)$/.exec(base);
    return ro ? "R" + ro[1] : base;
  }

  visibleMatches = computed(() => {
    const filter = this.activeFilter();
    return this.knockout().filter(
      (m) => filter === "all" || roundBase(m.round) === filter,
    );
  });

  /** Matches grouped under a single heading per round ("Quarter-final", "Semi-final", "Final"). */
  matchGroups = computed(() => {
    this.translate.currentLang();
    const groups: { label: string; matches: Match[] }[] = [];
    for (const m of this.visibleMatches()) {
      const label = prettyRound(roundBase(m.round), this.translate);
      let g = groups.find((x) => x.label === label);
      if (!g) {
        g = { label, matches: [] };
        groups.push(g);
      }
      g.matches.push(m);
    }
    return groups;
  });

  constructor() {
    // Keep the selected qualifier count within the available options.
    effect(() => {
      const opts = this.qualifierOptions();
      if (opts.length && !opts.includes(this.qualifiers())) {
        this.qualifiers.set(opts.includes(2) ? 2 : opts[opts.length - 1]);
      }
    });
  }

  isSeeding = signal(false);

  /**
   * Loads whoever's actually still seedable — the group-stage qualifiers if there's no bracket
   * yet, otherwise the participants of the next round that isn't fully decided (e.g. the four
   * semi-finalists once every quarter-final is played) — then lets the admin pick random vs.
   * manual order for just that round onward.
   */
  async openSeedDialog(): Promise<void> {
    this.isSeeding.set(true);
    this.errorMsg.set(null);
    try {
      const seeds = await this.finalStage.getReseedCandidates(this.tournamentId(), this.qualifiers());
      if (!seeds.length) {
        this.errorMsg.set(this.translate.instant("FINAL_STAGE_ERROR.NOTHING_TO_RESEED"));
        return;
      }
      const isMobile = this.breakpoints.isMatched("(max-width: 767px)");
      this.dialog.open(FinalStageSeedDialogComponent, {
        data: { tournamentId: this.tournamentId(), qualifiersPerGroup: this.qualifiers(), seeds },
        width: isMobile ? "100vw" : "480px",
        height: isMobile ? "100dvh" : "auto",
        maxHeight: isMobile ? "100dvh" : "85vh",
        maxWidth: "100vw",
        panelClass: isMobile ? "fullscreen-dialog" : undefined,
      });
    } catch (e) {
      this.errorMsg.set(this.errorText(e, "FINAL_STAGE_ERROR.LOAD_QUALIFIED_FAILED"));
    } finally {
      this.isSeeding.set(false);
    }
  }

  /** Translates a thrown `Error`'s message as an i18n key, falling back to `fallbackKey`. */
  private errorText(e: unknown, fallbackKey: string): string {
    const key = e instanceof Error && e.message ? e.message : fallbackKey;
    return this.translate.instant(key);
  }

  /**
   * The "Generate / update bracket" button once the bracket already exists: reopens the seed
   * dialog so the admin can change the matchups any time. If results are already in, confirm
   * first — picking a new order there wipes every Final Stage match/result (group stage is safe).
   */
  async onGenerateClick(): Promise<void> {
    if (this.canReseed()) {
      await this.openSeedDialog();
      return;
    }

    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: this.translate.instant("FINAL_STAGE.RESEED_CONFIRM_TITLE"),
        message: this.translate.instant("FINAL_STAGE.RESEED_CONFIRM_MESSAGE"),
        destructive: true,
        confirmLabel: this.translate.instant("FINAL_STAGE.RESEED"),
      },
      width: "90vw",
      maxWidth: "400px",
    });
    if (await ref.afterClosed().toPromise()) {
      await this.openSeedDialog();
    }
  }

  async generate(): Promise<void> {
    this.isWorking.set(true);
    this.errorMsg.set(null);
    try {
      await this.finalStage.generate(this.tournamentId(), this.qualifiers());
    } catch (e) {
      this.errorMsg.set(this.errorText(e, "FINAL_STAGE_ERROR.GENERATE_FAILED"));
    } finally {
      this.isWorking.set(false);
    }
  }
}

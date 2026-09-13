import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from "@angular/core";
import { toObservable, toSignal } from "@angular/core/rxjs-interop";

import { AuthService } from "../../../core/services/auth.service";
import { CommonModule } from "@angular/common";
import { EmptyStateComponent } from "../../../shared/components/empty-state/empty-state.component";
import { FixtureGeneratorService } from "../../fixtures/fixture-generator.service";
import { LoadingSpinnerComponent } from "../../../shared/components/loading-spinner/loading-spinner.component";
import { Match } from "../../../models/match.model";
import { MatchRowComponent } from "../../../shared/components/match-row/match-row.component";
import { MatchService } from "../../fixtures/match.service";
import { Team } from "../../../models/team.model";
import { TeamAvatarService } from "../../teams/team-avatar.service";
import { TeamService } from "../../teams/team.service";
import { TournamentService } from "../tournament.service";
import { switchMap } from "rxjs";
import { TranslatePipe } from "@ngx-translate/core";

/** "Group A - Round 3" -> 3 (0 if the round number can't be read). */
function roundNumber(m: Match): number {
  return Number(/Round (\d+)/.exec(m.round)?.[1]) || 0;
}

/**
 * "Group Stage" tab for `group_knockout` tournaments — the round-robin phase, browsable either
 * by group (each group with its own round selector, per the reference design) or by round.
 */
@Component({
  selector: "app-group-stage",
  standalone: true,
  imports: [
    CommonModule,
    MatchRowComponent,
    EmptyStateComponent,
    LoadingSpinnerComponent,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4">
      @if (isGenerating()) {
        <app-loading-spinner [label]="'GROUP_STAGE.GENERATING_LABEL' | translate" />
      } @else if (!groupBlocks().length) {
        @if (auth.isAdmin() && !locked()) {
          <button
            class="btn-primary self-start flex items-center gap-1 !py-2 !px-4 text-sm"
            (click)="generateFixtures()"
          >
            <span class="material-icons text-[18px]">auto_fix_high</span> {{ 'GROUP_STAGE.GENERATE' | translate }}
          </button>
        }
        <app-empty-state
          icon="grid_view"
          [title]="'GROUP_STAGE.EMPTY_TITLE' | translate"
          [subtitle]="'FIXTURES_LIST.EMPTY_SUBTITLE' | translate"
        />
      } @else {
        <div class="flex items-center gap-2 flex-wrap">
          <!-- View toggle -->
          <div class="flex rounded-lg bg-gray-100 p-1 text-sm font-semibold shrink-0">
            @for (m of modes; track m) {
              <button
                class="px-3 sm:px-4 py-1.5 rounded-md capitalize"
                [class]="
                  mode() === m
                    ? 'bg-white shadow-sm text-primary-700'
                    : 'text-gray-500'
                "
                (click)="mode.set(m)"
              >
                {{ (m === 'group' ? 'GROUP_STAGE.MODE_GROUP' : 'GROUP_STAGE.MODE_ROUND') | translate }}
              </button>
            }
          </div>

          @if (managerOptions().length) {
            <select
              class="input-field !py-1.5 !px-2.5 !w-auto max-w-[10rem] text-sm shrink-0"
              [value]="managerFilter()"
              (change)="managerFilter.set($any($event.target).value)"
              [attr.aria-label]="'GROUP_STAGE.FILTER_BY_MANAGER' | translate"
            >
              <option value="">{{ 'GROUP_STAGE.ALL_MANAGERS' | translate }}</option>
              @for (mgr of managerOptions(); track mgr) {
                <option [value]="mgr">{{ mgr }}</option>
              }
            </select>
          }

          @if (auth.isAdmin() && !locked()) {
            <button
              class="btn-primary ml-auto shrink-0 flex items-center gap-1 !py-2 !px-3 text-sm"
              (click)="generateFixtures()"
              [attr.aria-label]="'GROUP_STAGE.REGENERATE_ARIA' | translate"
            >
              <span class="material-icons text-[18px]">auto_fix_high</span>
              <span class="hidden sm:inline">{{ 'GROUP_STAGE.REGENERATE' | translate }}</span>
            </button>
          }
        </div>

        @if (mode() === "group") {
          @for (block of visibleGroupBlocks(); track block.name) {
            <div class="flex flex-col gap-2">
              <h3
                class="text-sm font-extrabold uppercase tracking-wide text-gray-700"
              >
                {{ block.name }}
              </h3>
              <div class="flex items-center gap-2 flex-wrap">
                <span
                  class="hidden sm:inline text-xs font-bold uppercase tracking-wide text-gray-400 mr-1"
                  >{{ 'GROUP_STAGE.ROUND_LABEL' | translate }}</span
                >
                <button
                  class="w-9 h-9 min-h-0 shrink-0 rounded-full text-xs font-bold flex items-center justify-center"
                  [class]="
                    selectedRound(block.name) === 0
                      ? 'bg-primary-500 text-white'
                      : 'bg-white border border-gray-200 text-gray-600'
                  "
                  (click)="pickRound(block.name, 0)"
                >
                  {{ 'GROUP_STAGE.ALL_SHORT' | translate }}
                </button>
                @for (r of block.rounds; track r) {
                  <button
                    class="w-9 h-9 min-h-0 shrink-0 rounded-full text-xs font-bold flex items-center justify-center"
                    [class]="
                      selectedRound(block.name) === r
                        ? 'bg-primary-500 text-white'
                        : 'bg-white border border-gray-200 text-gray-600'
                    "
                    (click)="pickRound(block.name, r)"
                  >
                    {{ r }}
                  </button>
                }
              </div>
              <div class="flex flex-col gap-2">
                @for (mt of groupMatches(block.name); track mt.id) {
                  <app-match-row
                    [match]="mt"
                    [managers]="managerByTeam()"
                    [avatars]="avatarsByTeam()"
                    [showResultLink]="canEditResult(mt)"
                  />
                } @empty {
                  <p class="text-sm text-gray-400 py-2">{{ 'GROUP_STAGE.NO_MATCH_FILTER' | translate }}</p>
                }
              </div>
            </div>
          } @empty {
            <p class="text-sm text-gray-400 py-6 text-center">
              {{ 'GROUP_STAGE.NO_MATCH_MANAGER' | translate: { manager: managerFilter() } }}
            </p>
          }
        } @else {
          @for (block of visibleRoundBlocks(); track block.round) {
            <div class="flex flex-col gap-2">
              <h3
                class="text-sm font-extrabold uppercase tracking-wide text-gray-700"
              >
                {{ 'MATCH.ROUND_N' | translate: { n: block.round } }}
              </h3>
              <div class="flex items-center gap-2 flex-wrap">
                <button
                  class="px-3 py-1.5 min-h-0 rounded-full text-xs font-bold"
                  [class]="
                    selectedGroup(block.round) === ''
                      ? 'bg-primary-500 text-white'
                      : 'bg-white border border-gray-200 text-gray-600'
                  "
                  (click)="pickGroup(block.round, '')"
                >
                  {{ 'GROUP_STAGE.ALL_SHORT' | translate }}
                </button>
                @for (g of block.groups; track g) {
                  <button
                    class="px-3 py-1.5 min-h-0 rounded-full text-xs font-bold"
                    [class]="
                      selectedGroup(block.round) === g
                        ? 'bg-primary-500 text-white'
                        : 'bg-white border border-gray-200 text-gray-600'
                    "
                    (click)="pickGroup(block.round, g)"
                  >
                    {{ g }}
                  </button>
                }
              </div>
              <div class="flex flex-col gap-2">
                @for (mt of roundMatches(block.round); track mt.id) {
                  <app-match-row
                    [match]="mt"
                    [managers]="managerByTeam()"
                    [avatars]="avatarsByTeam()"
                    [showResultLink]="canEditResult(mt)"
                  />
                } @empty {
                  <p class="text-sm text-gray-400 py-2">{{ 'GROUP_STAGE.NO_MATCH_FILTER' | translate }}</p>
                }
              </div>
            </div>
          } @empty {
            <p class="text-sm text-gray-400 py-6 text-center">
              {{ 'GROUP_STAGE.NO_MATCH_MANAGER' | translate: { manager: managerFilter() } }}
            </p>
          }
        }
      }
    </div>
  `,
})
export class GroupStageComponent {
  readonly tournamentId = input.required<string>();
  /** When the tournament is completed, hide the (re)generate control. */
  readonly locked = input(false);

  private matchService = inject(MatchService);
  private fixtureGenerator = inject(FixtureGeneratorService);
  private teamService = inject(TeamService);
  private teamAvatars = inject(TeamAvatarService);
  private tournamentService = inject(TournamentService);
  auth = inject(AuthService);

  readonly modes = ["group", "round"] as const;
  mode = signal<"group" | "round">("group");
  isGenerating = signal(false);

  /** '' = show every manager. Otherwise only matches involving that manager's team(s). */
  managerFilter = signal<string>("");

  /** Per-group selected round (0 = all). */
  private roundByGroup = signal<Record<string, number>>({});
  /** Per-round selected group ('' = all). */
  private groupByRound = signal<Record<number, string>>({});

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

  /** Team ids the signed-in user manages, within this tournament — admins can edit every result
   *  regardless (see `canEditResult`), so this is only consulted for non-admins. */
  private myTeamIds = computed(() => {
    const uid = this.auth.firebaseUser()?.uid;
    return new Set(uid ? this.teams().filter((t) => t.managerUid === uid).map((t) => t.id) : []);
  });

  /** Admin can edit any result; a team manager can edit results only for matches their own team
   *  played in (either side) — enforced for real by firestore.rules (`matches` update rule), this
   *  just decides whether the "/matches/:id/result" link shows up at all. */
  canEditResult(match: Match): boolean {
    return this.auth.isAdmin() || this.myTeamIds().has(match.homeTeamId) || this.myTeamIds().has(match.awayTeamId);
  }

  managerByTeam = computed(() =>
    Object.fromEntries(
      this.teams()
        .filter((t) => t.manager)
        .map((t) => [t.id, t.manager]),
    ),
  );
  avatarsByTeam = computed(() => this.teamAvatars.byId(this.teams()));

  managerOptions = computed(() =>
    [...new Set(this.teams().map((t) => t.manager?.trim()).filter((n): n is string => !!n))].sort((a, b) =>
      a.localeCompare(b),
    ),
  );

  /** True when a match involves the currently-filtered manager (or no filter is set). */
  private matchHasManager(m: Match): boolean {
    const mgr = this.managerFilter();
    if (!mgr) return true;
    const map = this.managerByTeam();
    return map[m.homeTeamId] === mgr || map[m.awayTeamId] === mgr;
  }

  private stageMatches = computed(() =>
    this.matches().filter((m) => m.groupName),
  );

  groupBlocks = computed(() => {
    const byGroup = new Map<string, Match[]>();
    for (const m of this.stageMatches()) {
      const bucket = byGroup.get(m.groupName!) ?? [];
      bucket.push(m);
      byGroup.set(m.groupName!, bucket);
    }
    return [...byGroup.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, ms]) => ({
        name,
        matches: ms,
        rounds: [...new Set(ms.map(roundNumber))]
          .filter((n) => n > 0)
          .sort((a, b) => a - b),
      }));
  });

  roundBlocks = computed(() => {
    const byRound = new Map<number, Match[]>();
    for (const m of this.stageMatches()) {
      const bucket = byRound.get(roundNumber(m)) ?? [];
      bucket.push(m);
      byRound.set(roundNumber(m), bucket);
    }
    return [...byRound.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([round, ms]) => ({
        round,
        matches: ms,
        groups: [...new Set(ms.map((m) => m.groupName!))].sort(),
      }));
  });

  /** Blocks that still have at least one match after the manager filter — used for rendering. */
  visibleGroupBlocks = computed(() =>
    this.groupBlocks().filter((b) => b.matches.some((m) => this.matchHasManager(m))),
  );
  visibleRoundBlocks = computed(() =>
    this.roundBlocks().filter((b) => b.matches.some((m) => this.matchHasManager(m))),
  );

  selectedRound(group: string): number {
    return this.roundByGroup()[group] ?? 0;
  }

  selectedGroup(round: number): string {
    return this.groupByRound()[round] ?? "";
  }

  pickRound(group: string, round: number): void {
    this.roundByGroup.update((m) => ({ ...m, [group]: round }));
  }

  pickGroup(round: number, group: string): void {
    this.groupByRound.update((m) => ({ ...m, [round]: group }));
  }

  groupMatches(group: string): Match[] {
    const block = this.groupBlocks().find((b) => b.name === group);
    if (!block) return [];
    const round = this.selectedRound(group);
    const list = block.matches
      .filter((m) => (round === 0 || roundNumber(m) === round) && this.matchHasManager(m));
    return [...list].sort(
      (a, b) => roundNumber(a) - roundNumber(b) || a.matchDate - b.matchDate,
    );
  }

  roundMatches(round: number): Match[] {
    const block = this.roundBlocks().find((b) => b.round === round);
    if (!block) return [];
    const group = this.selectedGroup(round);
    const list = block.matches
      .filter((m) => (group === "" || m.groupName === group) && this.matchHasManager(m));
    return [...list].sort(
      (a, b) =>
        (a.groupName ?? "").localeCompare(b.groupName ?? "") ||
        a.matchDate - b.matchDate,
    );
  }

  async generateFixtures(): Promise<void> {
    const id = this.tournamentId();
    this.isGenerating.set(true);
    try {
      const [tournament, teams] = await Promise.all([
        this.tournamentService.getOnce(id),
        this.teamService.getByTournamentOnce(id),
      ]);
      if (!tournament || tournament.type !== 'group_knockout') return;
      await this.fixtureGenerator.generateAndSave(
        id,
        tournament.type,
        teams,
        tournament.startDate,
        tournament.location,
      );
    } finally {
      this.isGenerating.set(false);
    }
  }
}

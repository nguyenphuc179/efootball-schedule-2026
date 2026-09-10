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
import { TeamService } from "../../teams/team.service";
import { TournamentService } from "../tournament.service";
import { switchMap } from "rxjs";

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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4">
      @if (auth.isAdmin() && !locked()) {
        <button
          class="btn-primary self-start flex items-center gap-1 !py-2 !px-4 text-sm"
          [disabled]="isGenerating()"
          (click)="generateFixtures()"
        >
          <span class="material-icons text-[18px]">auto_fix_high</span>
          {{
            isGenerating()
              ? "Generating…"
              : groupBlocks().length
                ? "Regenerate Group Stage"
                : "Generate Group Stage"
          }}
        </button>
      }

      @if (isGenerating()) {
        <app-loading-spinner label="Generating fixtures…" />
      } @else if (!groupBlocks().length) {
        <app-empty-state
          icon="grid_view"
          title="No group stage yet"
          subtitle="Fixtures will appear here once generated."
        />
      } @else {
        <!-- View toggle -->
        <div
          class="flex rounded-lg bg-gray-100 p-1 self-start text-sm font-semibold"
        >
          @for (m of modes; track m) {
            <button
              class="px-4 py-1.5 rounded-md capitalize"
              [class]="
                mode() === m
                  ? 'bg-white shadow-sm text-primary-700'
                  : 'text-gray-500'
              "
              (click)="mode.set(m)"
            >
              {{ m }}
            </button>
          }
        </div>

        @if (mode() === "group") {
          @for (block of groupBlocks(); track block.name) {
            <div class="flex flex-col gap-2">
              <h3
                class="text-sm font-extrabold uppercase tracking-wide text-gray-700"
              >
                {{ block.name }}
              </h3>
              <div class="flex items-center gap-2 flex-wrap">
                <span
                  class="text-xs font-bold uppercase tracking-wide text-gray-400 mr-1"
                  >Round</span
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
                  ALL
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
                    [showResultLink]="
                      auth.isAdmin() && mt.status !== 'completed'
                    "
                  />
                }
              </div>
            </div>
          }
        } @else {
          @for (block of roundBlocks(); track block.round) {
            <div class="flex flex-col gap-2">
              <h3
                class="text-sm font-extrabold uppercase tracking-wide text-gray-700"
              >
                Round {{ block.round }}
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
                  ALL
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
                    [showResultLink]="
                      auth.isAdmin() && mt.status !== 'completed'
                    "
                  />
                }
              </div>
            </div>
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
  private tournamentService = inject(TournamentService);
  auth = inject(AuthService);

  readonly modes = ["group", "round"] as const;
  mode = signal<"group" | "round">("group");
  isGenerating = signal(false);

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
  managerByTeam = computed(() =>
    Object.fromEntries(
      this.teams()
        .filter((t) => t.manager)
        .map((t) => [t.id, t.manager]),
    ),
  );

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
    const list =
      round === 0
        ? block.matches
        : block.matches.filter((m) => roundNumber(m) === round);
    return [...list].sort(
      (a, b) => roundNumber(a) - roundNumber(b) || a.matchDate - b.matchDate,
    );
  }

  roundMatches(round: number): Match[] {
    const block = this.roundBlocks().find((b) => b.round === round);
    if (!block) return [];
    const group = this.selectedGroup(round);
    const list =
      group === ""
        ? block.matches
        : block.matches.filter((m) => m.groupName === group);
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
      if (!tournament) return;
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

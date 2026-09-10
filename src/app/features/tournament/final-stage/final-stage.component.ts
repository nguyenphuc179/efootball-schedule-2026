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
import { CommonModule } from "@angular/common";
import { EmptyStateComponent } from "../../../shared/components/empty-state/empty-state.component";
import { FinalBracketComponent } from "./final-bracket.component";
import { LoadingSpinnerComponent } from "../../../shared/components/loading-spinner/loading-spinner.component";
import { Match } from "../../../models/match.model";
import { MatchRowComponent } from "../../../shared/components/match-row/match-row.component";
import { MatchService } from "../../fixtures/match.service";
import { Team } from "../../../models/team.model";
import { TeamAvatarService } from "../../teams/team-avatar.service";
import { TeamService } from "../../teams/team.service";
import { switchMap } from "rxjs";

const roundBase = (round: string) => round.replace(/ \d+$/, "");

/**
 * "Final Stage" tab for `group_knockout` tournaments — the knockout bracket.
 *
 * Locked until every group match has a result; an admin then picks how many teams advance per
 * group and generates the bracket (see FinalStageService). "Winner/Loser of …" slots fill in
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4">
      @if (isWorking()) {
        <app-loading-spinner label="Building the bracket…" />
      } @else if (!hasFinalStage()) {
        @if (!groupStageComplete()) {
          <app-empty-state
            icon="lock"
            title="Final stage locked"
            [subtitle]="
              'Enter every group-stage result first — ' +
              progress().played +
              ' / ' +
              progress().total +
              ' played.'
            "
          />
        } @else if (auth.isAdmin() && !locked()) {
          <p class="text-sm text-gray-500">
            The group stage is complete. Choose how many teams advance from each
            group, then seed the bracket.
          </p>
          <label class="flex items-center gap-2 text-sm">
            <span class="text-gray-600 font-medium"
              >Teams advancing per group</span
            >
            <select
              class="input-field !py-1.5 !w-auto"
              [value]="qualifiers()"
              (change)="qualifiers.set(+$any($event.target).value)"
            >
              @for (n of qualifierOptions(); track n) {
                <option [value]="n">{{ n }}</option>
              }
            </select>
          </label>
          <p class="text-xs text-gray-400">
            {{ qualifiers() * 2 }} teams in the knockout — {{ bracketShape() }}.
          </p>
          <button
            class="btn-primary self-start flex items-center gap-1 !py-2 !px-4 text-sm"
            (click)="generate()"
          >
            <span class="material-icons text-[18px]">account_tree</span>
            Generate Final Stage
          </button>
        } @else {
          <app-empty-state
            icon="account_tree"
            title="Final stage not set up yet"
            subtitle="Check back once the organiser seeds the bracket."
          />
        }
      } @else {
        @if (auth.isAdmin() && !locked()) {
          <div class="flex flex-col gap-1">
            <button
              class="btn-primary self-start flex items-center gap-1 !py-2 !px-4 text-sm"
              (click)="generate()"
            >
              <span class="material-icons text-[18px]">account_tree</span>
              Generate / update bracket
            </button>
          </div>
        }

        <div class="flex items-center justify-between gap-2">
          <div class="flex gap-2 overflow-x-auto">
            @if (view() === "list") {
              @for (f of filterChips(); track f.value) {
                <button
                  class="px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
                  [class]="
                    activeFilter() === f.value
                      ? 'bg-primary-500 text-white'
                      : 'bg-white border border-gray-200 text-gray-600'
                  "
                  (click)="activeFilter.set(f.value)"
                >
                  {{ f.label }}
                </button>
              }
            }
          </div>
          <div
            class="flex rounded-lg bg-gray-100 p-1 text-xs font-semibold shrink-0"
          >
            @for (v of ["chart", "list"]; track v) {
              <button
                class="px-3 py-1 rounded-md capitalize"
                [class]="
                  view() === v
                    ? 'bg-white shadow-sm text-primary-700'
                    : 'text-gray-500'
                "
                (click)="view.set($any(v))"
              >
                {{ v }}
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
          @for (mt of visibleMatches(); track mt.id) {
            <div class="flex flex-col gap-2">
              <h3
                class="text-sm font-extrabold uppercase tracking-wide text-gray-700"
              >
                {{ pretty(mt.round) }}
              </h3>
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
            </div>
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

  private matchService = inject(MatchService);
  private teamService = inject(TeamService);
  private teamAvatars = inject(TeamAvatarService);
  private finalStage = inject(FinalStageService);
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

  qualifierOptions = computed(() => {
    const max = Math.min(
      this.finalStage.maxQualifiersPerGroup(this.matches()),
      8,
    );
    return Array.from({ length: Math.max(0, max) }, (_, i) => i + 1);
  });

  bracketShape = computed(() => {
    const q = this.qualifiers() * 2;
    if (q <= 2) return "a single final";
    if (q <= 4) return "semi-finals + final";
    if (q <= 8) return "quarter-finals onward";
    return "a full knockout bracket";
  });

  knockout = computed(() =>
    [...this.matches().filter((m) => !m.groupName)].sort(
      (a, b) => roundSortKey(a.round) - roundSortKey(b.round),
    ),
  );

  filterChips = computed(() => {
    const bases: string[] = [];
    for (const m of this.knockout()) {
      const base = roundBase(m.round);
      if (!bases.includes(base)) bases.push(base);
    }
    return [
      { label: "All", value: "all" },
      ...bases.map((b) => ({ label: prettyRound(b), value: b })),
    ];
  });

  visibleMatches = computed(() => {
    const filter = this.activeFilter();
    return this.knockout().filter(
      (m) => filter === "all" || roundBase(m.round) === filter,
    );
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

  pretty(round: string): string {
    return prettyRound(round);
  }

  async generate(): Promise<void> {
    this.isWorking.set(true);
    this.errorMsg.set(null);
    try {
      await this.finalStage.generate(this.tournamentId(), this.qualifiers());
    } catch (e) {
      this.errorMsg.set(
        e instanceof Error ? e.message : "Could not generate the final stage.",
      );
    } finally {
      this.isWorking.set(false);
    }
  }
}

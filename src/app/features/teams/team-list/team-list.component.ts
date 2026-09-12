import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { BreakpointObserver } from '@angular/cdk/layout';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TeamService } from '../team.service';
import { TeamAvatarService } from '../team-avatar.service';
import { StandingsService } from '../../standings/standings.service';
import { AuthService } from '../../../core/services/auth.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { TeamFormComponent } from '../team-form/team-form.component';
import { Team } from '../../../models/team.model';

@Component({
  selector: 'app-team-list',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3">
      @if (auth.isAdmin()) {
        @if (canAddTeam()) {
          <button class="btn-primary self-start flex items-center gap-1 !py-2 !px-4 text-sm" (click)="openForm()">
            <span class="material-icons text-[18px]">add</span> {{ 'TEAM_LIST.ADD_TEAM' | translate }}
          </button>
        } @else {
          <p class="text-xs text-gray-400">{{ 'TEAM_LIST.SLOTS_FILLED' | translate: { max: maxTeams() } }}</p>
        }
      }

      @if (teams().length === 0) {
        <app-empty-state icon="groups" [title]="'TEAM_LIST.EMPTY_TITLE' | translate" [subtitle]="'TEAM_LIST.EMPTY_SUBTITLE' | translate" />
      } @else {
        <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          @for (team of teams(); track team.id) {
            <div class="card !p-2.5 flex items-center gap-3">
              <span
                class="w-10 h-10 rounded-full overflow-hidden shrink-0 flex items-center justify-center"
                [style.background-color]="avatar(team).bg"
              >
                @if (photo(team); as src) {
                  <img
                    [src]="src"
                    [alt]="team.manager || team.teamName"
                    class="w-full h-full object-cover"
                    width="40"
                    height="40"
                    referrerpolicy="no-referrer"
                    (error)="markFailed(team.id)"
                  />
                } @else {
                  <span class="text-xs font-bold" [style.color]="avatar(team).fg">{{ avatar(team).initials }}</span>
                }
              </span>

              <div class="flex-1 min-w-0">
                <div class="font-semibold text-sm truncate">{{ team.teamName }}</div>
                <div class="text-xs text-gray-400 truncate">
                  {{ team.manager || ('TEAM_LIST.NO_MANAGER' | translate) }} · {{ playersLabel(team.playersCount) }}
                </div>
              </div>

              @if (auth.isAdmin()) {
                <button
                  class="w-8 h-8 flex items-center justify-center text-gray-400 shrink-0"
                  (click)="openForm(team)"
                  [attr.aria-label]="'TEAM_LIST.EDIT_TEAM' | translate"
                >
                  <span class="material-icons text-[18px]">edit</span>
                </button>
                <button
                  class="w-8 h-8 flex items-center justify-center text-accent-red shrink-0"
                  (click)="deleteTeam(team)"
                  [attr.aria-label]="'TEAM_LIST.REMOVE_TEAM' | translate"
                >
                  <span class="material-icons text-[18px]">delete_outline</span>
                </button>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class TeamListComponent {
  readonly tournamentId = input.required<string>();
  /** Tournament's team cap; 0 = no cap. Hides "Add Team" once the roster is full. */
  readonly maxTeams = input<number>(0);

  private teamService = inject(TeamService);
  private teamAvatars = inject(TeamAvatarService);
  private standingsService = inject(StandingsService);
  private dialog = inject(MatDialog);
  private breakpoints = inject(BreakpointObserver);
  private translate = inject(TranslateService);
  auth = inject(AuthService);

  teams = toSignal(
    toObservable(this.tournamentId).pipe(switchMap((id) => this.teamService.streamByTournament(id))),
    { initialValue: [] as Team[] }
  );

  canAddTeam = computed(() => {
    const cap = this.maxTeams();
    return cap <= 0 || this.teams().length < cap;
  });

  failed = signal<Set<string>>(new Set());

  markFailed(teamId: string): void {
    this.failed.update((s) => new Set(s).add(teamId));
  }

  /** Picture + initials for a team — logo → manager's login photo → manager portrait → initials. */
  avatar(team: Team) {
    return this.teamAvatars.resolve(team);
  }

  photo(team: Team): string | null {
    return this.failed().has(team.id) ? null : this.avatar(team).src;
  }

  playersLabel(count: number): string {
    this.translate.currentLang();
    return this.translate.instant(count === 1 ? 'TEAM_LIST.PLAYER_ONE' : 'TEAM_LIST.PLAYER_OTHER', { count });
  }

  openForm(team?: Team): void {
    const isMobile = this.breakpoints.isMatched('(max-width: 767px)');
    this.dialog.open(TeamFormComponent, {
      data: { tournamentId: this.tournamentId(), team, nextIndex: this.nextTeamIndex() },
      width: isMobile ? '100vw' : '480px',
      height: isMobile ? '100dvh' : 'auto',
      maxWidth: '100vw',
      panelClass: isMobile ? 'fullscreen-dialog' : undefined,
    });
  }

  /** Next "Team N" number: highest trailing number among existing names, else the count, + 1. */
  private nextTeamIndex(): number {
    const teams = this.teams();
    const numbered = teams
      .map((t) => Number(/(\d+)\s*$/.exec(t.teamName)?.[1]))
      .filter((n) => Number.isInteger(n) && n > 0);
    return (numbered.length ? Math.max(...numbered) : teams.length) + 1;
  }

  async deleteTeam(team: Team): Promise<void> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: this.translate.instant('TEAM_LIST.REMOVE_CONFIRM_TITLE'),
        message: this.translate.instant('TEAM_LIST.REMOVE_CONFIRM_MESSAGE', { name: team.teamName }),
        destructive: true,
        confirmLabel: this.translate.instant('COMMON.REMOVE'),
      },
      width: '90vw',
      maxWidth: '400px',
    });
    const confirmed = await ref.afterClosed().toPromise();
    if (confirmed) {
      await this.teamService.remove(team.id);
      // Reconcile the standings table so the removed team doesn't linger as a "ghost" row.
      await this.standingsService.recalculate(this.tournamentId()).catch((err) => console.error('[Teams] recalc after delete', err));
    }
  }
}

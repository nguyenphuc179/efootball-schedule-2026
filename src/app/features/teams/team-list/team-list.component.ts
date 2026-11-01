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
import { BulkClubsDialogComponent } from '../bulk-clubs-dialog/bulk-clubs-dialog.component';
import { RosterExportComponent } from '../roster-export/roster-export.component';
import { Team, teamGroup } from '../../../models/team.model';

@Component({
  selector: 'app-team-list',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent, RosterExportComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3">
      @if (tournamentType() === 'team_match' && teams().length > 0) {
        <app-roster-export class="self-end" [tournamentId]="tournamentId()" />
      }

      @if (auth.isAdmin()) {
        @if (canAddTeam()) {
          <button class="btn-primary self-start flex items-center gap-1 !py-2 !px-4 text-sm" (click)="openForm()">
            <span class="material-icons text-[18px]">add</span> {{ 'TEAM_LIST.ADD_TEAM' | translate }}
          </button>
        } @else {
          <p class="text-xs text-gray-400">{{ 'TEAM_LIST.SLOTS_FILLED' | translate: { max: maxTeams() } }}</p>
        }
      }

      @if (auth.isAdmin() && tournamentType() === 'team_match' && teams().length > 0) {
        <button class="btn-secondary self-start flex items-center gap-1 !py-2 !px-4 text-sm" (click)="openBulkClubs()">
          <span class="material-icons text-[18px]">playlist_add</span> {{ 'TEAM_LIST.BULK_CLUBS' | translate }}
        </button>
      }

      @if (auth.isAdmin() && tournamentType() === 'team_match' && missingClubTeams().length > 0) {
        <div class="rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-xs px-3 py-2 flex items-start gap-2">
          <span class="material-icons text-[16px] mt-px">warning</span>
          <span>{{ 'TEAM_LIST.MISSING_CLUBS_BANNER' | translate: { count: missingClubTeams().length } }}</span>
        </div>
      }

      @if (teams().length === 0) {
        <app-empty-state icon="groups" [title]="'TEAM_LIST.EMPTY_TITLE' | translate" [subtitle]="'TEAM_LIST.EMPTY_SUBTITLE' | translate" />
      } @else {
        @for (section of sections(); track section.key) {
        @if (section.key !== 'all') {
          <div class="flex items-center gap-2 mt-2">
            <span class="inline-flex items-center rounded-full px-3 py-1 text-sm font-extrabold text-white" [style.background-color]="sectionColor(section.key)">
              {{ sectionLabel(section.key) | translate }}
            </span>
            <span class="text-xs text-gray-400">{{ section.teams.length }}</span>
          </div>
        }
        <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          @for (team of section.teams; track team.id) {
            <div
              class="card !p-2.5 flex items-center gap-3"
              [class.border-l-4]="tournamentType() === 'team_match'"
              [style.border-left-color]="tournamentType() === 'team_match' ? sectionColor(teamGroup(team) ?? 'none') : null"
            >
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
                <div class="font-semibold text-sm truncate flex items-center gap-2">
                  {{ team.teamName }}
                  @if (tournamentType() === 'team_match' && teamGroup(team)) {
                    <span class="badge !text-[11px] !px-2 text-white font-bold shrink-0" [style.background-color]="sectionColor(teamGroup(team)!)">{{ sectionLabel(teamGroup(team)!) | translate }}</span>
                  }
                </div>
                <div class="text-xs text-gray-400 truncate">
                  {{ team.manager || ('TEAM_LIST.NO_MANAGER' | translate) }}
                </div>
                @if (auth.isAdmin() && tournamentType() === 'team_match' && !(team.allowedClubs?.length)) {
                  <div class="text-[11px] text-amber-600 truncate">{{ 'TEAM_LIST.NO_CLUBS_BADGE' | translate }}</div>
                }
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
      }
    </div>
  `,
})
export class TeamListComponent {
  readonly teamGroup = teamGroup;
  readonly tournamentId = input.required<string>();
  /** Tournament's team cap; 0 = no cap. Hides "Add Team" once the roster is full. */
  readonly maxTeams = input<number>(0);
  readonly tournamentType = input<string>('');

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

  /** team_match players the admin hasn't assigned any football clubs to yet. */
  missingClubTeams = computed(() => this.teams().filter((t) => !(t.allowedClubs?.length)));

  /** One block per group for team_match (A, B, then unassigned); a single block otherwise. */
  sections = computed((): { key: 'all' | 'A' | 'B' | 'none'; teams: Team[] }[] => {
    const all = this.teams();
    if (this.tournamentType() !== 'team_match') return [{ key: 'all', teams: all }];
    const a = all.filter((t) => teamGroup(t) === 'A');
    const b = all.filter((t) => teamGroup(t) === 'B');
    const none = all.filter((t) => !teamGroup(t));
    return [
      { key: 'A' as const, teams: a },
      { key: 'B' as const, teams: b },
      { key: 'none' as const, teams: none },
    ].filter((s) => s.teams.length > 0);
  });

  sectionColor(key: string): string {
    return key === 'A' ? '#3b82f6' : key === 'B' ? '#ec4899' : '#64748b';
  }

  sectionLabel(key: string): string {
    return key === 'A' ? 'TEAM_MATCH.GROUP_A' : key === 'B' ? 'TEAM_MATCH.GROUP_B' : 'TEAM_LIST.NO_GROUP';
  }

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

  openBulkClubs(): void {
    const isMobile = this.breakpoints.isMatched('(max-width: 767px)');
    this.dialog.open(BulkClubsDialogComponent, {
      data: { teams: this.teams() },
      width: isMobile ? '100vw' : '480px',
      height: isMobile ? '100dvh' : 'auto',
      maxWidth: '100vw',
      panelClass: isMobile ? 'fullscreen-dialog' : undefined,
    });
  }

  openForm(team?: Team): void {
    const isMobile = this.breakpoints.isMatched('(max-width: 767px)');
    this.dialog.open(TeamFormComponent, {
      data: { tournamentId: this.tournamentId(), tournamentType: this.tournamentType(), team, nextIndex: this.nextTeamIndex() },
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

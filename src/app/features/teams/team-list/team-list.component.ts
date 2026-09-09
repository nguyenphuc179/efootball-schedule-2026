import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { BreakpointObserver } from '@angular/cdk/layout';
import { TeamService } from '../team.service';
import { AuthService } from '../../../core/services/auth.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { TeamFormComponent } from '../team-form/team-form.component';
import { Team } from '../../../models/team.model';

@Component({
  selector: 'app-team-list',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3">
      @if (auth.isAdmin()) {
        <button class="btn-primary self-start flex items-center gap-1 !py-2 !px-4 text-sm" (click)="openForm()">
          <span class="material-icons text-[18px]">add</span> Add Team
        </button>
      }

      @if (teams().length === 0) {
        <app-empty-state icon="groups" title="No teams yet" subtitle="Teams added to this tournament will appear here." />
      } @else {
        <div class="grid grid-cols-2 gap-3">
          @for (team of teams(); track team.id) {
            <div class="card flex flex-col items-center text-center gap-2 relative">
              @if (auth.isAdmin()) {
                <button class="absolute top-2 right-2 w-8 h-8 flex items-center justify-center text-gray-400" (click)="openForm(team)">
                  <span class="material-icons text-[18px]">edit</span>
                </button>
              }
              <div class="w-14 h-14 rounded-full bg-primary-50 flex items-center justify-center overflow-hidden">
                @if (team.logo) {
                  <img [src]="team.logo" [alt]="team.teamName" class="w-full h-full object-cover" width="56" height="56" />
                } @else {
                  <span class="material-icons text-primary-400">shield</span>
                }
              </div>
              <div class="font-semibold text-sm leading-tight">{{ team.teamName }}</div>
              <div class="text-xs text-gray-400">{{ team.manager }}</div>
              <div class="text-[11px] text-gray-400">{{ team.playersCount }} players</div>
              @if (auth.isAdmin()) {
                <button class="text-accent-red text-xs font-semibold" (click)="deleteTeam(team)">Remove</button>
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

  private teamService = inject(TeamService);
  private dialog = inject(MatDialog);
  private breakpoints = inject(BreakpointObserver);
  auth = inject(AuthService);

  teams = toSignal(
    toObservable(this.tournamentId).pipe(switchMap((id) => this.teamService.streamByTournament(id))),
    { initialValue: [] as Team[] }
  );

  openForm(team?: Team): void {
    const isMobile = this.breakpoints.isMatched('(max-width: 767px)');
    this.dialog.open(TeamFormComponent, {
      data: { tournamentId: this.tournamentId(), team },
      width: isMobile ? '100vw' : '480px',
      height: isMobile ? '100dvh' : 'auto',
      maxWidth: '100vw',
      panelClass: isMobile ? 'fullscreen-dialog' : undefined,
    });
  }

  async deleteTeam(team: Team): Promise<void> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Remove team?', message: `${team.teamName} will be removed from this tournament.`, destructive: true, confirmLabel: 'Remove' },
      width: '90vw',
      maxWidth: '400px',
    });
    const confirmed = await ref.afterClosed().toPromise();
    if (confirmed) {
      await this.teamService.remove(team.id);
    }
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TeamService } from '../team.service';
import { TeamAvatarService } from '../team-avatar.service';
import { TournamentService } from '../../tournament/tournament.service';
import { Team, teamGroup } from '../../../models/team.model';
import { Tournament } from '../../../models/tournament.model';
import { RosterColumn, downloadBlob, renderRosterPng, shareImage } from '../../tournament/team-match/team-match-export.util';

/** "Download" + "Share" buttons for the team_match roster tab — Team A and Team B members as one PNG. */
@Component({
  selector: 'app-roster-export',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-end gap-1">
      <div class="flex items-center justify-end gap-2">
        <button class="btn-secondary flex items-center gap-1.5 !py-2 !px-4 text-sm" (click)="download()">
          <span class="material-icons text-[18px]">download</span>{{ 'TEAM_MATCH.DOWNLOAD' | translate }}
        </button>
        <button class="btn-secondary flex items-center gap-1.5 !py-2 !px-4 text-sm" (click)="share()">
          <span class="material-icons text-[18px]">share</span>{{ 'TEAM_MATCH.SHARE' | translate }}
        </button>
      </div>
      @if (message(); as msg) {
        <p class="text-xs text-primary-700 text-right max-w-md">{{ msg }}</p>
      }
    </div>
  `,
})
export class RosterExportComponent {
  readonly tournamentId = input.required<string>();

  private teamService = inject(TeamService);
  private teamAvatars = inject(TeamAvatarService);
  private tournamentService = inject(TournamentService);
  private translate = inject(TranslateService);

  message = signal<string | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  private teams = toSignal(
    toObservable(this.tournamentId).pipe(switchMap((id) => this.teamService.streamByTournament(id))),
    { initialValue: [] as Team[] }
  );
  private tournament = toSignal(
    toObservable(this.tournamentId).pipe(switchMap((id) => this.tournamentService.streamOne(id))),
    { initialValue: undefined as Tournament | undefined }
  );

  private columns = computed((): RosterColumn[] => {
    this.translate.currentLang();
    const member = (t: Team) => ({ name: t.teamName, sub: t.manager, avatar: this.teamAvatars.resolve(t) });
    const cols: RosterColumn[] = [
      { label: this.translate.instant('TEAM_MATCH.GROUP_A'), color: '#3b82f6', members: this.teams().filter((t) => teamGroup(t) === 'A').map(member) },
      { label: this.translate.instant('TEAM_MATCH.GROUP_B'), color: '#ec4899', members: this.teams().filter((t) => teamGroup(t) === 'B').map(member) },
    ];
    const none = this.teams().filter((t) => !teamGroup(t));
    if (none.length > 0) cols.push({ label: this.translate.instant('TEAM_LIST.NO_GROUP'), color: '#64748b', members: none.map(member) });
    return cols.filter((c) => c.members.length > 0);
  });

  private title(): string {
    const name = this.tournament()?.name ?? 'Team battle';
    return name + ' - ' + this.translate.instant('ADMIN_OVERVIEW.TEAMS');
  }

  private image(): Promise<Blob> {
    return renderRosterPng(this.title(), this.columns()).then((b) => {
      if (!b) throw new Error('no image');
      return b;
    });
  }

  async download(): Promise<void> {
    const blob = await this.image().catch(() => null);
    if (blob) downloadBlob(blob, this.title() + '.png');
  }

  async share(): Promise<void> {
    const result = await shareImage(this.image(), this.title(), this.tournament()?.facebookGroupUrl);
    const key = { copied: 'TEAM_MATCH.SHARE_COPIED', 'copied-no-group': 'TEAM_MATCH.SHARE_NO_GROUP', failed: 'TEAM_MATCH.SHARE_FAILED' }[result as string];
    if (!key) return;
    this.message.set(this.translate.instant(key));
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.message.set(null), 9000);
  }
}

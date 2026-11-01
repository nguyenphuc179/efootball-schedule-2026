import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MatchService } from '../../fixtures/match.service';
import { TeamService } from '../../teams/team.service';
import { StandingsService } from '../../standings/standings.service';
import { TournamentService } from '../tournament.service';
import { Match } from '../../../models/match.model';
import { StandingRow } from '../../../models/standing.model';
import { Team, teamGroup } from '../../../models/team.model';
import { Tournament } from '../../../models/tournament.model';
import { compareGroups, computeGroupStats } from './group-stats.util';
import { playerLabel } from '../../../shared/utils/player-label.util';
import { StandingsTable, StandingsTableRow, downloadBlob, renderStandingsPng, shareImage } from './team-match-export.util';

/** "Download" + "Share" buttons for the team_match standings tab — the tables become one PNG. */
@Component({
  selector: 'app-standings-export',
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
export class StandingsExportComponent {
  readonly tournamentId = input.required<string>();

  private matchService = inject(MatchService);
  private teamService = inject(TeamService);
  private standingsService = inject(StandingsService);
  private tournamentService = inject(TournamentService);
  private translate = inject(TranslateService);

  message = signal<string | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  private matches = toSignal(
    toObservable(this.tournamentId).pipe(switchMap((id) => this.matchService.streamByTournament(id))),
    { initialValue: [] as Match[] }
  );
  private teams = toSignal(
    toObservable(this.tournamentId).pipe(switchMap((id) => this.teamService.streamByTournament(id))),
    { initialValue: [] as Team[] }
  );
  private rows = toSignal(
    toObservable(this.tournamentId).pipe(switchMap((id) => this.standingsService.streamRows(id))),
    { initialValue: [] as StandingRow[] }
  );
  private tournament = toSignal(
    toObservable(this.tournamentId).pipe(switchMap((id) => this.tournamentService.streamOne(id))),
    { initialValue: undefined as Tournament | undefined }
  );

  private label(row: StandingRow): string {
    const team = this.teams().find((t) => t.id === row.teamId);
    return playerLabel(row.teamName, team?.manager);
  }

  private playerRow(row: StandingRow, pos: number): StandingsTableRow {
    const gd = row.goalDifference > 0 ? '+' + row.goalDifference : String(row.goalDifference);
    return {
      pos,
      name: this.label(row),
      played: String(row.played),
      wdl: row.won + ' - ' + row.drawn + ' - ' + row.lost,
      gd: row.goalsFor + '/' + row.goalsAgainst + ' (' + gd + ')',
      points: String(row.points),
    };
  }

  /** Same four tables as the on-screen tab: Team A vs B, everyone, then Team A and Team B alone. */
  private tables = computed((): StandingsTable[] => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    const head = {
      name: t('STANDINGS_VIEW.TEAM').toUpperCase(),
      played: t('STANDINGS_VIEW.PLD').toUpperCase(),
      wdl: t('STANDINGS_VIEW.W_D_L').toUpperCase(),
      gd: '+/-',
      points: t('STANDINGS.PTS_ABBR').toUpperCase(),
    };
    const teams = this.teams();
    const aIds = new Set(teams.filter((x) => teamGroup(x) === 'A').map((x) => x.id));
    const bIds = new Set(teams.filter((x) => teamGroup(x) === 'B').map((x) => x.id));

    const tables: StandingsTable[] = [];

    if (aIds.size > 0 && bIds.size > 0) {
      const stats = computeGroupStats(this.matches(), aIds, bIds);
      const leader = compareGroups(stats.A, stats.B).leader;
      const order: ('A' | 'B')[] = leader === 'B' ? ['B', 'A'] : ['A', 'B'];
      const tied = leader === null;
      tables.push({
        title: t('TEAM_MATCH.GROUP_STANDINGS'),
        color: '#f5a623',
        head,
        rows: order.map((k, i) => {
          const s = stats[k];
          const gd = s.goalDifference > 0 ? '+' + s.goalDifference : String(s.goalDifference);
          return {
            pos: tied ? 1 : i + 1,
            name: t(k === 'A' ? 'TEAM_MATCH.GROUP_A' : 'TEAM_MATCH.GROUP_B') + ' (' + (k === 'A' ? aIds.size : bIds.size) + ')',
            played: String(s.played),
            wdl: s.wins + ' - ' + s.draws + ' - ' + s.losses,
            gd: s.goalsFor + '/' + s.goalsAgainst + ' (' + gd + ')',
            points: String(s.points),
          };
        }),
      });
    }

    const rows = this.rows();
    if (rows.length > 0) {
      tables.push({
        title: t('TEAM_MATCH.MEMBER_STANDINGS'),
        color: '#34d27b',
        head,
        rows: rows.map((r, i) => this.playerRow(r, i + 1)),
      });
      for (const [key, ids, color] of [['A', aIds, '#60a5fa'], ['B', bIds, '#f472b6']] as const) {
        const inGroup = rows.filter((r) => ids.has(r.teamId));
        if (inGroup.length > 0) {
          tables.push({
            title: t(key === 'A' ? 'TEAM_MATCH.GROUP_A' : 'TEAM_MATCH.GROUP_B'),
            color,
            head,
            rows: inGroup.map((r, i) => this.playerRow(r, i + 1)),
          });
        }
      }
    }
    return tables;
  });

  private title(): string {
    const name = this.tournament()?.name ?? 'Team battle';
    return name + ' - ' + this.translate.instant('TOURNAMENT_DETAIL.TAB_STANDINGS');
  }

  private image(): Promise<Blob> {
    return renderStandingsPng(this.title(), this.tables()).then((b) => {
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

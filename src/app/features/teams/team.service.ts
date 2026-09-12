import { Injectable, inject } from '@angular/core';
import { increment, orderBy, where } from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { FirestoreBaseService } from '../../core/services/firestore-base.service';
import { ActivityLogService } from '../../core/services/activity-log.service';
import { Team, TeamDraft } from '../../models/team.model';
import { Player, PlayerDraft } from '../../models/player.model';

const PATH = 'teams';

@Injectable({ providedIn: 'root' })
export class TeamService {
  private fs = inject(FirestoreBaseService);
  private activityLog = inject(ActivityLogService);

  /** Every team across every tournament — powers the "/history" manager filter (distinct
   *  `managerUid`s app-wide), not scoped like `streamByTournament`. */
  readonly all = toSignal(this.fs.streamCollection<Team>(PATH), { initialValue: [] as Team[] });

  streamByTournament(tournamentId: string) {
    return this.fs.streamCollection<Team>(
      PATH,
      where('tournamentId', '==', tournamentId),
      orderBy('teamName', 'asc')
    );
  }

  /** Every team a given user manages, across all tournaments (for the personal Home dashboard). */
  streamByManager(managerUid: string) {
    return this.fs.streamCollection<Team>(PATH, where('managerUid', '==', managerUid));
  }

  async getByTournamentOnce(tournamentId: string): Promise<Team[]> {
    return this.fs.getOnce<Team>(PATH, where('tournamentId', '==', tournamentId), orderBy('teamName', 'asc'));
  }

  async getById(id: string): Promise<Team | undefined> {
    return this.fs.getById<Team>(`${PATH}/${id}`);
  }

  async create(draft: TeamDraft): Promise<string> {
    const id = await this.fs.add<Omit<Team, 'id' | 'createdDate' | 'playersCount'>>(PATH, {
      ...draft,
      playersCount: 0,
    } as any);
    await this.activityLog.log('team_create', `Đã tạo đội "${draft.teamName}"`, draft.tournamentId);
    return id;
  }

  async update(id: string, draft: Partial<TeamDraft>): Promise<void> {
    await this.fs.update(PATH, id, draft);
    const team = await this.getById(id);
    const name = draft.teamName ?? team?.teamName ?? id;
    await this.activityLog.log('team_update', `Đã cập nhật đội "${name}"`, team?.tournamentId ?? draft.tournamentId ?? null);
  }

  async remove(id: string): Promise<void> {
    const team = await this.getById(id);
    await this.fs.remove(PATH, id);
    await this.activityLog.log('team_delete', `Đã xoá đội "${team?.teamName ?? id}"`, team?.tournamentId ?? null);
  }

  // --- Roster (players sub-collection) -------------------------------------------------

  streamPlayers(teamId: string) {
    return this.fs.streamCollection<Player>(`${PATH}/${teamId}/players`, orderBy('shirtNumber', 'asc'));
  }

  async addPlayer(teamId: string, draft: PlayerDraft): Promise<void> {
    await this.fs.add(`${PATH}/${teamId}/players`, { ...draft, goals: 0, yellowCards: 0, redCards: 0 });
    await this.fs.update(PATH, teamId, { playersCount: increment(1) as unknown as number });
    const team = await this.getById(teamId);
    await this.activityLog.log(
      'player_add',
      `Đã thêm cầu thủ "${draft.fullName}" vào đội "${team?.teamName ?? teamId}"`,
      team?.tournamentId ?? null
    );
  }

  async removePlayer(teamId: string, playerId: string): Promise<void> {
    await this.fs.remove(`${PATH}/${teamId}/players`, playerId);
    await this.fs.update(PATH, teamId, { playersCount: increment(-1) as unknown as number });
    const team = await this.getById(teamId);
    await this.activityLog.log(
      'player_remove',
      `Đã xoá 1 cầu thủ khỏi đội "${team?.teamName ?? teamId}"`,
      team?.tournamentId ?? null
    );
  }
}

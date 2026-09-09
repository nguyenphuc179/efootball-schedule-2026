import { Injectable, inject } from '@angular/core';
import { increment, orderBy, where } from '@angular/fire/firestore';
import { FirestoreBaseService } from '../../core/services/firestore-base.service';
import { Team, TeamDraft } from '../../models/team.model';
import { Player, PlayerDraft } from '../../models/player.model';

const PATH = 'teams';

@Injectable({ providedIn: 'root' })
export class TeamService {
  private fs = inject(FirestoreBaseService);

  streamByTournament(tournamentId: string) {
    return this.fs.streamCollection<Team>(
      PATH,
      where('tournamentId', '==', tournamentId),
      orderBy('teamName', 'asc')
    );
  }

  async getByTournamentOnce(tournamentId: string): Promise<Team[]> {
    return this.fs.getOnce<Team>(PATH, where('tournamentId', '==', tournamentId), orderBy('teamName', 'asc'));
  }

  async create(draft: TeamDraft): Promise<string> {
    return this.fs.add<Omit<Team, 'id' | 'createdDate' | 'playersCount'>>(PATH, {
      ...draft,
      playersCount: 0,
    } as any);
  }

  async update(id: string, draft: Partial<TeamDraft>): Promise<void> {
    await this.fs.update(PATH, id, draft);
  }

  async remove(id: string): Promise<void> {
    await this.fs.remove(PATH, id);
  }

  // --- Roster (players sub-collection) -------------------------------------------------

  streamPlayers(teamId: string) {
    return this.fs.streamCollection<Player>(`${PATH}/${teamId}/players`, orderBy('shirtNumber', 'asc'));
  }

  async addPlayer(teamId: string, draft: PlayerDraft): Promise<void> {
    await this.fs.add(`${PATH}/${teamId}/players`, { ...draft, goals: 0, yellowCards: 0, redCards: 0 });
    await this.fs.update(PATH, teamId, { playersCount: increment(1) as unknown as number });
  }

  async removePlayer(teamId: string, playerId: string): Promise<void> {
    await this.fs.remove(`${PATH}/${teamId}/players`, playerId);
    await this.fs.update(PATH, teamId, { playersCount: increment(-1) as unknown as number });
  }
}

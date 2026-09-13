import { Injectable, inject } from '@angular/core';
import { orderBy, where } from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { FirestoreBaseService } from '../../core/services/firestore-base.service';
import { ActivityLogService } from '../../core/services/activity-log.service';
import { TournamentService } from '../tournament/tournament.service';
import { Team, TeamDraft } from '../../models/team.model';

const PATH = 'teams';

@Injectable({ providedIn: 'root' })
export class TeamService {
  private fs = inject(FirestoreBaseService);
  private activityLog = inject(ActivityLogService);
  private tournamentService = inject(TournamentService);

  /** `Đã tạo đội "X" thuộc quản lý "Y" ở giải đấu "Z"` — the "thuộc quản lý ... ở giải đấu ..."
   *  suffix shared by every team-level log description below, so an admin (and, via `subjectUid`,
   *  the manager themselves) can tell which team/tournament/manager an entry is about without
   *  having to open it. `manager` falls back to "chưa gán" (unassigned) since `Team.manager` can be
   *  an empty string when a team has no linked manager account. */
  private async describeTeamContext(manager: string | undefined, tournamentId: string | null): Promise<string> {
    const managerLabel = manager?.trim() || 'chưa gán';
    const tournament = tournamentId ? await this.tournamentService.getOnce(tournamentId) : undefined;
    return `thuộc quản lý "${managerLabel}" ở giải đấu "${tournament?.name ?? tournamentId ?? 'không rõ'}"`;
  }

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
    const id = await this.fs.add<Omit<Team, 'id' | 'createdDate'>>(PATH, draft);
    const context = await this.describeTeamContext(draft.manager, draft.tournamentId);
    await this.activityLog.log(
      'team_create',
      `Đã tạo đội "${draft.teamName}" ${context}`,
      draft.tournamentId,
      draft.managerUid
    );
    return id;
  }

  async update(id: string, draft: Partial<TeamDraft>): Promise<void> {
    await this.fs.update(PATH, id, draft);
    const team = await this.getById(id);
    const name = draft.teamName ?? team?.teamName ?? id;
    const tournamentId = team?.tournamentId ?? draft.tournamentId ?? null;
    const context = await this.describeTeamContext(draft.manager ?? team?.manager, tournamentId);
    await this.activityLog.log(
      'team_update',
      `Đã cập nhật đội "${name}" ${context}`,
      tournamentId,
      draft.managerUid ?? team?.managerUid ?? null
    );
  }

  async remove(id: string): Promise<void> {
    const team = await this.getById(id);
    await this.fs.remove(PATH, id);
    const context = await this.describeTeamContext(team?.manager, team?.tournamentId ?? null);
    await this.activityLog.log(
      'team_delete',
      `Đã xoá đội "${team?.teamName ?? id}" ${context}`,
      team?.tournamentId ?? null,
      team?.managerUid ?? null
    );
  }
}

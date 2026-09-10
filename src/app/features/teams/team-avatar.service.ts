import { Injectable, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { MemberService } from '../members/member.service';
import { ManagerImageService } from '../ranking/manager-image.service';
import { AppUser } from '../../models/user.model';
import { Team } from '../../models/team.model';
import { TeamAvatar, teamAvatar } from '../../shared/utils/team-avatar.util';

/**
 * One place to turn a `Team` into the picture + initials shown for it across the app (Teams tab,
 * standings, fixture rows). Pulls the fallback sources once: admin-set manager portraits (public
 * `managerImages`) and — for admins only, since firestore.rules gate `users` list access — each
 * member's login photo, to back-fill teams saved before it was cached on the team document.
 */
@Injectable({ providedIn: 'root' })
export class TeamAvatarService {
  private auth = inject(AuthService);
  private members = inject(MemberService);
  private managerImages = inject(ManagerImageService);

  private memberList = toSignal(
    toObservable(this.auth.isAdmin).pipe(
      switchMap((admin) => (admin ? this.members.streamMembers() : of([] as AppUser[])))
    ),
    { initialValue: [] as AppUser[] }
  );

  private sources = computed(() => {
    const memberPhotos = new Map<string, string>();
    for (const m of this.memberList()) if (m.photoURL) memberPhotos.set(m.uid, m.photoURL);
    return { managerPortraits: this.managerImages.byManager(), memberPhotos };
  });

  resolve(team: Team | undefined | null): TeamAvatar {
    return teamAvatar(team, this.sources());
  }

  /** `{ [teamId]: TeamAvatar }` for a set of teams — pass to `<app-match-row [avatars]>`. */
  byId(teams: readonly Team[]): Record<string, TeamAvatar> {
    const src = this.sources();
    const out: Record<string, TeamAvatar> = {};
    for (const t of teams) out[t.id] = teamAvatar(t, src);
    return out;
  }
}

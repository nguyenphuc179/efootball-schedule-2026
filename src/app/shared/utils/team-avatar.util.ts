import { Team } from '../../models/team.model';
import { InitialsAvatar, initialsAvatar } from './avatar.util';
import { isUserImage } from './image-url.util';

export interface TeamAvatar extends InitialsAvatar {
  /** An <img> src when we have a real picture, else null → render the initials circle. */
  src: string | null;
}

export interface TeamAvatarSources {
  /** Manager name → admin-curated portrait URL (`ManagerImageService.byManager()`). */
  managerPortraits?: Map<string, string>;
  /** Manager uid → login (Gmail) photo, for teams saved before it was cached on the team. */
  memberPhotos?: Map<string, string>;
}

/**
 * Resolves the picture + initials shown for a team everywhere in the app (team list, standings, …).
 * Priority: the team's own logo (a real pasted URL/bitmap) → the manager's cached login photo →
 * a live member photo → an admin-set manager portrait → else a colour + initials from the manager.
 */
export function teamAvatar(team: Team | undefined | null, sources: TeamAvatarSources = {}): TeamAvatar {
  const label = team?.manager?.trim() || team?.teamName || '?';
  const base = initialsAvatar(label);

  const manager = team?.manager?.trim();
  const src =
    (team && isUserImage(team.logo) ? team.logo : null) ||
    team?.managerPhotoURL ||
    (team?.managerUid && sources.memberPhotos?.get(team.managerUid)) ||
    (manager && sources.managerPortraits?.get(manager)) ||
    null;

  return { ...base, src };
}

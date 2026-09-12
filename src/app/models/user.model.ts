export type UserRole = 'admin' | 'viewer';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  /**
   * Admin-assigned name shown everywhere in the app. Overrides the (often inconsistent) name that
   * came from the login provider. The login `displayName` is kept untouched as a fallback.
   */
  systemDisplayName?: string | null;
  photoURL: string | null;
  role: UserRole;
  disabled?: boolean; // admin lock-out: blocked by firestore.rules + force sign-out
  favoriteTeamIds: string[];
  createdDate: number; // epoch millis
}

/** The name to show for a user across the app: admin override → login name → email → fallback. */
export function userDisplayName(
  user: Pick<AppUser, 'systemDisplayName' | 'displayName' | 'email'> | null | undefined,
  fallback = 'Unknown user'
): string {
  return (
    user?.systemDisplayName?.trim() ||
    user?.displayName?.trim() ||
    user?.email?.trim() ||
    fallback
  );
}

export function createDefaultAppUser(
  uid: string,
  email: string | null,
  displayName: string | null,
  photoURL: string | null
): AppUser {
  return {
    uid,
    email,
    displayName,
    systemDisplayName: null,
    photoURL,
    role: 'viewer',
    disabled: false,
    favoriteTeamIds: [],
    createdDate: Date.now(),
  };
}

export type UserRole = 'admin' | 'viewer';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  disabled?: boolean; // admin lock-out: blocked by firestore.rules + force sign-out
  fcmTokens: string[];
  favoriteTeamIds: string[];
  createdDate: number; // epoch millis
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
    photoURL,
    role: 'viewer',
    disabled: false,
    fcmTokens: [],
    favoriteTeamIds: [],
    createdDate: Date.now(),
  };
}

export type UserRole = 'admin' | 'viewer';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
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
    fcmTokens: [],
    favoriteTeamIds: [],
    createdDate: Date.now(),
  };
}

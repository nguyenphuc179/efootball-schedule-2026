export type NotificationType =
  | 'tournament_created'
  | 'match_reminder'
  | 'result_updated'
  | 'standings_updated'
  | 'tournament_started'
  | 'tournament_finished';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  audience: 'all' | 'user';
  targetUid: string | null;
  tournamentId: string | null;
  read: boolean;
  createdDate: number;
}

export type NotificationDraft = Omit<AppNotification, 'id' | 'createdDate' | 'read'>;

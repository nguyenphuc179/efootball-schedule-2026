export interface CheckIn {
  id: string;
  tournamentId: string;
  teamId: string;
  checkedInByUid: string;
  checkedInAt: number;
  method: 'qr_scan' | 'manual';
}

export type CheckInDraft = Omit<CheckIn, 'id' | 'checkedInAt'>;

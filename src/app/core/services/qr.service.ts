import { Injectable } from '@angular/core';

/** Generates the share link for a tournament — a plain HTTPS deep link. */
@Injectable({ providedIn: 'root' })
export class QrService {
  private get origin(): string {
    return typeof window !== 'undefined' ? window.location.origin : 'https://pitchpro.app';
  }

  tournamentShareUrl(tournamentId: string): string {
    return `${this.origin}/t/${tournamentId}`;
  }
}

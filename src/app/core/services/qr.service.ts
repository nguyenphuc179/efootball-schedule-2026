import { Injectable } from '@angular/core';
import QRCode from 'qrcode';

/**
 * Generates QR codes (as data URLs, no server round-trip) for tournament share links and
 * team check-in links. Payloads are plain HTTPS deep links — any camera app can open them,
 * the in-app scanner (see features/checkin) is a convenience, not a requirement.
 */
@Injectable({ providedIn: 'root' })
export class QrService {
  private get origin(): string {
    return typeof window !== 'undefined' ? window.location.origin : 'https://pitchpro.app';
  }

  tournamentShareUrl(tournamentId: string): string {
    return `${this.origin}/t/${tournamentId}`;
  }

  teamCheckinUrl(tournamentId: string, teamId: string): string {
    return `${this.origin}/checkin/${teamId}?t=${tournamentId}`;
  }

  async toDataUrl(payload: string): Promise<string> {
    return QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320,
      color: { dark: '#0f1720', light: '#ffffff' },
    });
  }

  async tournamentQrDataUrl(tournamentId: string): Promise<string> {
    return this.toDataUrl(this.tournamentShareUrl(tournamentId));
  }

  async teamCheckinQrDataUrl(tournamentId: string, teamId: string): Promise<string> {
    return this.toDataUrl(this.teamCheckinUrl(tournamentId, teamId));
  }

  /** Parses a scanned URL/string back into a team check-in reference, or null if not recognized. */
  parseCheckinPayload(raw: string): { teamId: string; tournamentId: string | null } | null {
    try {
      const url = new URL(raw, this.origin);
      const match = url.pathname.match(/\/checkin\/([^/]+)/);
      if (!match) return null;
      return { teamId: match[1], tournamentId: url.searchParams.get('t') };
    } catch {
      return null;
    }
  }
}

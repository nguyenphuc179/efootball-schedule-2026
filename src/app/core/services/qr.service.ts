import { Injectable } from '@angular/core';
import QRCode from 'qrcode';

/**
 * Generates share links and QR codes (as data URLs, no server round-trip) for tournaments.
 * Payloads are plain HTTPS deep links — any camera app can open them.
 */
@Injectable({ providedIn: 'root' })
export class QrService {
  private get origin(): string {
    return typeof window !== 'undefined' ? window.location.origin : 'https://pitchpro.app';
  }

  tournamentShareUrl(tournamentId: string): string {
    return `${this.origin}/t/${tournamentId}`;
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
}

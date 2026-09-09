import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { QrService } from '../../../core/services/qr.service';
import { TeamService } from '../../teams/team.service';

/** Generates and displays a team's check-in QR code — printed/shown at the venue. */
@Component({
  selector: 'app-team-qr',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh flex flex-col bg-white">
      <div class="flex items-center h-14 px-4 border-b border-gray-100">
        <button class="w-9 h-9 flex items-center justify-center" (click)="router.navigate(['..'])">
          <span class="material-icons">arrow_back</span>
        </button>
        <h1 class="font-bold ml-1">Team Check-In QR</h1>
      </div>

      <div class="flex-1 flex flex-col items-center justify-center gap-4 p-6">
        @if (qrDataUrl()) {
          <img [src]="qrDataUrl()" alt="Team check-in QR code" class="w-64 h-64 rounded-2xl border border-gray-100" />
        }
        <p class="text-sm text-gray-500 text-center">Scan this code at the venue to check the team in.</p>
        <button class="btn-secondary" (click)="copyLink()">{{ copied() ? 'Link copied!' : 'Copy link' }}</button>
      </div>
    </div>
  `,
})
export class TeamQrComponent {
  private route = inject(ActivatedRoute);
  router = inject(Router);
  private qrService = inject(QrService);

  private tournamentId = this.route.snapshot.paramMap.get('id')!;
  private teamId = this.route.snapshot.paramMap.get('teamId')!;

  qrDataUrl = signal<string | null>(null);
  copied = signal(false);

  constructor() {
    this.qrService.teamCheckinQrDataUrl(this.tournamentId, this.teamId).then((url) => this.qrDataUrl.set(url));
  }

  async copyLink(): Promise<void> {
    const url = this.qrService.teamCheckinUrl(this.tournamentId, this.teamId);
    await navigator.clipboard.writeText(url).catch(() => undefined);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }
}

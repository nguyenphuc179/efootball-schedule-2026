import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Html5Qrcode } from 'html5-qrcode';
import { CheckinService } from './checkin.service';
import { TeamService } from '../teams/team.service';
import { QrService } from '../../core/services/qr.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { CheckIn } from '../../models/checkin.model';
import { Team } from '../../models/team.model';

const SCANNER_ELEMENT_ID = 'qr-scanner-region';

/**
 * QR check-in workflow: 1) admin/manager generates a team QR (team-qr.component) 2) this screen
 * scans it with the device camera (html5-qrcode) 3) writes a `checkins` doc 4) attendance list
 * updates live below the scanner.
 *
 * Also reachable via a plain deep link (`/checkin/:teamId`) from any camera app scanning the QR —
 * in that case the scanner UI is skipped and the check-in happens directly (with a confirm step).
 */
@Component({
  selector: 'app-checkin',
  standalone: true,
  imports: [CommonModule, RouterLink, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-content-area px-4 pt-4 max-w-2xl mx-auto">
      <h1 class="text-xl font-extrabold mb-1">Team Check-In</h1>
      <p class="text-sm text-gray-500 mb-4">Scan a team's QR code to mark them as arrived.</p>

      @if (deepLinkTeam(); as team) {
        <div class="card mb-4">
          <div class="font-semibold mb-2">Check in {{ team.teamName }}?</div>
          <button class="btn-primary w-full" (click)="checkIn(team.id)">Confirm Check-In</button>
        </div>
      }

      <div class="card mb-4">
        @if (!scanning()) {
          <button class="btn-primary w-full flex items-center justify-center gap-2" (click)="startScan()">
            <span class="material-icons text-[18px]">qr_code_scanner</span> Start Scanning
          </button>
        } @else {
          <div id="qr-scanner-region" class="w-full aspect-square rounded-xl overflow-hidden bg-black"></div>
          <button class="btn-secondary w-full mt-3" (click)="stopScan()">Stop</button>
        }
        @if (scanError()) {
          <p class="text-accent-red text-xs mt-2">{{ scanError() }}</p>
        }
      </div>

      <h2 class="font-bold text-sm text-gray-500 uppercase tracking-wide mb-2">Attendance</h2>
      @if (teams().length === 0) {
        <app-empty-state icon="groups" title="No teams in this tournament" />
      } @else {
        <div class="flex flex-col gap-2">
          @for (team of teams(); track team.id) {
            <div class="card flex items-center gap-3 !py-3">
              <div class="flex-1 min-w-0 font-semibold text-sm truncate">{{ team.teamName }}</div>
              @if (isCheckedIn(team.id)) {
                <span class="badge bg-primary-50 text-primary-700 flex items-center gap-1">
                  <span class="material-icons text-[14px]">check_circle</span> Checked In
                </span>
              } @else {
                <a [routerLink]="['/tournaments', tournamentId, 'checkin', team.id, 'qr']" class="text-xs font-semibold text-primary-600">
                  Get QR
                </a>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class CheckinComponent implements OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private checkinService = inject(CheckinService);
  private teamService = inject(TeamService);
  private qrService = inject(QrService);

  tournamentId = this.route.snapshot.paramMap.get('id') ?? this.route.snapshot.queryParamMap.get('t') ?? '';
  private deepLinkTeamId = this.route.snapshot.paramMap.get('teamId');

  scanning = signal(false);
  scanError = signal('');
  private html5Qr: Html5Qrcode | null = null;

  teams = toSignal(this.teamService.streamByTournament(this.tournamentId || '__none__'), { initialValue: [] as Team[] });
  checkins = toSignal(this.checkinService.streamByTournament(this.tournamentId || '__none__'), { initialValue: [] as CheckIn[] });

  deepLinkTeam = computed(() =>
    this.deepLinkTeamId ? this.teams().find((t) => t.id === this.deepLinkTeamId) : undefined
  );

  isCheckedIn(teamId: string): boolean {
    return this.checkins().some((c) => c.teamId === teamId);
  }

  async startScan(): Promise<void> {
    this.scanError.set('');
    this.scanning.set(true);
    queueMicrotask(async () => {
      try {
        this.html5Qr = new Html5Qrcode(SCANNER_ELEMENT_ID);
        await this.html5Qr.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 240 },
          (decodedText) => this.onScanSuccess(decodedText),
          () => undefined
        );
      } catch (err) {
        this.scanError.set('Camera access denied or unavailable. You can also open the team\'s link directly.');
        this.scanning.set(false);
      }
    });
  }

  async stopScan(): Promise<void> {
    await this.html5Qr?.stop().catch(() => undefined);
    this.html5Qr = null;
    this.scanning.set(false);
  }

  private async onScanSuccess(decodedText: string): Promise<void> {
    const parsed = this.qrService.parseCheckinPayload(decodedText);
    if (!parsed) {
      this.scanError.set('QR code not recognized.');
      return;
    }
    await this.stopScan();
    await this.checkIn(parsed.teamId, 'qr_scan');
  }

  async checkIn(teamId: string, method: CheckIn['method'] = 'manual'): Promise<void> {
    await this.checkinService.checkInTeam(this.tournamentId, teamId, method);
  }

  ngOnDestroy(): void {
    this.html5Qr?.stop().catch(() => undefined);
  }
}

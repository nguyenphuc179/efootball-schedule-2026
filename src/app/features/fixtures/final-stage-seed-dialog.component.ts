import { ChangeDetectionStrategy, Component, Inject, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { FinalStageSeed, FinalStageService, previewBracket } from './final-stage.service';
import { FinalBracketComponent } from '../tournament/final-stage/final-bracket.component';
import { Match } from '../../models/match.model';
import { initialsAvatar } from '../../shared/utils/avatar.util';
import { isUserImage } from '../../shared/utils/image-url.util';

export interface FinalStageSeedDialogData {
  tournamentId: string;
  qualifiersPerGroup: number;
  seeds: FinalStageSeed[];
}

type SeedMode = 'random' | 'manual';

/** How long the wheel spins before the pairing is finalised (ms) — keep in sync with the CSS transition below. */
const SPIN_MS = 3200;
/** Cycled around the wheel like a real prize wheel (red/gold/green/blue repeating). */
const WHEEL_COLORS = ['#e5484d', '#f5a623', '#0fa863', '#3b82f6'];

/**
 * Lets an admin set the bracket order for the qualified teams before the Final Stage is built —
 * a spin-the-wheel random draw, or manual drag-to-reorder — instead of always using the fixed
 * group-crossover seeding. The chosen order feeds straight into FinalStageService's own bracket
 * builder (so byes / Third Place still work exactly as before), only the starting order changes.
 */
@Component({
  selector: 'app-final-stage-seed-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, DragDropModule, FinalBracketComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="h-full w-full flex flex-col bg-white">
      <div class="flex items-center justify-between h-14 px-4 border-b border-gray-100 shrink-0">
        <button class="w-9 h-9 flex items-center justify-center" (click)="dialogRef.close()">
          <span class="material-icons">close</span>
        </button>
        <h1 class="font-bold">Seed the Bracket</h1>
        <button
          class="text-primary-600 font-semibold disabled:text-gray-300"
          [disabled]="isGenerating() || (mode() === 'random' && !hasSpun())"
          (click)="generate()"
        >
          {{ isGenerating() ? 'Saving…' : 'Save' }}
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-4 pb-6 flex flex-col gap-4">
        <!-- Mode picker -->
        <div class="flex gap-2">
          @for (m of seedModes; track m) {
            <label
              class="flex-1 flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold cursor-pointer"
              [class]="mode() === m ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500'"
            >
              <input type="radio" name="finalSeedMode" class="sr-only" [checked]="mode() === m" (change)="mode.set(m)" />
              <span class="material-icons text-[18px]">{{ m === 'random' ? 'casino' : 'drag_indicator' }}</span>
              {{ m === 'random' ? 'Random' : 'Drag & Drop' }}
            </label>
          }
        </div>

        @if (mode() === 'manual') {
          <p class="text-xs text-gray-400">
            Drag to reorder the seeding. Seed 1 &amp; 2 only meet in the final.
          </p>

          <div cdkDropList cdkDragLockAxis="y" class="flex flex-col gap-2" (cdkDropListDropped)="drop($event)">
            @for (s of order(); track s.id; let i = $index) {
              <div cdkDrag class="flex items-center gap-3 bg-surface-muted rounded-xl px-3 py-2.5">
                <span class="w-6 text-center text-sm font-extrabold text-gray-400 shrink-0">{{ i + 1 }}</span>
                <span
                  class="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold"
                  [style.background-color]="avatar(s).bg"
                  [style.color]="avatar(s).fg"
                >
                  @if (avatar(s).src; as src) {
                    <img [src]="src" alt="" class="w-full h-full object-cover" referrerpolicy="no-referrer" />
                  } @else {
                    {{ avatar(s).initials }}
                  }
                </span>
                <div class="flex-1 min-w-0">
                  <div class="font-semibold text-sm truncate">{{ s.name }}</div>
                  @if (qualifierLabel(s); as tag) {
                    <div class="text-[11px] text-gray-400">{{ tag }}</div>
                  }
                </div>
                <span class="material-icons text-gray-300 shrink-0 cursor-move p-1 -m-1" cdkDragHandle>drag_indicator</span>
              </div>
            }
          </div>

          <div class="flex flex-col gap-2">
            <p class="text-xs font-bold text-gray-500 uppercase tracking-wide">Bracket Preview</p>
            <app-final-bracket [matches]="previewMatches()" />
          </div>
        } @else {
          <p class="text-xs text-gray-400 text-center">
            Tap the wheel to draw a random bracket order.
          </p>

          <div class="relative w-[260px] h-[260px] mx-auto select-none">
            <div
              class="absolute -top-1 left-1/2 -translate-x-1/2 z-10 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[16px] border-t-gray-700"
            ></div>

            <div
              class="absolute inset-0 rounded-full border-4 border-white shadow-lg overflow-hidden"
              [style.transition]="instantReset() ? 'none' : 'transform ' + spinMs / 1000 + 's cubic-bezier(0.1,0.55,0.15,1)'"
              [style.transform]="'rotate(' + spinDeg() + 'deg)'"
              [style.background]="wheelBackground()"
            >
              @for (s of order(); track s.id; let i = $index) {
                <div
                  class="absolute top-0 left-1/2 w-0 h-1/2 origin-bottom"
                  [style.transform]="'rotate(' + (i * segAngle() + segAngle() / 2) + 'deg)'"
                >
                  <span
                    class="absolute top-2 left-1/2 -translate-x-1/2 max-w-[84px] truncate text-white font-bold drop-shadow"
                    [style.font-size]="labelFontSize()"
                  >{{ s.name }}</span>
                </div>
              }
            </div>

            <button
              type="button"
              class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-white shadow flex items-center justify-center text-xs font-extrabold uppercase tracking-wide text-primary-700 z-10 disabled:opacity-70"
              [disabled]="spinning()"
              (click)="spin()"
            >
              {{ spinning() ? '…' : 'Spin' }}
            </button>
          </div>

          @if (!hasSpun()) {
            <p class="text-sm text-gray-400 text-center py-2">Spin the wheel to draw the match-ups.</p>
          } @else {
            <div class="flex flex-col gap-2">
              <p class="text-xs font-bold text-gray-500 uppercase tracking-wide">Bracket Preview</p>
              <app-final-bracket [matches]="previewMatches()" />
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class FinalStageSeedDialogComponent {
  private finalStage = inject(FinalStageService);

  readonly spinMs = SPIN_MS;
  readonly seedModes: SeedMode[] = ['random', 'manual'];

  mode = signal<SeedMode>('random');
  order = signal<FinalStageSeed[]>([...this.data.seeds]);
  isGenerating = signal(false);

  spinning = signal(false);
  /** Stays false until the wheel has actually been spun, so no pairing is implied before that. */
  hasSpun = signal(false);
  spinDeg = signal(0);
  /** True for one frame while we snap the wheel back to 0° after a spin, so it doesn't animate backwards. */
  instantReset = signal(false);

  /** The actual bracket tree this order produces (standard crossover seeding, byes, Third Place —
   *  everything `buildBracket` would really build), rendered live with `app-final-bracket` so the
   *  order in the list translates into "who plays whom" instead of just a bare list of names. */
  previewMatches = computed<Match[]>(() => {
    const bracket = previewBracket(this.order().map((s) => ({ id: s.id, name: s.name, logo: s.logo })));
    return bracket.map(
      (b, i): Match => ({
        id: `preview-${i}`,
        tournamentId: '',
        round: b.round,
        groupName: null,
        homeTeamId: b.home.id,
        awayTeamId: b.away.id,
        homeTeamName: b.home.name,
        awayTeamName: b.away.name,
        homeTeamLogo: b.home.logo,
        awayTeamLogo: b.away.logo,
        homeScore: null,
        awayScore: null,
        matchDate: 0,
        matchTime: '',
        location: '',
        status: 'scheduled',
      })
    );
  });

  segAngle = computed(() => 360 / (this.order().length || 1));
  labelFontSize = computed(() => (this.segAngle() < 30 ? '9px' : this.segAngle() < 45 ? '10px' : '12px'));
  wheelBackground = computed(() => {
    const n = this.order().length;
    const angle = this.segAngle();
    const stops = Array.from(
      { length: n },
      (_, i) => `${WHEEL_COLORS[i % WHEEL_COLORS.length]} ${i * angle}deg ${(i + 1) * angle}deg`
    );
    return `conic-gradient(from 0deg, ${stops.join(', ')})`;
  });

  constructor(
    public dialogRef: MatDialogRef<FinalStageSeedDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) public data: FinalStageSeedDialogData
  ) {}

  /** e.g. "Group A · #1" -> "A1". Standings rows don't carry manager/login info, so this is a
   *  simple logo-or-initials avatar rather than the full TeamAvatarService resolution. */
  avatar(s: FinalStageSeed) {
    const base = initialsAvatar(s.name);
    return { ...base, src: isUserImage(s.logo) ? s.logo : null };
  }

  /** "Group A" rank 1 -> "A1"; blank once re-seeding a later round, where groups no longer apply. */
  qualifierLabel(s: FinalStageSeed): string {
    if (!s.groupName || !s.position) return '';
    const letter = s.groupName.replace(/^group\s+/i, '').trim() || s.groupName;
    return `${letter}${s.position}`;
  }

  drop(event: CdkDragDrop<FinalStageSeed[]>): void {
    const arr = [...this.order()];
    moveItemInArray(arr, event.previousIndex, event.currentIndex);
    this.order.set(arr);
  }

  /** Spins the wheel, then draws a fresh full random order in one shot once it settles. */
  spin(): void {
    if (this.spinning()) return;
    this.spinning.set(true);
    this.instantReset.set(false);

    const extraSpins = 4 + Math.floor(Math.random() * 3); // 4–6 full turns for a convincing spin
    const randomOffset = Math.random() * 360;
    this.spinDeg.set(this.spinDeg() + extraSpins * 360 + randomOffset);

    setTimeout(() => {
      this.shuffleOrder();
      this.hasSpun.set(true);
      this.instantReset.set(true);
      this.spinDeg.set(0); // snap back with no transition so the next spin always winds up fresh
      this.spinning.set(false);
      requestAnimationFrame(() => this.instantReset.set(false));
    }, SPIN_MS);
  }

  /** Fisher-Yates shuffle for an unbiased random draw. */
  private shuffleOrder(): void {
    const arr = [...this.order()];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    this.order.set(arr);
  }

  async generate(): Promise<void> {
    if (this.isGenerating()) return;
    this.isGenerating.set(true);
    try {
      await this.finalStage.generate(this.data.tournamentId, this.data.qualifiersPerGroup, this.order());
      this.dialogRef.close(true);
    } finally {
      this.isGenerating.set(false);
    }
  }
}

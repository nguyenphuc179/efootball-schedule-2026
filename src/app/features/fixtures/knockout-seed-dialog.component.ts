import { ChangeDetectionStrategy, Component, Inject, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { FixtureGeneratorService } from './fixture-generator.service';
import { TeamAvatarService } from '../teams/team-avatar.service';
import { Team } from '../../models/team.model';

export interface KnockoutSeedDialogData {
  tournamentId: string;
  teams: Team[];
  startDate: number;
  location: string;
}

type SeedMode = 'random' | 'manual';

/** How long the wheel spins before the pairing is finalised (ms) — keep in sync with the CSS transition below. */
const SPIN_MS = 3200;
/** Cycled around the wheel like a real prize wheel (red/gold/green/blue repeating). */
const WHEEL_COLORS = ['#e5484d', '#f5a623', '#0fa863', '#3b82f6'];

/**
 * Lets an admin set the round-1 bracket order for a knockout tournament before it's generated,
 * picking between two ways to do it: a spin-the-wheel random draw, or manual drag-to-reorder.
 * Round 1 always pairs the resulting list 1v2, 3v4, 5v6, ...
 */
@Component({
  selector: 'app-knockout-seed-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, DragDropModule],
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
              <input type="radio" name="seedMode" class="sr-only" [checked]="mode() === m" (change)="mode.set(m)" />
              <span class="material-icons text-[18px]">{{ m === 'random' ? 'casino' : 'drag_indicator' }}</span>
              {{ m === 'random' ? 'Random' : 'Drag & Drop' }}
            </label>
          }
        </div>

        @if (mode() === 'manual') {
          <p class="text-xs text-gray-400">
            Drag to reorder the seeding. Round 1 pairs 1v2, 3v4, 5v6, …
          </p>

          <div cdkDropList cdkDragLockAxis="y" class="flex flex-col gap-2" (cdkDropListDropped)="drop($event)">
            @for (t of order(); track t.id; let i = $index) {
              <div cdkDrag class="flex items-center gap-3 bg-surface-muted rounded-xl px-3 py-2.5">
                <span class="w-6 text-center text-sm font-extrabold text-gray-400 shrink-0">{{ i + 1 }}</span>
                <span
                  class="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold"
                  [style.background-color]="avatar(t).bg"
                  [style.color]="avatar(t).fg"
                >
                  @if (avatar(t).src; as src) {
                    <img [src]="src" alt="" class="w-full h-full object-cover" referrerpolicy="no-referrer" />
                  } @else {
                    {{ avatar(t).initials }}
                  }
                </span>
                <span class="flex-1 min-w-0 font-semibold text-sm truncate">{{ t.teamName }}</span>
                <span class="material-icons text-gray-300 shrink-0 cursor-move p-1 -m-1" cdkDragHandle>drag_indicator</span>
              </div>
            }
          </div>
        } @else {
          <p class="text-xs text-gray-400 text-center">
            Tap the wheel to draw a random bracket order. Round 1 pairs 1v2, 3v4, 5v6, …
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
              @for (t of order(); track t.id; let i = $index) {
                <div
                  class="absolute top-0 left-1/2 w-0 h-1/2 origin-bottom"
                  [style.transform]="'rotate(' + (i * segAngle() + segAngle() / 2) + 'deg)'"
                >
                  <span
                    class="absolute top-2 left-1/2 -translate-x-1/2 max-w-[84px] truncate text-white font-bold drop-shadow"
                    [style.font-size]="labelFontSize()"
                  >{{ t.teamName }}</span>
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
            <p class="text-xs font-bold text-gray-500 uppercase tracking-wide">Round 1 Match-ups</p>
            @for (pair of roundOnePairs(); track $index; let i = $index) {
              <div class="flex items-center gap-2 bg-surface-muted rounded-xl px-3 py-2">
                <span class="w-4 text-center text-[10px] font-extrabold text-gray-400 shrink-0">{{ i + 1 }}</span>
                <div class="flex-1 min-w-0 flex items-center justify-end gap-1.5">
                  <span class="text-sm font-semibold truncate">{{ pair[0].teamName }}</span>
                  <span
                    class="w-7 h-7 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[10px] font-bold"
                    [style.background-color]="avatar(pair[0]).bg"
                    [style.color]="avatar(pair[0]).fg"
                  >
                    @if (avatar(pair[0]).src; as src) {
                      <img [src]="src" alt="" class="w-full h-full object-cover" referrerpolicy="no-referrer" />
                    } @else {
                      {{ avatar(pair[0]).initials }}
                    }
                  </span>
                </div>

                <span class="text-[10px] font-extrabold text-gray-400 shrink-0">vs</span>

                <div class="flex-1 min-w-0 flex items-center gap-1.5">
                  @if (pair[1]; as away) {
                    <span
                      class="w-7 h-7 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[10px] font-bold"
                      [style.background-color]="avatar(away).bg"
                      [style.color]="avatar(away).fg"
                    >
                      @if (avatar(away).src; as src) {
                        <img [src]="src" alt="" class="w-full h-full object-cover" referrerpolicy="no-referrer" />
                      } @else {
                        {{ avatar(away).initials }}
                      }
                    </span>
                    <span class="text-sm font-semibold truncate">{{ away.teamName }}</span>
                  } @else {
                    <span class="text-xs text-gray-400 italic">Bye</span>
                  }
                </div>
              </div>
            }
          </div>
          }
        }
      </div>
    </div>
  `,
})
export class KnockoutSeedDialogComponent {
  private fixtureGenerator = inject(FixtureGeneratorService);
  private teamAvatars = inject(TeamAvatarService);

  readonly spinMs = SPIN_MS;
  readonly seedModes: SeedMode[] = ['random', 'manual'];

  mode = signal<SeedMode>('random');
  order = signal<Team[]>([...this.data.teams]);
  isGenerating = signal(false);

  spinning = signal(false);
  /** Stays false until the wheel has actually been spun, so no pairing is implied before that. */
  hasSpun = signal(false);
  spinDeg = signal(0);
  /** True for one frame while we snap the wheel back to 0° after a spin, so it doesn't animate backwards. */
  instantReset = signal(false);

  /** The seed order split into round-1 match-ups: 1v2, 3v4, 5v6, ... (a trailing solo team = a bye). */
  roundOnePairs = computed<[Team, Team | undefined][]>(() => {
    const arr = this.order();
    const pairs: [Team, Team | undefined][] = [];
    for (let i = 0; i < arr.length; i += 2) pairs.push([arr[i], arr[i + 1]]);
    return pairs;
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
    public dialogRef: MatDialogRef<KnockoutSeedDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) public data: KnockoutSeedDialogData
  ) {}

  avatar(t: Team) {
    return this.teamAvatars.resolve(t);
  }

  drop(event: CdkDragDrop<Team[]>): void {
    const arr = [...this.order()];
    moveItemInArray(arr, event.previousIndex, event.currentIndex);
    this.order.set(arr);
  }

  /** Spins the wheel, then draws a fresh full random pairing in one shot once it settles. */
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
      await this.fixtureGenerator.generateAndSave(
        this.data.tournamentId,
        'knockout',
        this.order(),
        this.data.startDate,
        this.data.location
      );
      this.dialogRef.close(true);
    } finally {
      this.isGenerating.set(false);
    }
  }
}

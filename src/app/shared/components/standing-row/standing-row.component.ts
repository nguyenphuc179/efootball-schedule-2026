import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StandingRow } from '../../../models/standing.model';

/** Sofascore-style compact standings card — the default mobile view (no data tables on mobile). */
@Component({
  selector: 'app-standing-row',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card flex items-center gap-3 !py-3">
      <div class="w-7 text-center font-bold text-gray-500 shrink-0">{{ row.position }}</div>
      @if (row.teamLogo) {
        <img [src]="row.teamLogo" [alt]="row.teamName" class="w-8 h-8 rounded-full object-cover shrink-0" width="32" height="32" />
      } @else {
        <div class="w-8 h-8 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center shrink-0 font-bold text-xs">
          {{ row.teamName.slice(0, 2).toUpperCase() }}
        </div>
      }
      <div class="flex-1 min-w-0">
        <div class="font-semibold truncate">{{ row.teamName }}</div>
        <div class="text-xs text-gray-500">
          W{{ row.won }} D{{ row.drawn }} L{{ row.lost }} · GD {{ row.goalDifference > 0 ? '+' : '' }}{{ row.goalDifference }}
        </div>
      </div>
      <div class="text-right shrink-0">
        <div class="font-extrabold text-lg leading-none">{{ row.points }}</div>
        <div class="text-[10px] text-gray-400 uppercase tracking-wide">Pts</div>
      </div>
    </div>
  `,
})
export class StandingRowComponent {
  @Input({ required: true }) row!: StandingRow;
}

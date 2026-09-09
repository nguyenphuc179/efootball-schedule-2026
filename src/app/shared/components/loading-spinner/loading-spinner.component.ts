import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [MatProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center justify-center gap-3 py-12 text-gray-400">
      <mat-spinner [diameter]="diameter" color="primary"></mat-spinner>
      @if (label) {
        <span class="text-sm">{{ label }}</span>
      }
    </div>
  `,
})
export class LoadingSpinnerComponent {
  @Input() diameter = 36;
  @Input() label = '';
}

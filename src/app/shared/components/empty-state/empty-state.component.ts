import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center justify-center gap-2 py-12 px-6 text-center">
      <span class="material-icons text-4xl text-gray-300">{{ icon }}</span>
      <p class="font-semibold text-gray-600">{{ title }}</p>
      @if (subtitle) {
        <p class="text-sm text-gray-400">{{ subtitle }}</p>
      }
      <ng-content></ng-content>
    </div>
  `,
})
export class EmptyStateComponent {
  @Input() icon = 'inbox';
  @Input() title = 'Nothing here yet';
  @Input() subtitle = '';
}

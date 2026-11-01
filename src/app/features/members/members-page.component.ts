import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { MembersComponent } from './members.component';

/** `/members` — the admin member-management list as its own page (it used to sit at the bottom of
 *  the personal Profile page, which made that page very long for admins). */
@Component({
  selector: 'app-members-page',
  standalone: true,
  imports: [MembersComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-content-area px-4 pt-4 max-w-2xl mx-auto">
      <h1 class="text-xl font-extrabold mb-4">{{ 'MEMBERS.TITLE' | translate }}</h1>
      <app-members [page]="true" />
    </div>
  `,
})
export class MembersPageComponent {}

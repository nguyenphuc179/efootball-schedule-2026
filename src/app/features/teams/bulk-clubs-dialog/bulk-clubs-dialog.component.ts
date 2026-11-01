import { ChangeDetectionStrategy, Component, Inject, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TeamService } from '../team.service';
import { Team, teamGroup } from '../../../models/team.model';
import { AppSelectComponent, AppSelectOption } from '../../../shared/components/app-select/app-select.component';

export interface BulkClubsDialogData {
  teams: Team[];
}

type Target = 'all' | 'A' | 'B' | 'empty';

/** team_match: paste one club list and apply it to many players at once. */
@Component({
  selector: 'app-bulk-clubs-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, AppSelectComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh w-full flex flex-col bg-white">
      <div class="flex items-center justify-between h-14 px-4 border-b border-gray-100">
        <button class="w-9 h-9 flex items-center justify-center" (click)="dialogRef.close()">
          <span class="material-icons">close</span>
        </button>
        <h1 class="font-bold">{{ 'BULK_CLUBS.TITLE' | translate }}</h1>
        <button class="text-primary-600 font-semibold disabled:text-gray-300" [disabled]="!canApply() || isSaving()" (click)="apply()">
          {{ (isSaving() ? 'COMMON.SAVING' : 'BULK_CLUBS.APPLY') | translate }}
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">{{ 'TEAM_FORM.ALLOWED_CLUBS' | translate }}</span>
          <textarea class="input-field" rows="8" [ngModel]="text()" (ngModelChange)="text.set($event)" placeholder="Real Madrid&#10;Barcelona&#10;Man City"></textarea>
          <span class="text-xs text-gray-400">{{ 'BULK_CLUBS.HINT' | translate }}</span>
        </label>

        <div class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">{{ 'BULK_CLUBS.TARGET' | translate }}</span>
          <app-select [value]="target()" [options]="targetOptions()" (valueChange)="target.set($any($event))" />
          <span class="text-xs text-gray-400">{{ 'BULK_CLUBS.AFFECTS' | translate: { count: affected().length } }}</span>
        </div>

        <label class="flex items-start gap-2 text-sm text-gray-600">
          <input type="checkbox" class="mt-1" [ngModel]="merge()" (ngModelChange)="merge.set($event)" />
          <span>{{ 'BULK_CLUBS.MERGE' | translate }}<br /><span class="text-xs text-gray-400">{{ 'BULK_CLUBS.MERGE_HINT' | translate }}</span></span>
        </label>
      </div>
    </div>
  `,
})
export class BulkClubsDialogComponent {
  private teamService = inject(TeamService);
  private translate = inject(TranslateService);

  text = signal('');
  target = signal<Target>('all');
  merge = signal(false);
  isSaving = signal(false);

  constructor(
    public dialogRef: MatDialogRef<BulkClubsDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) public data: BulkClubsDialogData
  ) {}

  private clubs = computed(() => [...new Set(this.text().split(/[\n,]/).map((c) => c.trim()).filter(Boolean))]);

  affected = computed(() =>
    this.data.teams.filter((t) => {
      switch (this.target()) {
        case 'A': return teamGroup(t) === 'A';
        case 'B': return teamGroup(t) === 'B';
        case 'empty': return !(t.allowedClubs?.length);
        default: return true;
      }
    })
  );

  canApply = computed(() => this.clubs().length > 0 && this.affected().length > 0);

  targetOptions(): AppSelectOption[] {
    this.translate.currentLang();
    return [
      { value: 'all', label: this.translate.instant('BULK_CLUBS.TARGET_ALL') },
      { value: 'A', label: this.translate.instant('TEAM_MATCH.GROUP_A') },
      { value: 'B', label: this.translate.instant('TEAM_MATCH.GROUP_B') },
      { value: 'empty', label: this.translate.instant('BULK_CLUBS.TARGET_EMPTY') },
    ];
  }

  async apply(): Promise<void> {
    if (!this.canApply()) return;
    this.isSaving.set(true);
    try {
      const pasted = this.clubs();
      await Promise.all(
        this.affected().map((t) => {
          const allowedClubs = this.merge() ? [...new Set([...(t.allowedClubs ?? []), ...pasted])] : pasted;
          return this.teamService.update(t.id, { allowedClubs });
        })
      );
      this.dialogRef.close(true);
    } finally {
      this.isSaving.set(false);
    }
  }
}

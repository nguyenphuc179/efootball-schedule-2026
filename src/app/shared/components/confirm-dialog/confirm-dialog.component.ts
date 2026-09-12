import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="font-bold">{{ data.title }}</h2>
    <mat-dialog-content class="text-gray-600">{{ data.message }}</mat-dialog-content>
    <mat-dialog-actions align="end" class="!px-4 !pb-4">
      <button class="btn-secondary mr-2" (click)="dialogRef.close(false)">{{ 'COMMON.CANCEL' | translate }}</button>
      <button
        class="btn-primary"
        [class.!bg-accent-red]="data.destructive"
        (click)="dialogRef.close(true)"
      >
        {{ data.confirmLabel ?? ('COMMON.CONFIRM' | translate) }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ConfirmDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData
  ) {}
}

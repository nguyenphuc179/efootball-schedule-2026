import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="font-bold">{{ data.title }}</h2>
    <mat-dialog-content class="text-gray-600">{{ data.message }}</mat-dialog-content>
    <mat-dialog-actions align="end" class="!px-4 !pb-4">
      <button class="btn-secondary mr-2" (click)="dialogRef.close(false)">Cancel</button>
      <button
        class="btn-primary"
        [class.!bg-accent-red]="data.destructive"
        (click)="dialogRef.close(true)"
      >
        {{ data.confirmLabel ?? 'Confirm' }}
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

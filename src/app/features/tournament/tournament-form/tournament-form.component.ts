import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSelectModule } from '@angular/material/select';
import { TournamentService } from '../tournament.service';
import { ImageUrlFieldComponent } from '../../../shared/components/image-url-field/image-url-field.component';
import { IMAGE_SRC_PATTERN, isImageSrc } from '../../../shared/utils/image-url.util';
import { TournamentType } from '../../../models/tournament.model';

/**
 * Create/Edit tournament. Presented as a full-screen dialog-equivalent route on mobile
 * (see app.routes.ts — it's a dedicated route rather than a MatDialog so it gets its own
 * back-button/history entry, which mobile users expect for a full "page" of form fields).
 *
 * Banner image is an optional external URL (paste a link from Cloudinary/Imgur/etc.) — the
 * project runs on the Spark plan where Firebase Storage is unavailable, so there's no upload.
 */
@Component({
  selector: 'app-tournament-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDatepickerModule, MatSelectModule, ImageUrlFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh flex flex-col bg-white">
      <div class="flex items-center justify-between h-14 px-4 border-b border-gray-100 sticky top-0 bg-white z-10">
        <button class="w-9 h-9 flex items-center justify-center" (click)="cancel()">
          <span class="material-icons">close</span>
        </button>
        <h1 class="font-bold">{{ isEdit() ? 'Edit Tournament' : 'New Tournament' }}</h1>
        <button class="text-primary-600 font-semibold disabled:text-gray-300" [disabled]="form.invalid || isSaving()" (click)="submit()">
          {{ isSaving() ? 'Saving…' : 'Save' }}
        </button>
      </div>

      <form [formGroup]="form" class="flex-1 overflow-y-auto p-4 flex flex-col gap-4 app-content-area">
        <div class="flex flex-col items-center gap-2">
          <div class="w-28 h-28 rounded-2xl bg-surface-muted flex items-center justify-center overflow-hidden">
            @if (imagePreview()) {
              <img [src]="imagePreview()" alt="Banner preview" class="w-full h-full object-cover" (error)="imgError.set(true)" />
            } @else {
              <span class="material-icons text-4xl text-gray-300">image</span>
            }
          </div>
        </div>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">Banner Image <span class="text-gray-400">(optional)</span></span>
          <app-image-url-field [control]="form.controls.image" (changed)="imgError.set(false)" />
          @if (form.controls.image.invalid && form.controls.image.value) {
            <span class="text-xs text-red-500">Paste an image link (http/https) or a copied image.</span>
          } @else if (imgError() && form.controls.image.value) {
            <span class="text-xs text-red-500">That image couldn't be loaded — check the link.</span>
          }
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">Tournament Name</span>
          <input class="input-field" formControlName="name" placeholder="Summer Cup 2026" />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">Description</span>
          <textarea class="input-field" rows="3" formControlName="description" placeholder="Short description"></textarea>
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">Location</span>
          <input class="input-field" formControlName="location" placeholder="City Stadium" />
        </label>

        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-gray-600">Start Date</span>
            <div class="relative">
              <input
                class="input-field !pr-10 cursor-pointer"
                [matDatepicker]="startPicker"
                formControlName="startDate"
                placeholder="Select a date"
                readonly
                (click)="startPicker.open()"
              />
              <mat-datepicker-toggle
                [for]="startPicker"
                class="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400"
              ></mat-datepicker-toggle>
              <mat-datepicker #startPicker />
            </div>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-gray-600">End Date</span>
            <div class="relative">
              <input
                class="input-field !pr-10 cursor-pointer"
                [matDatepicker]="endPicker"
                [min]="form.controls.startDate.value"
                formControlName="endDate"
                placeholder="Select a date"
                readonly
                (click)="endPicker.open()"
              />
              <mat-datepicker-toggle
                [for]="endPicker"
                class="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400"
              ></mat-datepicker-toggle>
              <mat-datepicker #endPicker />
            </div>
          </label>
        </div>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">Number of Teams</span>
          <input class="input-field" type="number" min="2" formControlName="numberOfTeams" />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">Tournament Type</span>
          <mat-select class="input-field !flex items-center" formControlName="type">
            <mat-option value="round_robin">Round Robin</mat-option>
            <mat-option value="knockout">Knockout</mat-option>
            <mat-option value="group_knockout">Group Stage + Knockout</mat-option>
          </mat-select>
        </label>
      </form>
    </div>
  `,
})
export class TournamentFormComponent {
  private fb = inject(FormBuilder);
  private tournamentService = inject(TournamentService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  isSaving = signal(false);
  imgError = signal(false);
  private editingId = this.route.snapshot.paramMap.get('id');
  isEdit = signal(!!this.editingId);

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    description: [''],
    image: ['', Validators.pattern(IMAGE_SRC_PATTERN)],
    location: ['', Validators.required],
    startDate: new FormControl<Date | null>(null, Validators.required),
    endDate: new FormControl<Date | null>(null, Validators.required),
    numberOfTeams: [8, [Validators.required, Validators.min(2)]],
    type: ['round_robin' as TournamentType, Validators.required],
  });

  /** Live preview: only show a valid-looking image src that hasn't failed to load. */
  imagePreview = signal<string | null>(null);

  constructor() {
    this.form.controls.image.valueChanges.pipe(takeUntilDestroyed()).subscribe((url) => {
      this.imagePreview.set(isImageSrc(url) ? url : null);
    });

    if (this.editingId) {
      this.tournamentService.getOnce(this.editingId).then((t) => {
        if (!t) return;
        this.form.patchValue({
          name: t.name,
          description: t.description,
          image: t.image ?? '',
          location: t.location,
          startDate: new Date(t.startDate),
          endDate: new Date(t.endDate),
          numberOfTeams: t.numberOfTeams,
          type: t.type,
        });
      });
    }
  }

  cancel(): void {
    this.router.navigateByUrl(this.editingId ? `/tournaments/${this.editingId}` : '/tournaments');
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.isSaving.set(true);
    try {
      const raw = this.form.getRawValue();
      const draft = {
        name: raw.name,
        description: raw.description,
        location: raw.location,
        startDate: raw.startDate!.getTime(),
        endDate: raw.endDate!.getTime(),
        numberOfTeams: Number(raw.numberOfTeams),
        type: raw.type,
        image: raw.image.trim() || null,
      };

      const id = this.editingId ?? (await this.tournamentService.create(draft));
      if (this.editingId) {
        await this.tournamentService.update(id, draft);
      }
      this.router.navigateByUrl(`/tournaments/${id}`);
    } finally {
      this.isSaving.set(false);
    }
  }
}

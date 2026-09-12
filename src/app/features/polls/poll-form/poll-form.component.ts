import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PollService } from '../poll.service';
import { AuthService } from '../../../core/services/auth.service';

/** Create a poll — a dedicated full-page route (not a dialog) so mobile gets its own back-button
 *  history entry, matching `tournament-form.component.ts`. Polls are immutable once created. */
@Component({
  selector: 'app-poll-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh flex flex-col bg-white">
      <div class="flex items-center justify-between h-14 px-4 border-b border-gray-100 sticky top-0 bg-white z-10">
        <button class="w-9 h-9 flex items-center justify-center" (click)="cancel()">
          <span class="material-icons">close</span>
        </button>
        <h1 class="font-bold">{{ 'POLL_FORM.CREATE_TITLE' | translate }}</h1>
        <button class="text-primary-600 font-semibold disabled:text-gray-300" [disabled]="form.invalid || isSaving()" (click)="save()">
          {{ (isSaving() ? 'COMMON.SAVING' : 'COMMON.SAVE') | translate }}
        </button>
      </div>

      <form [formGroup]="form" class="flex-1 overflow-y-auto p-4 flex flex-col gap-4 app-content-area">
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">{{ 'POLL_FORM.TITLE_LABEL' | translate }}</span>
          <input class="input-field" formControlName="title" [placeholder]="'POLL_FORM.TITLE_PLACEHOLDER' | translate" />
        </label>

        <div class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">{{ 'POLL_FORM.OPTIONS_LABEL' | translate }}</span>
          <div formArrayName="options" class="flex flex-col gap-2">
            @for (ctrl of optionsArray.controls; track $index; let i = $index) {
              <div class="flex items-center gap-2">
                <input
                  class="input-field flex-1"
                  [formControlName]="i"
                  [placeholder]="'POLL_FORM.OPTION_PLACEHOLDER' | translate: { n: i + 1 }"
                />
                @if (optionsArray.length > 2) {
                  <button
                    type="button"
                    class="w-9 h-9 flex items-center justify-center text-gray-400 shrink-0"
                    (click)="removeOption(i)"
                    [attr.aria-label]="'POLL_FORM.REMOVE_OPTION' | translate"
                  >
                    <span class="material-icons text-[18px]">close</span>
                  </button>
                }
              </div>
            }
          </div>
          <button
            type="button"
            class="btn-secondary self-start !py-1.5 !px-3 text-sm flex items-center gap-1 mt-1"
            (click)="addOption()"
          >
            <span class="material-icons text-[18px]">add</span> {{ 'POLL_FORM.ADD_OPTION' | translate }}
          </button>
        </div>

        <label class="flex items-center justify-between gap-3 py-1">
          <span class="text-sm font-medium text-gray-600">{{ 'POLL_FORM.ALLOW_MULTIPLE' | translate }}</span>
          <input type="checkbox" formControlName="allowMultiple" class="w-5 h-5 accent-primary-600" />
        </label>

        @if (errorMsg()) {
          <p class="text-xs text-accent-red">{{ errorMsg() }}</p>
        }
      </form>
    </div>
  `,
})
export class PollFormComponent {
  private fb = inject(FormBuilder);
  private pollService = inject(PollService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private translate = inject(TranslateService);

  isSaving = signal(false);
  errorMsg = signal('');

  form = this.fb.nonNullable.group({
    title: ['', Validators.required],
    allowMultiple: [false],
    options: this.fb.nonNullable.array([
      this.fb.nonNullable.control('', Validators.required),
      this.fb.nonNullable.control('', Validators.required),
    ]),
  });

  get optionsArray() {
    return this.form.controls.options;
  }

  addOption(): void {
    this.optionsArray.push(this.fb.nonNullable.control('', Validators.required));
  }

  removeOption(i: number): void {
    if (this.optionsArray.length > 2) this.optionsArray.removeAt(i);
  }

  cancel(): void {
    this.router.navigateByUrl('/polls');
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;
    const raw = this.form.getRawValue();
    const options = raw.options.map((o) => o.trim()).filter(Boolean);
    if (options.length < 2) {
      this.errorMsg.set(this.translate.instant('POLL_FORM.MIN_OPTIONS_ERROR'));
      return;
    }
    const uid = this.auth.firebaseUser()?.uid;
    if (!uid) return;

    this.errorMsg.set('');
    this.isSaving.set(true);
    try {
      const id = await this.pollService.create({
        title: raw.title.trim(),
        options,
        allowMultiple: raw.allowMultiple,
        createdBy: uid,
        createdByName: this.auth.displayName(),
      });
      this.router.navigate(['/polls', id]);
    } finally {
      this.isSaving.set(false);
    }
  }
}

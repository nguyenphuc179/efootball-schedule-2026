import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { dateLocale } from '../../core/services/language.service';

/** Compact date formatting used across match/tournament cards (e.g. "Sep 20" / "20 thg 9"), in
 *  the app's language. Impure so a language switch re-renders it. */
@Pipe({ name: 'compactDate', standalone: true, pure: false })
export class CompactDatePipe implements PipeTransform {
  private translate = inject(TranslateService);

  transform(value: number | Date | null | undefined): string {
    if (!value) return '';
    const date = typeof value === 'number' ? new Date(value) : value;
    return date.toLocaleDateString(dateLocale(this.translate.currentLang()), { month: 'short', day: 'numeric' });
  }
}

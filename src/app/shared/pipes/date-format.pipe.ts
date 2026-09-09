import { Pipe, PipeTransform } from '@angular/core';

/** Compact date formatting used across match/tournament cards (e.g. "Sep 20"). */
@Pipe({ name: 'compactDate', standalone: true })
export class CompactDatePipe implements PipeTransform {
  transform(value: number | Date | null | undefined): string {
    if (!value) return '';
    const date = typeof value === 'number' ? new Date(value) : value;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
}

import { TranslateService } from '@ngx-translate/core';

/**
 * Localised label for a stored (English) round string:
 * "Group A - Round 1" -> "Round 1" (group prefix stripped), "Round 3" -> "Round 3",
 * "Quarter Final 2" -> "Quarter-final #2", "Final" -> "Final".
 */
export function roundLabel(round: string, translate: TranslateService): string {
  const i = round.lastIndexOf(' - ');
  const tail = i >= 0 ? round.slice(i + 3) : round;
  const n = /^Round (\d+)$/.exec(tail)?.[1];
  if (n) return translate.instant('MATCH.ROUND_N', { n });
  if (i >= 0) return tail;

  const base = round.replace(/ \d+$/, '');
  const num = /(\d+)$/.exec(round)?.[1];
  const roundOf = /^Round of (\d+)$/.exec(base);
  const name =
    base === 'Quarter Final'
      ? translate.instant('MATCH.QUARTER_FINAL')
      : base === 'Semi Final'
        ? translate.instant('MATCH.SEMI_FINAL')
        : base === 'Third Place'
          ? translate.instant('MATCH.THIRD_PLACE')
          : base === 'Final'
            ? translate.instant('MATCH.FINAL')
            : roundOf
              ? translate.instant('MATCH.ROUND_OF', { n: roundOf[1] })
              : base;
  return num && base !== 'Final' ? `${name} #${num}` : name;
}

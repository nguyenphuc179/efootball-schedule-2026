import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Match, matchWinner } from '../../../models/match.model';
import { roundSortKey } from '../../fixtures/final-stage.service';

const BOX_W = 160;
const COL_W = 224;
const SLOT_H = 26;
const BOX_H = SLOT_H * 2;
const V_GAP = 24;
const TOP_PAD = 26; // room for the round headers

const THIRD = 'Third Place';

interface Node {
  match: Match;
  x: number;
  y: number; // top-left
}

/**
 * Single-elimination bracket view for the Final Stage. Columns are rounds; a later-round match
 * is centred between the matches that feed it (edges read off the "Winner/Loser of …" slot
 * labels, so byes are handled). The third-place play-off hangs under the final as a "Bronze match".
 */
@Component({
  selector: 'app-final-bracket',
  standalone: true,
  imports: [NgTemplateOutlet, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overflow-x-auto pb-2">
      <div class="relative" [style.width.px]="layout().width" [style.height.px]="layout().height">
        <svg
          class="absolute inset-0 pointer-events-none"
          [attr.width]="layout().width"
          [attr.height]="layout().height"
        >
          @for (d of layout().paths; track $index) {
            <path [attr.d]="d" fill="none" stroke="#cbd5e1" stroke-width="1.5" />
          }
        </svg>

        @for (h of layout().headers; track h.label) {
          <div
            class="absolute text-[11px] font-extrabold uppercase tracking-wide text-gray-500 text-center"
            [style.left.px]="h.x"
            [style.top.px]="0"
            [style.width.px]="BOX_W"
          >
            {{ h.label }}
          </div>
        }

        @for (n of layout().nodes; track n.match.id) {
          <div
            class="absolute rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden"
            [style.left.px]="n.x"
            [style.top.px]="n.y"
            [style.width.px]="BOX_W"
          >
            <ng-container [ngTemplateOutlet]="slot" [ngTemplateOutletContext]="{ m: n.match, side: 'home' }" />
            <div class="border-t border-gray-100"></div>
            <ng-container [ngTemplateOutlet]="slot" [ngTemplateOutletContext]="{ m: n.match, side: 'away' }" />
          </div>
        }

        @if (thirdPlace(); as tp) {
          <div class="absolute" [style.left.px]="layout().thirdX" [style.top.px]="layout().thirdY - 18">
            <div class="text-[10px] italic font-semibold text-gray-400 mb-1">{{ 'FINAL_BRACKET.BRONZE_MATCH' | translate }}</div>
            <div class="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden" [style.width.px]="BOX_W">
              <ng-container [ngTemplateOutlet]="slot" [ngTemplateOutletContext]="{ m: tp, side: 'home' }" />
              <div class="border-t border-gray-100"></div>
              <ng-container [ngTemplateOutlet]="slot" [ngTemplateOutletContext]="{ m: tp, side: 'away' }" />
            </div>
          </div>
        }
      </div>
    </div>

    <ng-template #slot let-m="m" let-side="side">
      <div
        class="flex items-center gap-1.5 px-2"
        [style.height.px]="SLOT_H"
        [class.bg-primary-50]="side === 'home'"
        [class.font-bold]="winner(m) === side"
      >
        <span class="w-3.5 h-3.5 rounded-sm bg-white/80 overflow-hidden shrink-0">
          @if (logo(m, side)) {
            <img [src]="logo(m, side)" alt="" class="w-full h-full object-cover" referrerpolicy="no-referrer" />
          }
        </span>
        <span class="flex-1 truncate text-[11px]" [class.text-gray-400]="!teamId(m, side)">{{ label(m, side) }}</span>
        @if (played(m)) {
          <span class="text-[11px] font-bold text-right shrink-0 tabular-nums">{{ slotScore(m, side) }}</span>
        }
      </div>
    </ng-template>
  `,
})
export class FinalBracketComponent {
  readonly matches = input.required<Match[]>();
  /** teamId -> manager name; when present the label reads "Club_Manager". */
  readonly managers = input<Record<string, string>>({});

  private translate = inject(TranslateService);

  readonly BOX_W = BOX_W;
  readonly SLOT_H = SLOT_H;

  private ko = computed(() =>
    [...this.matches()]
      .filter((m) => !m.groupName)
      .sort((a, b) => roundSortKey(a.round) - roundSortKey(b.round))
  );

  thirdPlace = computed(() => this.ko().find((m) => m.round === THIRD) ?? null);

  layout = computed(() => {
    this.translate.currentLang();
    const list = this.ko().filter((m) => m.round !== THIRD);
    const num = (r: string) => Number(/ (\d+)$/.exec(r)?.[1] ?? 1);

    // One column per round ("Quarter Final", "Semi Final", "Final"), ordered.
    const groups: { base: string; matches: Match[] }[] = [];
    for (const m of [...list].sort((a, b) => roundSortKey(a.round) - roundSortKey(b.round))) {
      const base = m.round.replace(/ \d+$/, '');
      (groups.find((g) => g.base === base) ?? (groups.push({ base, matches: [] }), groups[groups.length - 1]))
        .matches.push(m);
    }
    groups.forEach((g) => g.matches.sort((a, b) => num(a.round) - num(b.round)));

    if (!groups.length) {
      return { nodes: [] as Node[], paths: [] as string[], headers: [] as { label: string; x: number }[], width: BOX_W, height: TOP_PAD + BOX_H, thirdX: 0, thirdY: 0 };
    }

    // Feeder matches for each later-round match — by position, so it survives result entry
    // (a match's slot names get overwritten with real teams once played).
    const feedersOf = new Map<string, Match[]>();
    for (let i = 1; i < groups.length; i++) {
      const prev = groups[i - 1].matches;
      const halving = prev.length >= groups[i].matches.length * 2;
      groups[i].matches.forEach((m, j) => {
        feedersOf.set(m.round, (halving ? [prev[2 * j], prev[2 * j + 1]] : [prev[j]]).filter(Boolean) as Match[]);
      });
    }

    const colOf = new Map<string, number>();
    groups.forEach((g, i) => g.matches.forEach((m) => colOf.set(m.round, i)));

    const y = new Map<string, number>();
    groups[0].matches.forEach((m, i) => y.set(m.round, TOP_PAD + i * (BOX_H + V_GAP)));
    for (let i = 1; i < groups.length; i++) {
      for (const m of groups[i].matches) {
        const ys = (feedersOf.get(m.round) ?? []).map((f) => y.get(f.round)).filter((v): v is number => v != null);
        y.set(m.round, ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : TOP_PAD);
      }
    }

    const nodes: Node[] = list.map((m) => ({ match: m, x: colOf.get(m.round)! * COL_W, y: y.get(m.round)! }));
    const nodeByRound = new Map(nodes.map((n) => [n.match.round, n]));

    const paths: string[] = [];
    for (const [round, feeders] of feedersOf) {
      const to = nodeByRound.get(round);
      if (!to) continue;
      for (const f of feeders) {
        const from = nodeByRound.get(f.round);
        if (!from) continue;
        const x1 = from.x + BOX_W;
        const y1 = from.y + BOX_H / 2;
        const x2 = to.x;
        const y2 = to.y + BOX_H / 2;
        const midX = x1 + (x2 - x1) / 2;
        paths.push(`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`);
      }
    }

    const firstColLen = groups[0].matches.length;
    const baseHeight = TOP_PAD + firstColLen * (BOX_H + V_GAP) - V_GAP;
    const maxCol = groups.length - 1;
    const hasThird = !!this.thirdPlace();

    return {
      nodes,
      paths,
      headers: groups.map((g, i) => ({ label: this.headerLabel(g.base), x: i * COL_W })),
      width: maxCol * COL_W + BOX_W + 8,
      height: hasThird ? baseHeight + BOX_H + 46 : baseHeight + 8,
      thirdX: maxCol * COL_W,
      thirdY: baseHeight + 30,
    };
  });

  private headerLabel(base: string): string {
    if (base === 'Semi Final') return this.translate.instant('FINAL_BRACKET.SEMI_FINALS');
    if (base === 'Quarter Final') return this.translate.instant('FINAL_BRACKET.QUARTER_FINALS');
    if (base === 'Final') return this.translate.instant('MATCH.FINAL');
    const ro = /^Round of (\d+)$/.exec(base);
    return ro ? this.translate.instant('MATCH.ROUND_OF', { n: ro[1] }) : base;
  }

  teamId(m: Match, side: 'home' | 'away'): string {
    return side === 'home' ? m.homeTeamId : m.awayTeamId;
  }

  logo(m: Match, side: 'home' | 'away'): string | null {
    return (side === 'home' ? m.homeTeamLogo : m.awayTeamLogo) || null;
  }

  label(m: Match, side: 'home' | 'away'): string {
    this.translate.currentLang();
    const raw = side === 'home' ? m.homeTeamName : m.awayTeamName;
    if (!raw) return this.translate.instant('MATCH.TBD');
    if (/^(?:Winner|Loser) /.test(raw)) {
      return raw
        .replace(/^Winner /, this.translate.instant('MATCH.WINNER_ABBR') + ' ')
        .replace(/^Loser /, this.translate.instant('MATCH.LOSER_ABBR') + ' ');
    }
    const manager = this.managers()[this.teamId(m, side)];
    return manager ? `${raw}_${manager}` : raw;
  }

  played(m: Match): boolean {
    return m.homeScore != null && m.awayScore != null && (m.status === 'completed' || m.status === 'live');
  }

  winner(m: Match): 'home' | 'away' | null {
    return this.played(m) ? matchWinner(m) : null;
  }

  /** "1", or "1 (4)" for the pen score when a level match was settled on penalties. */
  slotScore(m: Match, side: 'home' | 'away'): string {
    const goals = side === 'home' ? m.homeScore : m.awayScore;
    if (goals == null) return '';
    const pen = side === 'home' ? m.penaltyHome : m.penaltyAway;
    return m.homeScore === m.awayScore && pen != null ? `${goals} (${pen})` : `${goals}`;
  }
}

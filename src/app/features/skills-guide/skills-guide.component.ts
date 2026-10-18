import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { toSignal } from "@angular/core/rxjs-interop";
import { catchError, map, of } from "rxjs";
import {
  AppSelectComponent,
  AppSelectOption,
} from "../../shared/components/app-select/app-select.component";

type Tier = "standard" | "showtime" | "unreleased" | "prototype";
type Family = "dribble" | "shoot" | "pass" | "defense" | "keeper" | "mental";

interface Skill {
  id: number;
  name: string;
  tier: Tier;
  family: Family;
  /** File name under `assets/skills/img/`, or null when the source had no illustration. */
  image: string | null;
  // The five text fields below may contain `<strong>` (highlighted numbers) — rendered via [innerHTML].
  official: string;
  activation: string;
  effect: string;
  explanation: string;
  mechanism: string;
  impactType: string;
  limit: string;
  techId: string;
  /** Pre-normalised (lowercase, no diacritics) haystack for the search box. */
  search: string;
}

interface Option<T extends string> {
  value: T | "all";
  label: string;
  icon?: string;
}

const TIERS: Option<Tier>[] = [
  { value: "all", label: "Tất cả" },
  { value: "standard", label: "Standard" },
  { value: "showtime", label: "Show Time" },
  { value: "unreleased", label: "Chưa phát hành" },
  { value: "prototype", label: "Prototype" },
];

const FAMILIES: Option<Family>[] = [
  { value: "all", label: "Tất cả", icon: "apps" },
  { value: "dribble", label: "Rê bóng", icon: "directions_run" },
  { value: "shoot", label: "Dứt điểm", icon: "sports_soccer" },
  { value: "pass", label: "Chuyền bóng", icon: "swap_horiz" },
  { value: "defense", label: "Phòng ngự", icon: "shield" },
  { value: "keeper", label: "Thủ môn", icon: "sports_handball" },
  { value: "mental", label: "Tinh thần", icon: "psychology" },
];

/** Badge colours per tier — only tint classes that styles.scss already remaps for dark mode. */
const TIER_BADGE: Record<Tier, string> = {
  standard: "bg-primary-50 text-primary-700",
  showtime: "bg-amber-50 text-amber-700",
  unreleased: "bg-surface-muted text-gray-500",
  prototype: "bg-red-50 text-accent-red",
};

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .trim();

/**
 * "/skills" — Vietnamese reference for all 79 eFootball player skills (activation, effect,
 * mechanism, technical ids), filterable by tier / family / free text. Public route like "/guide".
 *
 * Data lives in `assets/skills/skills.json` + `assets/skills/img/*.webp` (extracted from the
 * original standalone HTML) rather than in this bundle, so the ~1.7MB of content is only fetched
 * when someone actually opens the page, and the service worker caches it lazily.
 */
@Component({
  selector: "app-skills-guide",
  standalone: true,
  imports: [AppSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-content-area">
      <!-- Hero -->
      <div
        class="px-4 pt-8 pb-6 flex flex-col items-center text-center gap-2 bg-gradient-to-b from-primary-50 to-transparent"
      >
        <span
          class="w-14 h-14 rounded-2xl bg-primary-500 text-white flex items-center justify-center shadow-card"
        >
          <span class="material-icons text-[30px]">auto_awesome</span>
        </span>
        <h1 class="text-2xl font-extrabold">Bộ kỹ năng eFootball</h1>
        <p class="text-sm text-gray-500 max-w-md">
          Tên Skill giữ nguyên tiếng Anh · Điều kiện kích hoạt, hiệu ứng và cơ
          chế giải thích bằng tiếng Việt.
        </p>
        <div class="flex flex-wrap justify-center gap-1.5 mt-1">
          @for (t of tierSummary; track t.value) {
            <span class="badge" [class]="tierBadge[t.value]">
              <b>{{ tierCount()[t.value] || 0 }}</b>&nbsp;{{ t.label }}
            </span>
          }
        </div>
      </div>

      <!-- Search + filters (sticky under the app header) -->
      <div
        class="sticky top-14 z-10 bg-white/95 backdrop-blur border-b border-gray-100"
      >
        <div class="max-w-5xl mx-auto px-4 py-3 flex flex-col gap-2">
          <label class="relative block">
            <span
              class="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]"
              >search</span
            >
            <input
              type="search"
              class="input-field !py-2.5 !pl-10 text-sm"
              placeholder="Tìm tên Skill, hiệu ứng, chỉ số, điều kiện..."
              autocomplete="off"
              aria-label="Tìm Skill"
              [value]="query()"
              (input)="query.set($any($event.target).value)"
            />
          </label>
          <!-- Mobile: two compact dropdowns instead of horizontally-scrolling chip rows -->
          <div class="grid grid-cols-2 gap-2 md:hidden">
            <app-select
              [options]="tierSelectOptions"
              [value]="tier()"
              (valueChange)="tier.set($any($event))"
              ariaLabel="Lọc theo loại"
            />
            <app-select
              [options]="familySelectOptions"
              [value]="family()"
              (valueChange)="family.set($any($event))"
              ariaLabel="Lọc theo nhóm"
            />
          </div>
          <div class="hidden md:flex flex-wrap gap-1.5">
            @for (t of tiers; track t.value) {
              <button
                type="button"
                class="badge shrink-0 !py-1.5 !px-3"
                [class]="
                  tier() === t.value
                    ? 'bg-primary-500 text-white'
                    : 'bg-surface-muted text-gray-600'
                "
                [attr.aria-pressed]="tier() === t.value"
                (click)="tier.set(t.value)"
              >
                {{ t.label }}
              </button>
            }
          </div>
          <div class="hidden md:flex flex-wrap gap-1.5">
            @for (f of families; track f.value) {
              <button
                type="button"
                class="badge shrink-0 !py-1.5 !px-3 flex items-center gap-1"
                [class]="
                  family() === f.value
                    ? 'bg-primary-500 text-white'
                    : 'bg-surface-muted text-gray-600'
                "
                [attr.aria-pressed]="family() === f.value"
                (click)="family.set(f.value)"
              >
                <span class="material-icons text-[14px]">{{ f.icon }}</span>
                {{ f.label }}
              </button>
            }
          </div>
        </div>
      </div>

      <div class="max-w-5xl mx-auto px-4 py-4 flex flex-col gap-3">
        <div class="flex items-center justify-between text-xs text-gray-500">
          <span
            ><b class="text-gray-800">{{ filtered().length }}</b> /
            {{ skills().length }} Skill</span
          >
          @if (hasFilter()) {
            <button
              type="button"
              class="font-semibold text-primary-600 flex items-center gap-0.5"
              (click)="clear()"
            >
              <span class="material-icons text-[16px]">close</span> Xóa bộ lọc
            </button>
          }
        </div>

        @if (loadFailed()) {
          <div class="card text-center text-sm text-gray-500 py-10">
            Không tải được dữ liệu kỹ năng — kiểm tra kết nối và thử lại.
          </div>
        }

        <div class="grid gap-3 md:grid-cols-2">
          @for (s of filtered(); track s.id) {
            <article class="card flex flex-col gap-3">
              <div class="flex gap-3 items-start">
                <div
                  class="w-[84px] h-[60px] shrink-0 rounded-lg overflow-hidden bg-surface-muted flex items-center justify-center"
                >
                  @if (s.image) {
                    <img
                      [src]="'assets/skills/img/' + s.image"
                      [alt]="'Minh họa ' + s.name"
                      loading="lazy"
                      decoding="async"
                      class="w-full h-full object-cover"
                    />
                  } @else {
                    <span class="material-icons text-gray-300 text-[28px]">{{
                      familyIcon[s.family]
                    }}</span>
                  }
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-1 mb-1">
                    <span class="text-[10px] font-bold text-gray-400"
                      >#{{ s.id < 10 ? "0" + s.id : s.id }}</span
                    >
                    <span class="badge !text-[10px]" [class]="tierBadge[s.tier]">{{
                      tierLabel[s.tier]
                    }}</span>
                    <span
                      class="badge !text-[10px] bg-surface-muted text-gray-500 flex items-center gap-0.5"
                    >
                      <span class="material-icons text-[12px]">{{
                        familyIcon[s.family]
                      }}</span>
                      {{ familyLabel[s.family] }}
                    </span>
                  </div>
                  <h2 class="font-extrabold leading-tight">{{ s.name }}</h2>
                </div>
              </div>

              <p
                class="text-sm text-gray-600 border-l-2 border-primary-300 pl-2.5 skill-rich"
                [innerHTML]="s.official"
              ></p>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div class="rounded-lg bg-surface-muted p-2.5">
                  <div
                    class="text-[10px] font-extrabold uppercase tracking-wide text-gray-400 flex items-center gap-1 mb-0.5"
                  >
                    <span class="material-icons text-[13px]">bolt</span> Khi
                    kích hoạt
                  </div>
                  <p class="text-xs skill-rich" [innerHTML]="s.activation"></p>
                </div>
                <div class="rounded-lg bg-primary-50 p-2.5">
                  <div
                    class="text-[10px] font-extrabold uppercase tracking-wide text-primary-700 flex items-center gap-1 mb-0.5"
                  >
                    <span class="material-icons text-[13px]">trending_up</span>
                    Hiệu ứng chính
                  </div>
                  <p class="text-xs skill-rich" [innerHTML]="s.effect"></p>
                </div>
              </div>

              <details class="group border-t border-gray-100 pt-2">
                <summary
                  class="cursor-pointer list-none flex items-center justify-between text-xs font-semibold text-gray-500 select-none"
                >
                  Giải thích &amp; thông số kỹ thuật
                  <span
                    class="material-icons text-[18px] transition-transform group-open:rotate-180"
                    >expand_more</span
                  >
                </summary>
                <div class="flex flex-col gap-2 pt-2 text-xs">
                  <div>
                    <div class="font-bold text-gray-700 mb-0.5">Giải thích</div>
                    <p class="text-gray-600 skill-rich" [innerHTML]="s.explanation"></p>
                  </div>
                  <div>
                    <div class="font-bold text-gray-700 mb-0.5">
                      Cơ chế / công thức
                    </div>
                    <p class="text-gray-600 skill-rich" [innerHTML]="s.mechanism"></p>
                  </div>
                  <div class="flex flex-col gap-0.5 text-gray-500">
                    @if (s.impactType) {
                      <span><b>Loại tác động:</b> {{ s.impactType }}</span>
                    }
                    @if (s.limit) {
                      <span><b>Giới hạn:</b> {{ s.limit }}</span>
                    }
                  </div>
                  <div class="font-mono text-[10px] text-gray-400 break-all">
                    {{ s.techId }}
                  </div>
                </div>
              </details>
            </article>
          }
        </div>

        @if (skills().length && !filtered().length) {
          <div class="card text-center py-10 flex flex-col items-center gap-1">
            <span class="material-icons text-gray-300 text-[36px]">search_off</span>
            <div class="font-bold text-sm">Không tìm thấy Skill phù hợp</div>
            <p class="text-xs text-gray-500">
              Thử từ khóa khác hoặc chọn “Xóa bộ lọc”.
            </p>
          </div>
        }

        <p class="text-[11px] text-gray-400 leading-relaxed pt-2 pb-6">
          <b>Lưu ý về nguồn:</b> nội dung được biên dịch và trình bày lại từ dữ
          liệu cộng đồng, không phải tài liệu đã được KONAMI xác minh. Ngưỡng
          kích hoạt, chỉ số cộng/trừ và thông tin Prototype phản ánh dữ liệu
          nguồn.
        </p>
      </div>
    </div>
  `,
  styles: `
    /* Highlighted numbers inside the [innerHTML] text (e.g. "+5", "0,20 giây"). */
    :host ::ng-deep .skill-rich strong {
      font-weight: 700;
      color: #0b8a51;
    }
    :host-context(html.dark) ::ng-deep .skill-rich strong {
      color: #63d69a;
    }
    details > summary::-webkit-details-marker {
      display: none;
    }
  `,
})
export class SkillsGuideComponent {
  private http = inject(HttpClient);

  readonly tiers = TIERS;
  readonly families = FAMILIES;
  readonly tierSelectOptions: AppSelectOption[] = TIERS.map((t) => ({
    value: t.value,
    label: t.value === "all" ? "Tất cả loại" : t.label,
  }));
  readonly familySelectOptions: AppSelectOption[] = FAMILIES.map((f) => ({
    value: f.value,
    label: f.value === "all" ? "Tất cả nhóm" : f.label,
  }));
  readonly tierSummary = TIERS.filter((t) => t.value !== "all") as { value: Tier; label: string }[];
  readonly tierBadge = TIER_BADGE;
  readonly tierLabel = Object.fromEntries(TIERS.map((t) => [t.value, t.label]));
  readonly familyLabel = Object.fromEntries(FAMILIES.map((f) => [f.value, f.label]));
  readonly familyIcon = Object.fromEntries(FAMILIES.map((f) => [f.value, f.icon!]));

  readonly loadFailed = signal(false);
  readonly skills = toSignal(
    this.http.get<Skill[]>("assets/skills/skills.json").pipe(
      catchError(() => {
        this.loadFailed.set(true);
        return of([] as Skill[]);
      }),
      map((list) => list ?? []),
    ),
    { initialValue: [] as Skill[] },
  );

  readonly query = signal("");
  readonly tier = signal<Tier | "all">("all");
  readonly family = signal<Family | "all">("all");

  readonly tierCount = computed(() => {
    const counts: Record<string, number> = {};
    for (const s of this.skills()) counts[s.tier] = (counts[s.tier] ?? 0) + 1;
    return counts;
  });

  readonly hasFilter = computed(
    () => !!this.query().trim() || this.tier() !== "all" || this.family() !== "all",
  );

  readonly filtered = computed(() => {
    const q = normalize(this.query());
    const tier = this.tier();
    const family = this.family();
    return this.skills().filter(
      (s) =>
        (tier === "all" || s.tier === tier) &&
        (family === "all" || s.family === family) &&
        (!q || s.search.includes(q)),
    );
  });

  clear(): void {
    this.query.set("");
    this.tier.set("all");
    this.family.set("all");
  }
}

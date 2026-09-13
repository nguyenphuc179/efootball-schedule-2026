import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  signal,
} from "@angular/core";

interface GuideSection {
  id: string;
  label: string;
}

const SECTIONS: GuideSection[] = [
  { id: "login", label: "1. Đăng nhập" },
  { id: "home", label: "2. Trang chủ" },
  { id: "tournaments", label: "3. Giải đấu" },
  { id: "teams", label: "4. Đội bóng" },
  { id: "lineup", label: "5. Đội hình" },
  { id: "results", label: "6. Kết quả" },
  { id: "ranking", label: "7. Xếp hạng" },
  { id: "fame", label: "8. Vinh danh" },
  { id: "polls", label: "9. Bình chọn" },
  { id: "notifications", label: "10. Thông báo" },
  { id: "roles", label: "11. Quyền hạn" },
];

/**
 * "/guide" — a single, fully hardcoded page walking a new user through every screen in the app
 * (login → home → tournaments → teams → lineups → results → ranking → hall of fame → polls →
 * notifications → roles). No data fetching, no i18n — every mockup below is a hand-built,
 * simplified recreation of the real screen using the exact same Tailwind/`.card`/`.badge` classes
 * the real components use, so it inherits light/dark theming automatically and stays visually
 * faithful without needing a real (auth-gated) screenshot. Public route (no guard) — a prospective
 * user should be able to read this before ever signing in.
 *
 * Table-of-contents nav (mobile: horizontal chip row; `md:` and up: a vertical sidebar, like a
 * Word navigation pane) jumps via `jumpTo()` + `scrollIntoView` rather than plain `<a href="#id">`
 * — this app's `index.html` sets `<base href="/">`, which makes the browser resolve a bare
 * fragment-only `href="#id"` against that base (i.e. `/#id`) instead of the current URL
 * (`/guide#id`), so a plain anchor would navigate away to "/" with the fragment instead of
 * scrolling within this page. An `IntersectionObserver` (`ngAfterViewInit`) highlights whichever
 * section is currently in view as the user scrolls, mirroring that same nav-pane behavior.
 */
@Component({
  selector: "app-guide",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-content-area scroll-smooth">
      <!-- Hero -->
      <div
        class="px-4 pt-8 pb-6 flex flex-col items-center text-center gap-2 bg-gradient-to-b from-primary-50 to-transparent"
      >
        <img src="assets/images/logo-mark.png" alt="" class="w-14 h-14" />
        <h1 class="text-2xl font-extrabold">Hướng dẫn sử dụng Pession</h1>
        <p class="text-sm text-gray-500 max-w-sm"></p>
      </div>

      <!-- Quick jump — mobile: horizontal chip row -->
      <nav
        class="md:hidden sticky top-14 z-10 bg-white/95 backdrop-blur border-b border-gray-100 px-4 py-2 flex gap-2 overflow-x-auto"
      >
        @for (s of sections; track s.id) {
          <button
            type="button"
            class="shrink-0 badge"
            [class]="
              activeId() === s.id
                ? 'bg-primary-500 text-white'
                : 'bg-surface-muted text-gray-600'
            "
            (click)="jumpTo(s.id, $event)"
          >
            {{ s.label }}
          </button>
        }
      </nav>

      <div class="px-4 py-6 max-w-4xl mx-auto flex gap-8 items-start">
        <!-- Quick jump — desktop: vertical sidebar, like a Word navigation pane -->
        <aside
          class="hidden md:flex md:flex-col md:w-48 md:sticky md:top-20 shrink-0 gap-0.5"
        >
          @for (s of sections; track s.id) {
            <button
              type="button"
              class="text-left px-3 py-2 rounded-lg text-sm transition-colors"
              [class]="
                activeId() === s.id
                  ? 'bg-primary-50 text-primary-700 font-semibold'
                  : 'text-gray-500 font-medium hover:bg-gray-100 hover:text-gray-800'
              "
              (click)="jumpTo(s.id, $event)"
            >
              {{ s.label }}
            </button>
          }
        </aside>

        <div class="flex-1 min-w-0 flex flex-col gap-10">
          <!-- 1. Đăng nhập -->
          <section id="login" class="scroll-mt-16 flex flex-col gap-3">
            <div class="flex items-center gap-2">
              <span
                class="w-8 h-8 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center shrink-0"
              >
                <span class="material-icons text-[18px]">login</span>
              </span>
              <h2 class="font-extrabold">1. Đăng nhập</h2>
            </div>
            <p class="text-sm text-gray-500">
              Dùng tài khoản Google — không cần đăng ký riêng. Lần đầu vào app,
              tài khoản mới sẽ ở vai trò <b>Thành viên</b> cho tới khi admin
              nâng quyền.
            </p>
            <div
              class="rounded-2xl border border-gray-100 shadow-card overflow-hidden"
            >
              <div class="h-6 flex items-center gap-1.5 px-3 bg-gray-100">
                <span class="w-2 h-2 rounded-full bg-red-300"></span>
                <span class="w-2 h-2 rounded-full bg-amber-300"></span>
                <span class="w-2 h-2 rounded-full bg-primary-300"></span>
              </div>
              <div class="bg-white p-8 flex flex-col items-center gap-3">
                <img
                  src="assets/images/logo-mark.png"
                  alt=""
                  class="w-10 h-10"
                />
                <div class="font-extrabold">Pession</div>
                <span
                  class="btn-secondary !w-auto flex items-center gap-2 !py-2.5 !px-5 text-sm"
                >
                  <span
                    class="w-5 h-5 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[10px] font-black text-blue-500"
                    >G</span
                  >
                  Đăng nhập với Google
                </span>
              </div>
            </div>
          </section>

          <!-- 2. Trang chủ -->
          <section id="home" class="scroll-mt-16 flex flex-col gap-3">
            <div class="flex items-center gap-2">
              <span
                class="w-8 h-8 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center shrink-0"
              >
                <span class="material-icons text-[18px]">home</span>
              </span>
              <h2 class="font-extrabold">2. Trang chủ</h2>
            </div>
            <p class="text-sm text-gray-500">
              Tổng quan riêng cho bạn: đội bạn quản lý, trận sắp tới và kết quả
              gần nhất. Admin thấy thêm tổng quan toàn hệ thống.
            </p>
            <div
              class="rounded-2xl border border-gray-100 shadow-card overflow-hidden"
            >
              <div class="h-6 flex items-center gap-1.5 px-3 bg-gray-100">
                <span class="w-2 h-2 rounded-full bg-red-300"></span>
                <span class="w-2 h-2 rounded-full bg-amber-300"></span>
                <span class="w-2 h-2 rounded-full bg-primary-300"></span>
              </div>
              <div class="bg-white p-4 flex flex-col gap-2.5">
                <div
                  class="text-xs font-extrabold uppercase tracking-wide text-gray-400"
                >
                  Đội của tôi
                </div>
                <div
                  class="flex items-center gap-2 p-2 rounded-lg bg-surface-muted"
                >
                  <span
                    class="w-7 h-7 rounded-full bg-primary-500 text-white flex items-center justify-center text-[11px] font-bold shrink-0"
                    >T9</span
                  >
                  <div class="flex-1 min-w-0">
                    <div class="text-xs font-semibold truncate">Team 9</div>
                    <div class="text-[10px] text-gray-400">Hạng 3 · 3 điểm</div>
                  </div>
                </div>
                <div
                  class="text-xs font-extrabold uppercase tracking-wide text-gray-400 mt-1"
                >
                  Sắp diễn ra
                </div>
                <div
                  class="flex items-center gap-2 p-2 rounded-lg bg-surface-muted text-xs"
                >
                  <span class="flex-1 text-right font-semibold truncate"
                    >Team 9</span
                  >
                  <span class="text-gray-400 shrink-0">- : -</span>
                  <span class="flex-1 font-semibold truncate">Team 3</span>
                </div>
              </div>
            </div>
          </section>

          <!-- 3. Giải đấu -->
          <section id="tournaments" class="scroll-mt-16 flex flex-col gap-3">
            <div class="flex items-center gap-2">
              <span
                class="w-8 h-8 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center shrink-0"
              >
                <span class="material-icons text-[18px]">emoji_events</span>
              </span>
              <h2 class="font-extrabold">3. Giải đấu</h2>
            </div>
            <p class="text-sm text-gray-500">
              Mỗi giải đấu có nhiều tab: Tổng quan, Đội bóng, Đội hình thi đấu,
              Vòng bảng/Loại trực tiếp, Bảng xếp hạng, Thống kê. Vuốt ngang
              thanh tab để xem hết.
            </p>
            <div
              class="rounded-2xl border border-gray-100 shadow-card overflow-hidden"
            >
              <div
                class="h-16 bg-gradient-to-br from-primary-500 to-primary-700 flex items-end p-3"
              >
                <div class="text-white font-extrabold text-sm">
                  EF 2026 - Season 2
                </div>
              </div>
              <div
                class="flex gap-1.5 px-2 py-2 overflow-x-auto text-[10px] font-bold whitespace-nowrap border-b border-gray-100 bg-white"
              >
                <span
                  class="px-2 py-1 rounded-full bg-primary-500 text-white shrink-0"
                  >Tổng quan</span
                >
                <span
                  class="px-2 py-1 rounded-full bg-surface-muted text-gray-500 shrink-0"
                  >Đội bóng</span
                >
                <span
                  class="px-2 py-1 rounded-full bg-surface-muted text-gray-500 shrink-0"
                  >Đội hình</span
                >
                <span
                  class="px-2 py-1 rounded-full bg-surface-muted text-gray-500 shrink-0"
                  >Vòng bảng</span
                >
                <span
                  class="px-2 py-1 rounded-full bg-surface-muted text-gray-500 shrink-0"
                  >Loại trực tiếp</span
                >
                <span
                  class="px-2 py-1 rounded-full bg-surface-muted text-gray-500 shrink-0"
                  >Xếp hạng</span
                >
                <span
                  class="px-2 py-1 rounded-full bg-surface-muted text-gray-500 shrink-0"
                  >Thống kê</span
                >
              </div>
            </div>
          </section>

          <!-- 4. Đội bóng -->
          <section id="teams" class="scroll-mt-16 flex flex-col gap-3">
            <div class="flex items-center gap-2">
              <span
                class="w-8 h-8 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center shrink-0"
              >
                <span class="material-icons text-[18px]">groups</span>
              </span>
              <h2 class="font-extrabold">4. Đội bóng &amp; cầu thủ</h2>
            </div>
            <p class="text-sm text-gray-500">
              Admin tạo đội và gán người quản lý. Người quản lý đội có thể tự
              thêm/xoá cầu thủ trong đội của mình.
            </p>
            <div
              class="rounded-2xl border border-gray-100 shadow-card overflow-hidden"
            >
              <div class="h-6 flex items-center gap-1.5 px-3 bg-gray-100">
                <span class="w-2 h-2 rounded-full bg-red-300"></span>
                <span class="w-2 h-2 rounded-full bg-amber-300"></span>
                <span class="w-2 h-2 rounded-full bg-primary-300"></span>
              </div>
              <div class="bg-white p-3 flex flex-col gap-2">
                <div
                  class="flex items-center gap-2 p-2 rounded-lg bg-surface-muted"
                >
                  <span
                    class="w-8 h-8 rounded-full bg-blue-400 text-white flex items-center justify-center text-xs font-bold shrink-0"
                    >T2</span
                  >
                  <div class="min-w-0">
                    <div class="text-xs font-semibold truncate">Team 2</div>
                    <div class="text-[10px] text-gray-400 truncate">
                      Quản lý: 13DTH17 · 8 cầu thủ
                    </div>
                  </div>
                </div>
                <div
                  class="flex items-center gap-2 p-2 rounded-lg bg-surface-muted"
                >
                  <span
                    class="w-8 h-8 rounded-full bg-amber-400 text-white flex items-center justify-center text-xs font-bold shrink-0"
                    >T9</span
                  >
                  <div class="min-w-0">
                    <div class="text-xs font-semibold truncate">Team 9</div>
                    <div class="text-[10px] text-gray-400 truncate">
                      Quản lý: PhucNT18 · 7 cầu thủ
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- 5. Đội hình thi đấu -->
          <section id="lineup" class="scroll-mt-16 flex flex-col gap-3">
            <div class="flex items-center gap-2">
              <span
                class="w-8 h-8 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center shrink-0"
              >
                <span class="material-icons text-[18px]">photo_camera</span>
              </span>
              <h2 class="font-extrabold">5. Đội hình thi đấu</h2>
            </div>
            <p class="text-sm text-gray-500">
              Mỗi đội có 4 ô ảnh đội hình. Ảnh có thể tự động gửi lên từ
              <b>tool chụp ảnh</b>, hoặc admin tải ảnh thủ công nếu quản lý
              không dùng được tool.
            </p>
            <div
              class="rounded-2xl border border-gray-100 shadow-card overflow-hidden"
            >
              <div class="h-6 flex items-center gap-1.5 px-3 bg-gray-100">
                <span class="w-2 h-2 rounded-full bg-red-300"></span>
                <span class="w-2 h-2 rounded-full bg-amber-300"></span>
                <span class="w-2 h-2 rounded-full bg-primary-300"></span>
              </div>
              <div class="bg-white p-4">
                <div class="grid grid-cols-4 gap-2">
                  <div
                    class="aspect-square rounded-lg bg-surface-muted flex items-center justify-center text-gray-300"
                  >
                    <span class="material-icons text-[20px]">image</span>
                  </div>
                  <div
                    class="aspect-square rounded-lg bg-surface-muted flex items-center justify-center text-gray-300"
                  >
                    <span class="material-icons text-[20px]">image</span>
                  </div>
                  <div
                    class="aspect-square rounded-lg bg-surface-muted flex items-center justify-center text-gray-300"
                  >
                    <span class="material-icons text-[20px]">image</span>
                  </div>
                  <div
                    class="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-300"
                  >
                    <span class="material-icons text-[20px]">add_a_photo</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- 6. Nhập kết quả -->
          <section id="results" class="scroll-mt-16 flex flex-col gap-3">
            <div class="flex items-center gap-2">
              <span
                class="w-8 h-8 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center shrink-0"
              >
                <span class="material-icons text-[18px]">sports_soccer</span>
              </span>
              <h2 class="font-extrabold">6. Nhập / sửa kết quả</h2>
            </div>
            <p class="text-sm text-gray-500">
              Admin nhập được mọi trận. Quản lý đội nhập được kết quả trận
              <b>của chính đội mình</b> — kể cả sửa lại sau khi trận đã kết
              thúc.
            </p>
            <div
              class="rounded-2xl border border-gray-100 shadow-card overflow-hidden"
            >
              <div class="h-6 flex items-center gap-1.5 px-3 bg-gray-100">
                <span class="w-2 h-2 rounded-full bg-red-300"></span>
                <span class="w-2 h-2 rounded-full bg-amber-300"></span>
                <span class="w-2 h-2 rounded-full bg-primary-300"></span>
              </div>
              <div class="bg-white">
                <div class="p-4 flex items-center justify-center gap-5">
                  <div class="flex flex-col items-center gap-1">
                    <span
                      class="w-9 h-9 rounded-full bg-primary-500 text-white flex items-center justify-center text-[11px] font-bold"
                      >T9</span
                    >
                    <span class="text-[10px] font-semibold">Team 9</span>
                    <span class="text-xl font-extrabold">3</span>
                  </div>
                  <span class="text-gray-300 font-bold text-xs">VS</span>
                  <div class="flex flex-col items-center gap-1">
                    <span
                      class="w-9 h-9 rounded-full bg-amber-400 text-white flex items-center justify-center text-[11px] font-bold"
                      >T3</span
                    >
                    <span class="text-[10px] font-semibold">Team 3</span>
                    <span class="text-xl font-extrabold">1</span>
                  </div>
                </div>
                <div class="px-4 pb-3">
                  <span
                    class="btn-primary w-full !py-2 text-xs flex items-center justify-center"
                    >Lưu kết quả</span
                  >
                </div>
              </div>
            </div>
          </section>

          <!-- 7. Xếp hạng -->
          <section id="ranking" class="scroll-mt-16 flex flex-col gap-3">
            <div class="flex items-center gap-2">
              <span
                class="w-8 h-8 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center shrink-0"
              >
                <span class="material-icons text-[18px]">leaderboard</span>
              </span>
              <h2 class="font-extrabold">7. Xếp hạng</h2>
            </div>
            <p class="text-sm text-gray-500">
              Bảng xếp hạng tổng của tất cả quản lý, gộp điểm từ mọi giải đấu họ
              tham gia — không phải bảng xếp hạng riêng của 1 giải.
            </p>
            <div
              class="rounded-2xl border border-gray-100 shadow-card overflow-hidden"
            >
              <div class="h-6 flex items-center gap-1.5 px-3 bg-gray-100">
                <span class="w-2 h-2 rounded-full bg-red-300"></span>
                <span class="w-2 h-2 rounded-full bg-amber-300"></span>
                <span class="w-2 h-2 rounded-full bg-primary-300"></span>
              </div>
              <div class="bg-white p-4 flex items-end justify-center gap-3">
                <div class="flex flex-col items-center gap-1">
                  <span
                    class="w-8 h-8 rounded-full bg-gray-300 text-white flex items-center justify-center text-[11px] font-bold"
                    >2</span
                  >
                  <div class="w-14 h-10 bg-surface-muted rounded-t-lg"></div>
                </div>
                <div class="flex flex-col items-center gap-1">
                  <span
                    class="w-9 h-9 rounded-full bg-amber-400 text-white flex items-center justify-center text-xs font-bold"
                    >1</span
                  >
                  <div class="w-16 h-14 bg-amber-100 rounded-t-lg"></div>
                </div>
                <div class="flex flex-col items-center gap-1">
                  <span
                    class="w-8 h-8 rounded-full bg-orange-300 text-white flex items-center justify-center text-[11px] font-bold"
                    >3</span
                  >
                  <div class="w-14 h-8 bg-surface-muted rounded-t-lg"></div>
                </div>
              </div>
            </div>
          </section>

          <!-- 8. Đại sảnh Vinh danh -->
          <section id="fame" class="scroll-mt-16 flex flex-col gap-3">
            <div class="flex items-center gap-2">
              <span
                class="w-8 h-8 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center shrink-0"
              >
                <span class="material-icons text-[18px]">military_tech</span>
              </span>
              <h2 class="font-extrabold">8. Đại sảnh Vinh danh</h2>
            </div>
            <p class="text-sm text-gray-500">
              Lưu lại nhà vô địch của từng mùa giải — chỉ admin thêm/sửa được.
            </p>
            <div
              class="rounded-2xl border border-gray-100 shadow-card overflow-hidden"
            >
              <div class="h-6 flex items-center gap-1.5 px-3 bg-gray-100">
                <span class="w-2 h-2 rounded-full bg-red-300"></span>
                <span class="w-2 h-2 rounded-full bg-amber-300"></span>
                <span class="w-2 h-2 rounded-full bg-primary-300"></span>
              </div>
              <div class="bg-white p-4 flex flex-col items-center gap-1.5">
                <span class="material-icons text-amber-400 text-[22px]"
                  >emoji_events</span
                >
                <div
                  class="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-200 to-amber-500 flex items-center justify-center"
                >
                  <span class="material-icons text-white text-[26px]"
                    >person</span
                  >
                </div>
                <div class="text-xs font-extrabold">PHUCNT18</div>
                <div class="text-[10px] text-gray-400">Mùa 2 · 9 điểm</div>
              </div>
            </div>
          </section>

          <!-- 9. Bình chọn -->
          <section id="polls" class="scroll-mt-16 flex flex-col gap-3">
            <div class="flex items-center gap-2">
              <span
                class="w-8 h-8 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center shrink-0"
              >
                <span class="material-icons text-[18px]">how_to_vote</span>
              </span>
              <h2 class="font-extrabold">9. Bình chọn</h2>
            </div>
            <p class="text-sm text-gray-500">
              Admin tạo bình chọn, mọi thành viên đã đăng nhập được vote — mỗi
              người 1 lượt, không đổi lại được.
            </p>
            <div
              class="rounded-2xl border border-gray-100 shadow-card overflow-hidden"
            >
              <div class="h-6 flex items-center gap-1.5 px-3 bg-gray-100">
                <span class="w-2 h-2 rounded-full bg-red-300"></span>
                <span class="w-2 h-2 rounded-full bg-amber-300"></span>
                <span class="w-2 h-2 rounded-full bg-primary-300"></span>
              </div>
              <div class="bg-white p-4 flex flex-col gap-2.5">
                <div class="text-xs font-bold">Chọn MVP mùa này</div>
                <div>
                  <div class="flex justify-between text-[10px] text-gray-500">
                    <span>13DTH17</span><span>50% (1)</span>
                  </div>
                  <div
                    class="h-2 rounded-full bg-surface-muted mt-0.5 overflow-hidden"
                  >
                    <div
                      class="h-2 rounded-full bg-primary-500"
                      style="width:50%"
                    ></div>
                  </div>
                </div>
                <div>
                  <div class="flex justify-between text-[10px] text-gray-500">
                    <span>PhucNT18</span><span>50% (1)</span>
                  </div>
                  <div
                    class="h-2 rounded-full bg-surface-muted mt-0.5 overflow-hidden"
                  >
                    <div
                      class="h-2 rounded-full bg-amber-400"
                      style="width:50%"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- 10. Thông báo -->
          <section id="notifications" class="scroll-mt-16 flex flex-col gap-3">
            <div class="flex items-center gap-2">
              <span
                class="w-8 h-8 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center shrink-0"
              >
                <span class="material-icons text-[18px]">notifications</span>
              </span>
              <h2 class="font-extrabold">10. Thông báo</h2>
            </div>
            <p class="text-sm text-gray-500">
              Bấm chuông 🔔 ở góc trên để xem. Admin thấy <b>toàn bộ</b> nhật ký
              hoạt động của app; người khác chỉ thấy việc liên quan tới mình
              (mình làm, hoặc đội mình được nhắc tới).
            </p>
            <div
              class="rounded-2xl border border-gray-100 shadow-card overflow-hidden"
            >
              <div class="h-6 flex items-center gap-1.5 px-3 bg-gray-100">
                <span class="w-2 h-2 rounded-full bg-red-300"></span>
                <span class="w-2 h-2 rounded-full bg-amber-300"></span>
                <span class="w-2 h-2 rounded-full bg-primary-300"></span>
              </div>
              <div class="bg-white p-3 flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-bold">Thông báo của tôi</span>
                  <span class="relative">
                    <span class="material-icons text-gray-400 text-[18px]"
                      >notifications</span
                    >
                    <span
                      class="absolute -top-1 -right-1.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-accent-red text-white text-[8px] font-bold flex items-center justify-center"
                      >2</span
                    >
                  </span>
                </div>
                <div
                  class="flex gap-2 items-start p-2 rounded-lg bg-primary-50"
                >
                  <span
                    class="material-icons text-primary-500 text-[14px] mt-0.5"
                    >sports_soccer</span
                  >
                  <div class="text-[10px] font-semibold leading-snug">
                    PhucNT18 (admin) đã cập nhật kết quả trận Team 9 vs Team 3
                  </div>
                </div>
                <div class="flex gap-2 items-start p-2 rounded-lg opacity-60">
                  <span class="material-icons text-gray-400 text-[14px] mt-0.5"
                    >photo_camera</span
                  >
                  <div class="text-[10px] leading-snug">
                    Đã tải lên ảnh đội hình cho Team 9
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- 11. Vai trò & quyền hạn -->
          <section id="roles" class="scroll-mt-16 flex flex-col gap-3">
            <div class="flex items-center gap-2">
              <span
                class="w-8 h-8 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center shrink-0"
              >
                <span class="material-icons text-[18px]"
                  >admin_panel_settings</span
                >
              </span>
              <h2 class="font-extrabold">11. Vai trò &amp; quyền hạn</h2>
            </div>
            <p class="text-sm text-gray-500">
              3 mức: <b>Admin</b> (toàn quyền), <b>Quản lý đội</b> (thành viên
              được gán quản lý 1+ đội), <b>Thành viên</b> (còn lại).
            </p>
            <div class="card !p-0 overflow-hidden">
              <table class="w-full text-[11px]">
                <thead>
                  <tr class="text-gray-400 bg-surface-muted">
                    <th class="text-left font-semibold py-2 px-3">Quyền</th>
                    <th class="font-semibold py-2 px-1">Admin</th>
                    <th class="font-semibold py-2 px-1">Quản lý</th>
                    <th class="font-semibold py-2 px-1">Thành viên</th>
                  </tr>
                </thead>
                <tbody>
                  <tr class="border-t border-gray-100">
                    <td class="py-2 px-3">Tạo/sửa/xoá giải đấu, đội bóng</td>
                    <td class="text-center text-primary-600 font-bold">✓</td>
                    <td class="text-center text-gray-300">—</td>
                    <td class="text-center text-gray-300">—</td>
                  </tr>
                  <tr class="border-t border-gray-100">
                    <td class="py-2 px-3">Thêm/xoá cầu thủ đội mình</td>
                    <td class="text-center text-primary-600 font-bold">✓</td>
                    <td class="text-center text-primary-600 font-bold">✓</td>
                    <td class="text-center text-gray-300">—</td>
                  </tr>
                  <tr class="border-t border-gray-100">
                    <td class="py-2 px-3">Nhập/sửa kết quả trận đội mình</td>
                    <td class="text-center text-primary-600 font-bold">✓</td>
                    <td class="text-center text-primary-600 font-bold">✓</td>
                    <td class="text-center text-gray-300">—</td>
                  </tr>
                  <tr class="border-t border-gray-100">
                    <td class="py-2 px-3">Xem toàn bộ Nhật ký hoạt động</td>
                    <td class="text-center text-primary-600 font-bold">✓</td>
                    <td class="text-center text-gray-300">—</td>
                    <td class="text-center text-gray-300">—</td>
                  </tr>
                  <tr class="border-t border-gray-100">
                    <td class="py-2 px-3">Xem thông báo của riêng mình</td>
                    <td class="text-center text-primary-600 font-bold">✓</td>
                    <td class="text-center text-primary-600 font-bold">✓</td>
                    <td class="text-center text-primary-600 font-bold">✓</td>
                  </tr>
                  <tr class="border-t border-gray-100">
                    <td class="py-2 px-3">Bình chọn</td>
                    <td class="text-center text-primary-600 font-bold">✓</td>
                    <td class="text-center text-primary-600 font-bold">✓</td>
                    <td class="text-center text-primary-600 font-bold">✓</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <p class="text-center text-xs text-gray-400 pt-2 pb-6">
            Còn thắc mắc? Liên hệ admin của giải đấu bạn đang tham gia.
          </p>
        </div>
      </div>
    </div>
  `,
})
export class GuideComponent implements AfterViewInit, OnDestroy {
  sections = SECTIONS;
  activeId = signal(SECTIONS[0].id);

  private elRef: ElementRef<HTMLElement> = inject(ElementRef);
  private observer?: IntersectionObserver;

  /** Highlights whichever section is currently in view as the user scrolls — the `-70%` bottom
   *  margin means a section counts as "active" once it's scrolled into roughly the top third of
   *  the viewport, matching where a reader's eye actually is. */
  ngAfterViewInit(): void {
    const targets = Array.from(
      this.elRef.nativeElement.querySelectorAll<HTMLElement>("section[id]"),
    );
    this.observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) this.activeId.set(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 },
    );
    for (const target of targets) this.observer.observe(target);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  /** Scrolls to a section without navigating — see the class doc comment for why a plain
   *  `<a href="#id">` doesn't work in this app (the `<base href="/">` bug). */
  jumpTo(id: string, event: Event): void {
    event.preventDefault();
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

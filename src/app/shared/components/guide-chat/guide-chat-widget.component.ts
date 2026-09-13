import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { GuideChatService } from '../../../core/services/guide-chat.service';

/**
 * Floating "how do I use this site" chat bubble, mounted once in `AppComponent` so it's available
 * on every non-fullscreen route (guests included — same reasoning as the public "/guide" page).
 * Free-tier Gemini via `GuideChatService`; this component only owns UI state (open/closed, the
 * input draft, auto-scroll) — all chat state lives in the service so it survives the widget being
 * collapsed and reopened.
 */
@Component({
  selector: 'app-guide-chat-widget',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div
        class="fixed z-40 inset-x-4 bottom-24 md:inset-x-auto md:right-6 md:bottom-24 md:w-96 h-[70dvh] md:h-[32rem] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
      >
        <div class="flex items-center justify-between min-h-14 py-2 px-4 border-b border-gray-100 shrink-0">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-8 h-8 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
              <span class="material-icons text-[18px]">smart_toy</span>
            </span>
            <div class="min-w-0">
              <div class="font-bold text-sm truncate">{{ 'GUIDE_CHAT.TITLE' | translate }}</div>
              <div class="text-[10px] text-gray-400 truncate">{{ chat.currentModel() }}</div>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            @if (chat.messages().length > 0) {
              <button
                type="button"
                class="w-8 h-8 flex items-center justify-center text-gray-400"
                (click)="chat.reset()"
                [attr.aria-label]="'GUIDE_CHAT.RESET' | translate"
                [title]="'GUIDE_CHAT.RESET' | translate"
              >
                <span class="material-icons text-[18px]">refresh</span>
              </button>
            }
            <button
              type="button"
              class="w-8 h-8 flex items-center justify-center text-gray-400"
              (click)="open.set(false)"
              [attr.aria-label]="'COMMON.CLOSE' | translate"
            >
              <span class="material-icons text-[18px]">close</span>
            </button>
          </div>
        </div>

        <div #scrollArea class="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
          @if (chat.messages().length === 0) {
            <p class="text-sm text-gray-400 text-center mt-4">{{ 'GUIDE_CHAT.GREETING' | translate }}</p>
            <div class="flex flex-col gap-1.5 mt-2">
              @for (key of suggestionKeys; track key) {
                @let label = key | translate;
                <button
                  type="button"
                  class="text-left text-xs px-3 py-2 rounded-xl bg-surface-muted text-gray-600 active:bg-gray-200"
                  (click)="ask(label)"
                >
                  {{ label }}
                </button>
              }
            </div>
          }
          @for (m of chat.messages(); track $index) {
            <div class="flex" [class.justify-end]="m.role === 'user'">
              <div
                class="max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words"
                [class]="m.role === 'user' ? 'bg-primary-600 text-white rounded-br-sm' : 'bg-surface-muted text-gray-800 rounded-bl-sm'"
              >
                {{ m.text || '…' }}
              </div>
            </div>
          }
          @if (chat.error()) {
            <p class="text-xs text-accent-red text-center">
              {{ (chat.quotaExceeded() ? 'GUIDE_CHAT.QUOTA_EXCEEDED' : 'GUIDE_CHAT.SEND_FAILED') | translate }}
            </p>
          }
        </div>

        <form class="flex items-center gap-2 p-3 border-t border-gray-100 shrink-0" (ngSubmit)="submit()">
          <input
            class="input-field flex-1 !py-2 text-sm"
            [placeholder]="'GUIDE_CHAT.PLACEHOLDER' | translate"
            [(ngModel)]="draft"
            name="draft"
            [disabled]="chat.sending()"
            autocomplete="off"
          />
          <button
            type="submit"
            class="w-9 h-9 rounded-full bg-primary-600 text-white flex items-center justify-center disabled:opacity-40 shrink-0"
            [disabled]="!draft.trim() || chat.sending()"
          >
            <span class="material-icons text-[18px]">{{ chat.sending() ? 'hourglass_top' : 'send' }}</span>
          </button>
        </form>
      </div>
    }

    <button
      type="button"
      class="fixed z-40 bottom-20 md:bottom-6 right-4 md:right-6 w-14 h-14 rounded-full bg-primary-600 text-white shadow-xl flex items-center justify-center active:scale-95 transition-transform"
      (click)="open.set(!open())"
      [attr.aria-label]="(open() ? 'COMMON.CLOSE' : 'GUIDE_CHAT.OPEN') | translate"
    >
      <span class="material-icons text-[26px]">{{ open() ? 'close' : 'smart_toy' }}</span>
    </button>
  `,
})
export class GuideChatWidgetComponent {
  chat = inject(GuideChatService);

  open = signal(false);
  draft = '';

  private scrollArea = viewChild<ElementRef<HTMLDivElement>>('scrollArea');

  /** Pins the panel scrolled to the newest message as chunks stream in — reads `chat.messages()`
   *  purely to register the dependency; the DOM write happens after Angular's own render pass. */
  private autoScroll = effect(() => {
    this.chat.messages();
    const el = this.scrollArea()?.nativeElement;
    if (!el) return;
    queueMicrotask(() => {
      el.scrollTop = el.scrollHeight;
    });
  });

  suggestionKeys = ['GUIDE_CHAT.SUGGEST_1', 'GUIDE_CHAT.SUGGEST_2', 'GUIDE_CHAT.SUGGEST_3', 'GUIDE_CHAT.SUGGEST_4'];

  ask(question: string): void {
    this.draft = question;
    this.submit();
  }

  submit(): void {
    const text = this.draft.trim();
    if (!text || this.chat.sending()) return;
    this.draft = '';
    void this.chat.send(text);
  }
}

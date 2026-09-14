import { Injectable, computed, signal } from '@angular/core';
import { getApp } from 'firebase/app';
import { ReCaptchaEnterpriseProvider, initializeAppCheck } from 'firebase/app-check';
import { ChatSession, GenerativeModel, GoogleAIBackend, getAI, getGenerativeModel } from 'firebase/ai';
import { environment } from '../../../environments/environment';

export interface GuideChatMessage {
  role: 'user' | 'model';
  text: string;
}

/** `gemini-3.8-flash`'s free tier turned out to cap at 20 requests/day *per project* (not per
 *  user — everyone using this widget shares that one pool), which real usage blew through almost
 *  immediately. Each model has its OWN separate daily quota, so this tries them in order —
 *  cheapest/highest-volume first — and only drops to the next one once the current one actually
 *  reports HTTP 429, multiplying the effective free daily budget instead of being capped by
 *  whichever single model has the smallest allowance. All three are free-tier eligible under the
 *  Gemini Developer API backend (no Cloud Billing account needed — see `GoogleAIBackend` below). */
const MODEL_CHAIN = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash'] as const;

/** Keep in sync with what the app actually does — see `GuideComponent` (the "/guide" page this
 *  is a conversational front-end for) and update both together when a feature changes. Written as
 *  plain prose rather than fed the raw Guide template, since that page mixes explanatory text with
 *  Tailwind/Angular markup that would just be noise (and cost) in every turn's system instruction. */
const SYSTEM_INSTRUCTION = `Bạn là trợ lý AI được tích hợp trong trang web "Pession" — nền tảng quản lý giải đấu efootball (bóng đá điện tử). Bạn có thể trò chuyện và trả lời MỌI câu hỏi của người dùng, không giới hạn chỉ ở chủ đề trang web.

Quy tắc:
- Trả lời ngắn gọn, thân thiện, đúng trọng tâm câu hỏi. Trả lời bằng tiếng Việt, trừ khi người dùng chủ động hỏi bằng tiếng Anh.
- Khi câu hỏi liên quan đến cách dùng trang web Pession, hãy ưu tiên dựa vào THÔNG TIN VỀ TRANG WEB bên dưới để trả lời chính xác thay vì đoán.
- Với câu hỏi không liên quan đến trang web, cứ trả lời bình thường bằng kiến thức chung của bạn như một trợ lý AI thông thường.
- Riêng với câu hỏi liên quan đến dữ liệu cụ thể của một giải đấu/tài khoản trên Pession (vd "đội tôi hạng mấy", "sao tôi chưa được gán quyền quản lý") mà bạn không có quyền truy cập dữ liệu đó, hãy nói thật là không biết/không xem được, và đề nghị họ hỏi admin của giải đấu — đừng bịa thông tin.

THÔNG TIN VỀ TRANG WEB:

1. Đăng nhập: dùng tài khoản Google, không cần đăng ký riêng. Tài khoản mới mặc định là "Thành viên" cho tới khi admin nâng quyền.

2. Vai trò & quyền hạn — 3 mức:
   - Admin: toàn quyền (tạo/sửa/xoá giải đấu và đội bóng, xem toàn bộ Nhật ký hoạt động, duyệt ảnh đội hình, quản lý thành viên...).
   - Quản lý đội: thành viên được gán quản lý 1 hoặc nhiều đội — nhập/sửa kết quả trận của đội mình (kể cả sau khi trận đã kết thúc), upload ảnh đội hình.
   - Thành viên: xem thông tin, bình chọn, xem thông báo liên quan tới mình.

3. Trang chủ: tổng quan riêng cho từng người (đội đang quản lý, trận sắp tới, kết quả gần nhất). Admin thấy thêm số liệu tổng quan toàn hệ thống kèm biểu đồ.

4. Giải đấu: mỗi giải có các tab Tổng quan, Đội bóng, Đội hình thi đấu, Vòng bảng/Vòng loại trực tiếp, Bảng xếp hạng, Thống kê (vuốt ngang thanh tab để xem hết). 3 loại giải: Vòng tròn (round robin), Vòng bảng + Loại trực tiếp, Loại trực tiếp thuần. Admin có thể bấm "Đặt lại" để xoá toàn bộ lịch thi đấu + kết quả của giải và tạo lại từ đầu (đội bóng không bị ảnh hưởng), hoặc kết thúc/mở lại giải.

5. Đội bóng: admin tạo đội bóng và gán người quản lý cho từng đội (qua tài khoản Gmail).

6. Đội hình thi đấu: mỗi đội có tối đa 4 ô ảnh đội hình, đánh số "Hình 1" đến "Hình 4". Ảnh có thể tự động gửi lên từ một tool chụp màn hình bên ngoài, hoặc chính quản lý tự chụp ảnh trực tiếp bằng camera điện thoại (nút "Chụp ảnh") hay chọn ảnh có sẵn (nút "Thêm ảnh") ngay trên web — không cần cài tool, tiện cho người chơi trên PS5/console — hoặc admin tải ảnh thủ công thay quản lý. Quản lý xoá được ảnh mình vừa tải lên nếu ảnh đó CHƯA được duyệt; ảnh đã duyệt rồi thì chỉ admin xoá được. Admin duyệt từng ảnh riêng lẻ bằng nút "Duyệt" — ảnh mới upload sẽ chưa có dấu "Đã duyệt" cho tới khi admin bấm duyệt.

7. Nhập/sửa kết quả: admin nhập được kết quả của mọi trận. Quản lý đội chỉ nhập được kết quả trận của chính đội mình, kể cả sửa lại sau khi trận đã kết thúc.

8. Vòng loại trực tiếp: sau khi vòng bảng thi đấu xong, admin bấm "Tạo vòng loại trực tiếp" để dựng nhánh đấu loại trực tiếp (có thể chọn thứ tự hạt giống thủ công hoặc random). Kết quả từng trận tự động đẩy đội thắng/thua vào vòng tiếp theo.

9. Xếp hạng: đây là bảng xếp hạng TỔNG của tất cả quản lý, cộng dồn điểm từ MỌI giải đấu họ từng tham gia — không phải bảng xếp hạng riêng của 1 giải. Thắng = 3 điểm, hoà = 1 điểm. Bấm vào một dòng để xem chi tiết: lịch sử thi đấu theo từng giải/đội, và danh hiệu vô địch đã đạt được (nếu có trong Đại sảnh Vinh danh).

10. Đại sảnh Vinh danh: lưu lại nhà vô địch của từng mùa giải — chỉ admin thêm/sửa/xoá được.

11. Bình chọn: admin tạo bình chọn, mọi thành viên đã đăng nhập đều vote được — mỗi người chỉ 1 lượt duy nhất và KHÔNG đổi lại được sau khi đã bình chọn.

12. Thông báo / Nhật ký hoạt động: bấm biểu tượng chuông ở góc trên để xem. Admin thấy toàn bộ nhật ký hoạt động của app (trang "/history"), lọc được theo màn hình, theo quản lý, và tìm kiếm theo từ khoá (tên đội, tên giải...). Người không phải admin chỉ thấy hoạt động liên quan tới chính mình.

13. Thành viên (trong trang Cá nhân, chỉ admin thấy được): admin có thể đổi vai trò, khoá/mở khoá tài khoản, đặt tên hiển thị riêng cho từng người, và tải ảnh đại diện thay cho thành viên nếu họ chưa tự upload.

Nếu người dùng hỏi về một tính năng của Pession không nằm trong danh sách trên, hãy thành thật nói rằng bạn không chắc, và đề nghị họ hỏi admin của giải đấu thay vì đoán bừa — quy tắc này chỉ áp dụng cho thông tin riêng của Pession, không áp dụng cho các câu hỏi kiến thức chung khác.`;

/** Models have no built-in clock, so "hôm nay thứ mấy?" is unanswerable without this — computed
 *  once when the widget/service loads (accurate for the length of one chat session; a tab left
 *  open across midnight would drift, an acceptable trade-off here). Also spells out that knowing
 *  today's date does NOT mean the model can reach live data (weather, news, prices...) — this SDK
 *  makes a plain text-generation call with no search/tool access, so without this caveat the model
 *  tends to overreach once it has *some* real-time fact to anchor on. */
function currentDateContext(): string {
  const today = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date());
  return `\n\nThông tin bổ sung: hôm nay là ${today}. Dùng thông tin này nếu người dùng hỏi về ngày/thứ hiện tại. Ngoài ngày hôm nay ra, bạn KHÔNG có kết nối internet hay quyền truy cập bất kỳ dữ liệu thời gian thực nào khác (thời tiết, tin tức, giá cả, kết quả thể thao bên ngoài Pession...) — với những câu hỏi đó, hãy thành thật nói bạn không xem được, đừng đoán hay bịa.`;
}

/**
 * Conversational front-end for "/guide" — free-tier Gemini via Firebase AI Logic, so this never
 * needs its own backend or an exposed API key. One `ChatSession` per browser tab; `reset()` starts
 * a fresh conversation (e.g. the widget's "new conversation" action).
 */
@Injectable({ providedIn: 'root' })
export class GuideChatService {
  // App Check is enforced on this project's Firebase AI Logic API (required as part of enabling
  // it) — must be initialized before the first `getAI()` call below, or every request gets
  // rejected. reCAPTCHA v3 registration was disabled for this project by the time this was set up
  // (Google's steering everyone to Enterprise), so this uses `ReCaptchaEnterpriseProvider` instead
  // — same free tier (10,000 assessments/month, no Cloud Billing needed), registered as a "Fraud
  // Defense" key in Google Cloud for this app's own domains. Field declaration order guarantees
  // this runs before `models`'s initializer.
  private appCheck = initializeAppCheck(getApp(), {
    provider: new ReCaptchaEnterpriseProvider(environment.recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  });

  // Built from the plain `firebase/ai` SDK (not the `@angular/fire/ai` DI wrapper) and instantiated
  // here rather than via a root-level `provideAI(...)` in app.config.ts, so the whole Firebase AI
  // Logic SDK — sizable — only ends up in the lazy chunk behind the `@defer`-ed chat widget instead
  // of every page's eager bundle. `getApp()` returns the same default app `provideFirebaseApp(...)`
  // already initialized; Gemini Developer API backend needs no Cloud Billing account (Spark-plan
  // friendly), and Firebase proxies the call server-side so no API key ever reaches this bundle.
  //
  // One `GenerativeModel` per entry in `MODEL_CHAIN`, sharing the same `AI` service instance —
  // `modelIndex` tracks which one is currently in use; `advanceModel()` moves to the next one on a
  // quota error and never goes back (a model that's out for today stays out for the rest of this
  // browser session — a fresh page load is what re-tries it).
  private models: GenerativeModel[] = MODEL_CHAIN.map((model) =>
    getGenerativeModel(getAI(getApp(), { backend: new GoogleAIBackend() }), {
      model,
      systemInstruction: SYSTEM_INSTRUCTION + currentDateContext(),
    })
  );
  private modelIndex = signal(0);
  /** Which model is currently answering — shown as a small label in the widget so a switch (on
   *  quota exhaustion) is visible rather than silent. */
  currentModel = computed(() => MODEL_CHAIN[this.modelIndex()]);
  private chat: ChatSession | null = null;

  messages = signal<GuideChatMessage[]>([]);
  sending = signal(false);
  /** Set on a failed send — the widget shows a translated retry message. Cleared on the next
   *  attempt, success or failure. */
  error = signal(false);
  /** Set specifically when every model in `MODEL_CHAIN` has reported HTTP 429 (free-tier daily
   *  quota exhausted) — the widget shows a distinct "try again later" message instead of the
   *  generic connectivity one, since retrying immediately can't possibly help. */
  quotaExceeded = signal(false);

  private session(): ChatSession {
    if (!this.chat) this.chat = this.models[this.modelIndex()].startChat();
    return this.chat;
  }

  /** Moves to the next model in `MODEL_CHAIN`, carrying the current chat history over so the
   *  conversation continues without the user noticing anything switched — `getHistory()` only
   *  ever contains turns that fully succeeded (see `send()`'s doc comment), so nothing about the
   *  failed attempt being retried leaks into it. Returns `false` once every model's been tried. */
  private async advanceModel(): Promise<boolean> {
    if (this.modelIndex() >= this.models.length - 1) return false;
    const history = this.chat ? await this.chat.getHistory() : [];
    const next = this.modelIndex() + 1;
    this.modelIndex.set(next);
    this.chat = this.models[next].startChat({ history });
    return true;
  }

  /** `firebase/ai` reports a rate-limited/quota-exhausted request as an `AIError` whose
   *  `customErrorData.status` is the underlying HTTP status (429 here) — see the SDK's
   *  `fetch-error` throw site. Duck-typed rather than imported since `AIError` isn't exported by
   *  the package's public types. */
  private isQuotaExceeded(err: unknown): boolean {
    const status = (err as { customErrorData?: { status?: number } } | undefined)?.customErrorData?.status;
    return status === 429;
  }

  /** One attempt on whichever model is currently selected: stream first, and if `firebase/ai`'s
   *  stream throws mid-response for a reason OTHER than quota (a known `AI/parse-failed` SDK
   *  quirk — the request itself went through fine), fall back to one plain non-streaming resend on
   *  the same model/session before giving up on it. Safe to retry either way — `ChatSession` only
   *  commits a turn to its own history once a call fully succeeds (verified in the SDK source), so
   *  a failed attempt never leaves anything behind to duplicate. Lets a quota error (429) propagate
   *  straight to the caller, which decides whether to advance to the next model. */
  private async attemptOnCurrentModel(msgIndex: number, text: string): Promise<void> {
    try {
      await this.streamReplyInto(msgIndex, text);
      return;
    } catch (streamErr) {
      if (this.isQuotaExceeded(streamErr)) throw streamErr;
      console.error('[GuideChat] stream failed, retrying non-streamed', streamErr);
    }
    const result = await this.session().sendMessage(text);
    this.setMessageText(msgIndex, result.response.text());
  }

  /** Sends `text`, streaming the reply into a new trailing message as chunks arrive so the UI can
   *  show it typing out rather than waiting for the full response. On a quota error (429), cascades
   *  through the rest of `MODEL_CHAIN` — each has its own separate daily allowance — retrying the
   *  same message on the next model, before finally giving up once they've all been exhausted. */
  async send(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || this.sending()) return;

    this.error.set(false);
    this.quotaExceeded.set(false);
    this.sending.set(true);
    this.messages.update((list) => [...list, { role: 'user', text: trimmed }, { role: 'model', text: '' }]);
    const modelIndex = this.messages().length - 1;

    try {
      for (;;) {
        try {
          await this.attemptOnCurrentModel(modelIndex, trimmed);
          return;
        } catch (err) {
          if (this.isQuotaExceeded(err) && (await this.advanceModel())) {
            continue; // same message, next model in the chain
          }
          console.error('[GuideChat] send failed', err);
          this.error.set(true);
          this.quotaExceeded.set(this.isQuotaExceeded(err));
          // Remove only the empty placeholder — the user's own question stays visible, so nothing
          // is lost and they can just hit send again instead of retyping.
          this.messages.update((list) => list.slice(0, modelIndex));
          return;
        }
      }
    } finally {
      this.sending.set(false);
    }
  }

  private async streamReplyInto(modelIndex: number, text: string): Promise<void> {
    const result = await this.session().sendMessageStream(text);
    for await (const chunk of result.stream) {
      const piece = chunk.text();
      if (piece) this.appendToMessage(modelIndex, piece);
    }
  }

  private appendToMessage(index: number, piece: string): void {
    this.messages.update((list) => {
      const next = [...list];
      next[index] = { role: 'model', text: next[index].text + piece };
      return next;
    });
  }

  private setMessageText(index: number, text: string): void {
    this.messages.update((list) => {
      const next = [...list];
      next[index] = { role: 'model', text };
      return next;
    });
  }

  reset(): void {
    this.chat = null;
    this.messages.set([]);
    this.error.set(false);
    this.quotaExceeded.set(false);
  }
}

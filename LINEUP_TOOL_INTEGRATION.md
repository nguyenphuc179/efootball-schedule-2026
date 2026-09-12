# Lineup Tool — cần update thêm: lọc "Giải đấu" theo Gmail đang đăng nhập

Mục tiêu: dropdown "Giải đấu" đang hiện **tất cả** giải đấu → đổi thành chỉ hiện (các) giải đấu mà
Gmail đang đăng nhập thực sự có 1 team trong đó. Cơ chế ghi ảnh
(`lineups/{tournamentId}__{email}/images/{slot}`) **giữ nguyên, không đổi** — chỉ thêm 2 lệnh đọc
bên dưới trước khi đổ dữ liệu vào dropdown. Vẫn không cần Authorization header / API key, y như
cách tool đang ghi ảnh.

## 1. Tìm team theo email

```
POST https://firestore.googleapis.com/v1/projects/efootball-schedule-2026/databases/(default)/documents:runQuery
Content-Type: application/json

{
  "structuredQuery": {
    "from": [{ "collectionId": "teams" }],
    "where": {
      "fieldFilter": {
        "field": { "fieldPath": "managerEmail" },
        "op": "EQUAL",
        "value": { "stringValue": "<email đã .trim().toLowerCase()>" }
      }
    }
  }
}
```

- Lấy `tournamentId` từ `fields.tournamentId.stringValue` của mỗi kết quả, **dedupe** (1 email có
  thể quản lý nhiều team ở nhiều giải đấu khác nhau).
- ⚠️ Không khớp kết quả nào → Firestore trả `200` với body `[{"readTime": "..."}]`, **không phải**
  `[]`, và phần tử đó **không có key `document`**. Phải `results.filter(r => r.document)` trước khi
  đọc `.document.fields`, nếu không sẽ crash.
- ⚠️ Email phải `.trim().toLowerCase()` trước khi query — sai hoa/thường hoặc dư khoảng trắng sẽ
  khớp 0 kết quả dù đúng người (app luôn lưu `managerEmail` ở dạng chuẩn hoá này).

## 2. Lấy tên/trạng thái để hiển thị

Với mỗi `tournamentId` duy nhất ở bước 1:

```
GET https://firestore.googleapis.com/v1/projects/efootball-schedule-2026/databases/(default)/documents/tournaments/{tournamentId}
```

Dùng `fields.name`, `fields.location`, `fields.status` (`'in_progress'` hoặc `'completed'` — coi
mọi giá trị khác `'completed'` là `'in_progress'`) để giữ nguyên format label hiện tại, ví dụ:
`"EF 2026 - season 2 (HCM · Đang diễn ra)"`.

⚠️ **Chỉ giữ lại giải đấu đang `in_progress`** — giải đã `completed` thì bỏ qua, không đưa vào
dropdown (giải đã kết thúc thì không cần chụp/tải ảnh đội hình nữa).

## 3. Đổi UI

- Lúc khởi động tool + khi bấm **"Làm mới"**: chạy bước 1 → bước 2, chỉ đổ vào dropdown "Giải đấu"
  những giải **đang diễn ra (`in_progress`)** mà email này có team — bỏ hẳn việc liệt kê tất cả giải
  đấu, và bỏ luôn các giải đã `completed`.
- Nếu danh sách sau lọc rỗng (kể cả trường hợp email có team nhưng giải đó đã `completed`): đừng để
  dropdown trống — hiện thông báo kiểu *"Tài khoản Google này chưa được gán quản lý ở giải đấu nào
  đang diễn ra. Liên hệ admin để được thêm vào đội."*

## Lưu ý

- Gmail đăng nhập trong tool phải **trùng** Gmail mà admin đã gán làm "Manager" của team trên web
  app, nếu không bước 1 sẽ luôn rỗng.
- `managerEmail` là field mới; team gán manager từ trước sẽ tự được vá lại field này khi admin mở
  tab "Đội hình thi đấu" của giải đấu đó trên web — nếu 1 giải đấu cũ chưa lọc ra được, admin chỉ
  cần mở tab đó một lần.

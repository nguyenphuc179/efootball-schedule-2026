# Lineup Tool — cần update thêm: lọc "Giải đấu" theo Gmail đang đăng nhập + ghi vào "/history"

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
- Lấy luôn `fields.manager.stringValue` của mỗi kết quả — đây là tên hiển thị "trong hệ thống" của
  quản lý đó (admin đặt riêng trên web, ưu tiên hơn tên Google), dùng làm `actorName` khi ghi log ở
  bước 4 thay vì hiện thẳng địa chỉ Gmail (xem bước 4). Giữ theo từng `tournamentId` (map
  `tournamentId → manager`) vì đây là field đi kèm với team, không phải với email.
- Lấy luôn `fields.managerUid.stringValue` (có thể vắng mặt nếu team chưa gán tài khoản liên kết) —
  dùng làm `subjectUid` ở bước 4, để chính quản lý đó nhìn thấy được dòng log này trên trang cá nhân
  "Thông báo của tôi" của họ (không chỉ admin mới thấy). Giữ theo từng `tournamentId` như `manager`.
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
- `manager` (tên hiển thị dùng ở bước 4) là *snapshot* chụp lúc admin lưu team lần cuối, không tự
  động cập nhật khi admin đổi tên hiển thị của tài khoản đó sau này — nó được đồng bộ lại theo cùng
  cơ chế backfill nói trên (mở tab "Đội hình thi đấu" một lần). Nếu thấy tên hiển thị trong
  "/history" bị cũ, nhờ admin mở lại tab đó cho giải đấu tương ứng.

## 4. Ghi vào "/history" sau khi upload ảnh (mới)

Trước đây trang "/history" (nhật ký hoạt động, admin-only) **không** thấy được các lần tool upload
ảnh, vì tool ghi thẳng vào `lineups/...` mà không qua app, và collection `activityLogs` trước đây
chỉ nhận ghi từ user đã đăng nhập Firebase Auth. `firestore.rules` đã được mở thêm một nhánh riêng
để tool có thể tự ghi 1 dòng lịch sử — vẫn **không cần Authorization header / API key**, giống hệt
cách tool đang ghi ảnh. Từ giờ chính quản lý (manager) cũng thấy được dòng log này trên trang cá
nhân "Thông báo của tôi" của họ, không chỉ admin — miễn là gửi kèm `subjectUid` bên dưới.

Ngay sau khi bước ghi ảnh (`lineups/{tournamentId}__{email}/images/{slot}`) trả về thành công, gọi
thêm:

```
POST https://firestore.googleapis.com/v1/projects/efootball-schedule-2026/databases/(default)/documents/activityLogs
Content-Type: application/json

{
  "fields": {
    "actorUid": { "stringValue": "capture-tool" },
    "actorEmail": { "stringValue": "<email đã .trim().toLowerCase(), đúng email của manager>" },
    "actorName": { "stringValue": "<manager của team tương ứng tournamentId này, lấy từ bước 1 — fallback về email nếu vì lý do gì đó rỗng>" },
    "action": { "stringValue": "lineup_upload" },
    "description": { "stringValue": "<câu mô tả tiếng Việt, vd: Đã tải lên ảnh đội hình (ô 1) qua tool chụp ảnh>" },
    "tournamentId": { "stringValue": "<tournamentId, PHẢI trùng tournamentId trong path ảnh vừa ghi>" },
    "subjectUid": { "stringValue": "<managerUid của team tương ứng tournamentId này, lấy từ bước 1 — BỎ HẲN field này (đừng gửi null) nếu team chưa có managerUid>" },
    "sourcePath": { "stringValue": "/tournaments/<tournamentId>" },
    "menuKey": { "stringValue": "tournaments" },
    "createdDate": { "integerValue": "<Date.now(), mili-giây>" }
  }
}
```

⚠️ Rule kiểm tra rất chặt — sai bất kỳ field nào dưới đây, request sẽ bị từ chối (403):

- `actorUid` phải đúng chuỗi `"capture-tool"` (không phải uid thật).
- `action` phải đúng chuỗi `"lineup_upload"` (dùng chung cho cả upload mới lẫn ghi đè slot cũ — tool
  không xoá được ảnh nên không cần bắn `lineup_remove`).
- `actorEmail` phải đúng định dạng email.
- `tournamentId` phải là giải đấu **đang tồn tại** trong `tournaments/{tournamentId}`.
- `subjectUid`, nếu có, phải là chuỗi (không giới hạn giá trị cụ thể — chỉ dùng để cấp quyền đọc lại
  cho đúng người). Không bắt buộc; bỏ hẳn field này nếu không có `managerUid`.
- `sourcePath` phải đúng bằng `"/tournaments/" + tournamentId` (để admin bấm vào dòng lịch sử là
  nhảy đúng sang trang giải đấu đó).
- `menuKey` phải đúng chuỗi `"tournaments"`.
- Chỉ được có tối đa 10 field trong danh sách trên (9 field cũ + `subjectUid`), không thêm field
  khác ngoài danh sách.

Ghi log là bước phụ, không quan trọng bằng việc ảnh đã lưu thành công — nếu request này lỗi, tool
nên log ra console và **không** rollback/báo lỗi cho người dùng, tương tự cách app tự làm ở
`ActivityLogService.log()` (không bao giờ throw ra ngoài).

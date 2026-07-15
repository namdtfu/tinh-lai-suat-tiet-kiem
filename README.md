# MoneyMind

Ứng dụng quản lý tài chính cá nhân bằng tiếng Việt, gồm hai không gian độc lập
trong cùng một tài khoản:

- **Tiết kiệm:** quản lý khoản gửi, tính lãi dự kiến, theo dõi ngày đáo hạn và
  lịch sử các kỳ tái đầu tư.
- **Thu chi:** quản lý tài khoản KRW/VND, khoản thu, khoản chi, chuyển đổi tiền
  tệ, ngân sách theo tháng, xu hướng dòng tiền theo ngày và báo cáo tháng chi
  tiết theo nhóm cha–con tùy chỉnh.

Mỗi tài khoản Thu chi có một đơn vị tiền cố định. Khi chuyển giữa KRW và VND,
giao dịch lưu riêng số tiền gửi và số tiền thực nhận để số dư hai bên luôn đúng;
ứng dụng không cộng trực tiếp các loại tiền khác nhau. Danh mục giao dịch có thể
thêm, sửa, ẩn hoặc khôi phục mà không làm mất lịch sử đã ghi.

Giao dịch có thể chỉnh sửa sau khi lưu. Khi cập nhật, ứng dụng thay thế giao
dịch cũ rồi tính lại số dư từ lịch sử, vì vậy số tiền cũ được hoàn lại đúng tài
khoản trước khi số tiền, tài khoản hoặc loại giao dịch mới được áp dụng.

## Chạy cục bộ

Yêu cầu Node.js 22.13 trở lên.

```bash
npm ci
npm run dev
```

Mở `http://localhost:3000` trong trình duyệt. Dữ liệu được lưu trong
`localStorage` của từng thiết bị nếu chưa cấu hình Supabase.

## Tài khoản và đồng bộ Supabase

Ứng dụng dùng đăng nhập email và mật khẩu với tài khoản được tạo trước. Mỗi tài
khoản chỉ được đọc và ghi dòng dữ liệu của chính mình nhờ Row Level Security.

1. Tạo một Supabase project.
2. Mở SQL Editor và chạy toàn bộ tệp `supabase/schema.sql`.
3. Sao chép `.env.example` thành `.env.local`, sau đó điền Project URL và
   publishable key. Không dùng và không đưa service-role key vào ứng dụng.
4. Trong Authentication > Users, chọn Add user > Create new user, nhập email
   và mật khẩu rồi bật Auto Confirm User.
5. Lặp lại cho 5–10 người được phép sử dụng. Không dùng Invite user nếu dự án
   chưa cấu hình SMTP riêng.

Khi một tài khoản đăng nhập lần đầu mà thiết bị đang có dữ liệu cục bộ, ứng
dụng sẽ yêu cầu xác nhận trước khi đưa dữ liệu lên database. Người dùng cũng có
thể tải bản sao lưu JSON chứa cả dữ liệu tiết kiệm và thu chi trước khi chuyển.

Sau khi chạy bản `supabase/schema.sql` mới nhất, bảng dữ liệu được thêm vào
publication `supabase_realtime`. Mọi thiết bị đang mở cùng tài khoản sẽ nhận thay
đổi ngay mà không cần tải lại trang. RLS vẫn giới hạn luồng realtime theo
`user_id`; nếu hai thiết bị cùng sửa trong lúc một thiết bị đang chờ ghi, lần ghi
hoàn tất sau cùng là dữ liệu được giữ lại.

## Triển khai

Mỗi lần có thay đổi trên nhánh `main`, GitHub Actions sẽ tạo bản tĩnh và triển
khai lên GitHub Pages. Để bật đăng nhập trên bản web, tạo hai Repository
Variables trong GitHub Actions:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

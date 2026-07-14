# Tính Lãi Suất Tiết Kiệm

Ứng dụng web tiếng Việt để quản lý khoản gửi tiết kiệm, tính lãi dự kiến,
theo dõi tiến độ đến ngày đáo hạn và lưu lịch sử các kỳ tái đầu tư.

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
thể tải bản sao lưu JSON trước khi chuyển.

## Triển khai

Mỗi lần có thay đổi trên nhánh `main`, GitHub Actions sẽ tạo bản tĩnh và triển
khai lên GitHub Pages. Để bật đăng nhập trên bản web, tạo hai Repository
Variables trong GitHub Actions:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

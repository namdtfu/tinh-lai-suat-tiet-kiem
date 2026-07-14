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

Ứng dụng dùng đăng nhập Magic Link theo danh sách mời. Mỗi tài khoản chỉ được
đọc và ghi dòng dữ liệu của chính mình nhờ Row Level Security.

1. Tạo một Supabase project.
2. Mở SQL Editor và chạy toàn bộ tệp `supabase/schema.sql`.
3. Sao chép `.env.example` thành `.env.local`, sau đó điền Project URL và
   publishable key. Không dùng và không đưa service-role key vào ứng dụng.
4. Trong Authentication URL Configuration, thêm các Redirect URL:
   `http://localhost:3000/**` và
   `https://namdtfu.github.io/tinh-lai-suat-tiet-kiem/**`.
5. Tạo hoặc mời 5–10 email được phép sử dụng trong Authentication > Users.

Khi một tài khoản đăng nhập lần đầu mà thiết bị đang có dữ liệu cục bộ, ứng
dụng sẽ yêu cầu xác nhận trước khi đưa dữ liệu lên database. Người dùng cũng có
thể tải bản sao lưu JSON trước khi chuyển.

## Triển khai

Mỗi lần có thay đổi trên nhánh `main`, GitHub Actions sẽ tạo bản tĩnh và triển
khai lên GitHub Pages. Để bật đăng nhập trên bản web, tạo hai Repository
Variables trong GitHub Actions:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

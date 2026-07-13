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
`localStorage` của từng thiết bị và không được gửi lên máy chủ.

## Triển khai

Mỗi lần có thay đổi trên nhánh `main`, GitHub Actions sẽ tạo bản tĩnh và triển
khai lên GitHub Pages.

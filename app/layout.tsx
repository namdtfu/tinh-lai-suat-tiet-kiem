import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tính Lãi Suất Tiết Kiệm",
  description:
    "Công cụ theo dõi khoản gửi, tính lãi dự kiến và lập kế hoạch tái đầu tư.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}

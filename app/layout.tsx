import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MoneyMind – Tiết kiệm và Thu chi",
  description:
    "Quản lý khoản gửi tiết kiệm, dòng tiền, ngân sách và tài khoản cá nhân trong một ứng dụng.",
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

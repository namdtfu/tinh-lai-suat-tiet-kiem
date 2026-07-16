import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0];
  const host = forwardedHost ?? requestHeaders.get("host") ?? "localhost:3000";
  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",")[0];
  const protocol =
    forwardedProtocol === "http" || host.startsWith("localhost")
      ? "http"
      : "https";
  const socialImage = new URL("/og.png", `${protocol}://${host}`).toString();
  const title = "MoneyMind – Tài sản, Ngân sách và Mục tiêu";
  const description =
    "Hợp nhất tài sản KRW/VND, theo dõi thu chi, dự báo ngân sách và liên kết tài khoản với các mục tiêu tài chính trong một ứng dụng.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: socialImage, width: 1731, height: 909, alt: title }],
      locale: "vi_VN",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
  };
}

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

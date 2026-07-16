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
  const title = "MoneyMind – Tiết kiệm và Thu chi";
  const description =
    "Theo dõi khoản gửi, nhắc đáo hạn, tất toán thực tế, dòng tiền, ngân sách và tài khoản cá nhân trong một ứng dụng.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: socialImage, width: 1734, height: 908, alt: title }],
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

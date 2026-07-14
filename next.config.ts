import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES_BUILD === "true";

const nextConfig: NextConfig = {
  ...(isGitHubPages
    ? {
        output: "export",
        basePath: "/tinh-lai-suat-tiet-kiem",
        trailingSlash: true,
        typescript: {
          tsconfigPath: "tsconfig.pages.json",
        },
      }
    : {}),
};

export default nextConfig;

import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@fashion/core"],
  serverExternalPackages: ["postgres", "sharp"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  images: { unoptimized: true },
  devIndicators: false,
  // No persistent Turbopack dev cache: this machine has very little free disk.
  experimental: { serverActions: { bodySizeLimit: "30mb" }, turbopackFileSystemCacheForDev: false },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Allow Clerk's OAuth popups while isolating the browsing context.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests" },
        ],
      },
    ];
  },
};

export default nextConfig;

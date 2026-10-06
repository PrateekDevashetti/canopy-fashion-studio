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
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Headless Chrome for real PDF downloads (/api/pdf). Kept out of the bundle;
  // the compressed Chromium binary ships with the function.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    "/api/pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;

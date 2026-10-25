import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Server-only packages that must not be bundled by webpack.
  serverExternalPackages: ["pino", "@node-rs/bcrypt", "ioredis", "bullmq", "@prisma/client", "sharp", "exceljs", "@aws-sdk/client-s3", "puppeteer-core", "@sentry/node"],
};

export default nextConfig;

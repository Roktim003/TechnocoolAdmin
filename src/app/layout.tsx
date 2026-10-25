import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@/styles/globals.css";
import { BrowserErrorTracking } from "@/components/monitoring/BrowserErrorTracking";
import { releaseName } from "@/shared/monitoring/sentry";

export const metadata: Metadata = {
  title: { default: "StockBook", template: "%s · StockBook" },
  description: "Inventory management for HVAC projects",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#161616" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request headers renders every page per request, so Next.js can put the
  // middleware's CSP nonce on its scripts (a prerendered page would carry no nonce).
  await headers();
  const dsn = process.env.SENTRY_DSN?.trim();
  return (
    <html lang="en">
      <body>
        {children}
        {dsn ? <BrowserErrorTracking dsn={dsn} release={releaseName()} environment={process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "production"} /> : null}
      </body>
    </html>
  );
}

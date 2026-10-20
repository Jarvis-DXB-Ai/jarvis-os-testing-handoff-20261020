import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Keep this stable until the approved icon artwork changes again. A versioned
// URL ensures browser favicon caches (notably Safari's) fetch the current set.
const FAVICON_ASSET_VERSION = "2";
const faviconUrl = (path: string) => `${path}?v=${FAVICON_ASSET_VERSION}`;

export const metadata: Metadata = {
  title: "Jarvis OS",
  description: "AI operating system for MC Studios",
  manifest: faviconUrl("/favicon/site.webmanifest"),
  // Added to the iOS home screen, Jarvis must stay inside the standalone shell.
  // iOS honours these Apple-specific tags independently of the manifest, and
  // without them a navigation can hand the session back to Safari chrome.
  appleWebApp: {
    capable: true,
    title: "Jarvis",
    statusBarStyle: "black",
  },
  // `capable: true` emits the standardised `mobile-web-app-capable`. Safari
  // versions before 17.4 only honour the apple-prefixed spelling, so both are
  // declared rather than assuming every device is current.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      { url: faviconUrl("/favicon.ico"), sizes: "64x64", type: "image/x-icon" },
      { url: faviconUrl("/favicon/favicon-16.png"), sizes: "16x16", type: "image/png" },
      { url: faviconUrl("/favicon/favicon-32.png"), sizes: "32x32", type: "image/png" },
      { url: faviconUrl("/favicon/favicon-64.png"), sizes: "64x64", type: "image/png" },
      { url: faviconUrl("/favicon/icon-512.png"), sizes: "512x512", type: "image/png" },
    ],
    shortcut: faviconUrl("/favicon/favicon-32.png"),
    apple: [
      { url: faviconUrl("/favicon/apple-touch-icon.png"), sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#08080A",
};

// Jarvis is an operational app backed by live Supabase state. Rendering it at
// request time keeps deployment images free of customer data and service secrets.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BackgroundCanvas } from "@/components/shell/BackgroundCanvas";

export const metadata: Metadata = {
  title: {
    default: "EternaVoice",
    template: "%s · EternaVoice",
  },
  description:
    "Create a private voice clone from a recording, preview it, and have a continuous spoken conversation.",
  applicationName: "EternaVoice",
  authors: [{ name: "EternaVoice" }],
  metadataBase: new URL("https://eternavoice.app"),
  manifest: "/site.webmanifest",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    other: [
      {
        rel: "mask-icon",
        url: "/safari-pinned-tab.svg",
        color: "#c7a27c",
      },
    ],
  },
  openGraph: {
    title: "EternaVoice",
    description:
      "Create a private voice clone from a recording, preview it, and have a continuous spoken conversation.",
    url: "/",
    siteName: "EternaVoice",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "EternaVoice",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "EternaVoice",
    description:
      "Create a private voice clone from a recording, preview it, and have a continuous spoken conversation.",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
  },
  appleWebApp: {
    capable: true,
    title: "EternaVoice",
    statusBarStyle: "black-translucent",
  },
  other: {
    "msapplication-TileColor": "#0b0b0e",
    "msapplication-config": "/browserconfig.xml",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Fraunces:opsz,wght,SOFT@9..144,400;500;600;700,30..100&display=swap"
        />
      </head>
      <body className="relative isolate">
        <BackgroundCanvas />
        <div className="relative z-10 flex min-h-dvh flex-col">{children}</div>
      </body>
    </html>
  );
}

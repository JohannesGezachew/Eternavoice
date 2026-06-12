import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { BackgroundCanvas } from "@/components/shell/BackgroundCanvas";
import { MotionProvider } from "@/components/shell/MotionProvider";

// Self-hosted via next/font: no render-blocking Google Fonts stylesheet,
// no layout shift, fonts served from our own origin.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
  axes: ["SOFT", "opsz"],
});

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
        color: "#c9996a",
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
    "msapplication-TileColor": "#0d0b09",
    "msapplication-config": "/browserconfig.xml",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d0b09",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="relative isolate">
        <MotionProvider>
          <BackgroundCanvas />
          <div className="relative z-10 flex min-h-dvh flex-col">{children}</div>
        </MotionProvider>
      </body>
    </html>
  );
}

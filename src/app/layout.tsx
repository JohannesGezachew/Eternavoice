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
  alternates: {
    canonical: "/",
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

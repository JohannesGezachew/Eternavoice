import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BackgroundCanvas } from "@/components/shell/BackgroundCanvas";

export const metadata: Metadata = {
  title: "EternaVoice",
  description:
    "Continuous voice conversations with someone you can no longer speak to. Built from what they left behind.",
  applicationName: "EternaVoice",
  authors: [{ name: "EternaVoice" }],
  metadataBase: new URL("https://eternavoice.app"),
  openGraph: {
    title: "EternaVoice",
    description:
      "Continuous voice conversations with someone you can no longer speak to.",
    type: "website",
  },
  robots: {
    index: false,
    follow: false,
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

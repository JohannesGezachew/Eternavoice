import type { NextConfig } from "next";
import path from "node:path";
import os from "node:os";

// Every LAN IPv4 of this machine, so the dev server accepts requests from a
// phone on the same network without 403-ing its own JS chunks. Computed at
// boot instead of hardcoded, so it never goes stale when the network changes.
const localNetworkOrigins = Object.values(os.networkInterfaces())
  .flat()
  .filter((i): i is os.NetworkInterfaceInfo => Boolean(i) && i!.family === "IPv4" && !i!.internal)
  .map((i) => i.address);

// Content-Security-Policy.
//
// 'unsafe-inline' is required in both script-src and style-src: the theme
// pre-paint script in layout.tsx runs inline (it must, to avoid a flash of the
// wrong theme), Next injects inline hydration scripts, and the UI uses inline
// style={} extensively. Nonces would need per-request middleware rewriting and
// are a follow-up, not a launch blocker.
//
// The protections that do bite here: object-src/base-uri/frame-ancestors close
// off plugin, base-tag and clickjacking vectors, and connect-src limits where
// the browser may send data to this origin plus Supabase — the AI providers
// (OpenAI, ElevenLabs, Stripe) are only ever called server-side, so they are
// deliberately absent.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  // Recorded takes and synthesized replies are played back from object URLs.
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", ...localNetworkOrigins],
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "microphone=(self), camera=()",
          },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;

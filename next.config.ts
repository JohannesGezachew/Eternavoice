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
            key: "Permissions-Policy",
            value: "microphone=(self), camera=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

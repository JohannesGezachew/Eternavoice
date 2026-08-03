import type { MetadataRoute } from "next";

const SITE = "https://eternavoice.com";

/**
 * Only the marketing and legal surface is crawlable. Everything behind auth —
 * a person's hub, their conversations, memories, account and billing — is
 * disallowed so private pages never surface in search results.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/account",
          "/people",
          "/memories",
          "/subscribe",
          "/auth/",
          "/conversation",
          "/conversations",
          "/persona",
          "/record",
          "/subjects/",
          "/voices",
          "/voice-preview",
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}

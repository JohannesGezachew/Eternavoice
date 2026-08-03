import type { MetadataRoute } from "next";

const SITE = "https://eternavoice.com";

/** The public surface only — every other route sits behind auth. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: SITE, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/about`, lastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/terms`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}

import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/content/seo";

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/blog/", "/industries/"],
        disallow: [
          "/dashboard",
          "/campaigns",
          "/prospects",
          "/replies",
          "/content",
          "/social",
          "/ads",
          "/knowledge",
          "/cron",
          "/faq",
          "/auth/",
          "/api/",
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}

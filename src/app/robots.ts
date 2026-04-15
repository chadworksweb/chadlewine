import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/", "/cl-admin-", "/thinking"],
    },
    sitemap: "https://chadlewine.com/sitemap.xml",
  };
}

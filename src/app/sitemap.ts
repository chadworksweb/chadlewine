import type { MetadataRoute } from "next";
import { createPublicClient } from "@/lib/supabase-server";

const BASE_URL = "https://chadlewine.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createPublicClient();

  // Fetch published observations
  const { data: observations } = await supabase
    .from("observations")
    .select("slug, updated_at, published_at, date_captured")
    .eq("status", "published")
    .order("date_captured", { ascending: false });

  // Fetch foundations
  const { data: foundations } = await supabase
    .from("foundations")
    .select("slug, updated_at")
    .order("display_order", { ascending: true });

  const entries: MetadataRoute.Sitemap = [];

  // Static pages
  entries.push(
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${BASE_URL}/chad-lewine`,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/foundations`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/archive/xanga`,
      changeFrequency: "yearly",
      priority: 0.3,
    }
  );

  // Observation pages
  if (observations) {
    for (const obs of observations) {
      entries.push({
        url: `${BASE_URL}/observations/${obs.slug}`,
        lastModified: obs.updated_at
          ? new Date(obs.updated_at)
          : obs.published_at
            ? new Date(obs.published_at)
            : new Date(obs.date_captured),
        changeFrequency: "monthly",
        priority: 0.8,
      });
    }
  }

  // Foundation pages
  if (foundations) {
    for (const f of foundations) {
      entries.push({
        url: `${BASE_URL}/foundations/${f.slug}`,
        lastModified: f.updated_at ? new Date(f.updated_at) : undefined,
        changeFrequency: "yearly",
        priority: 0.6,
      });
    }
  }

  return entries;
}

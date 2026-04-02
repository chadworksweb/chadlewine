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

  // Fetch published meditations
  const { data: meditations } = await supabase
    .from("meditations")
    .select("id, updated_at, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false });

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
      url: `${BASE_URL}/meditations`,
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/music`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/lyrics`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/video`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/art`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/curation`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/archive/xanga`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/merch`,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/merch/configure`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/merch/art`,
      changeFrequency: "weekly",
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/merch/line`,
      changeFrequency: "weekly",
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/merch/fusion`,
      changeFrequency: "weekly",
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/merch/pick`,
      changeFrequency: "weekly",
      priority: 0.5,
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

  // Meditation permalinks
  if (meditations) {
    for (const med of meditations) {
      entries.push({
        url: `${BASE_URL}/meditations/${med.id}`,
        lastModified: med.updated_at
          ? new Date(med.updated_at)
          : med.published_at
            ? new Date(med.published_at)
            : undefined,
        changeFrequency: "monthly",
        priority: 0.5,
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

  // Door pages
  const { data: doorPages } = await supabase
    .from("door_pages")
    .select("slug, updated_at, published_at")
    .eq("status", "published");

  if (doorPages) {
    for (const dp of doorPages) {
      entries.push({
        url: `${BASE_URL}/doors/${dp.slug}`,
        lastModified: dp.updated_at
          ? new Date(dp.updated_at)
          : dp.published_at
            ? new Date(dp.published_at)
            : undefined,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  }

  // Discography page
  entries.push({
    url: `${BASE_URL}/discography`,
    changeFrequency: "monthly",
    priority: 0.6,
  });

  // Album pages
  const { data: albums } = await supabase
    .from("albums")
    .select("slug, updated_at")
    .eq("status", "published")
    .order("display_order");

  if (albums) {
    for (const a of albums) {
      entries.push({
        url: `${BASE_URL}/music/albums/${a.slug}`,
        lastModified: a.updated_at ? new Date(a.updated_at) : undefined,
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }
  }

  // Song pages
  const { data: songs } = await supabase
    .from("songs")
    .select("slug, updated_at")
    .eq("status", "published")
    .order("title");

  if (songs) {
    for (const s of songs) {
      entries.push({
        url: `${BASE_URL}/music/songs/${s.slug}`,
        lastModified: s.updated_at ? new Date(s.updated_at) : undefined,
        changeFrequency: "monthly",
        priority: 0.5,
      });
    }
  }

  // Curation entry pages
  const { data: curatedEntries } = await supabase
    .from("curated_entries")
    .select("slug, updated_at, published_at")
    .eq("status", "published");

  if (curatedEntries) {
    for (const ce of curatedEntries) {
      entries.push({
        url: `${BASE_URL}/curation/${ce.slug}`,
        lastModified: ce.updated_at
          ? new Date(ce.updated_at)
          : ce.published_at
            ? new Date(ce.published_at)
            : undefined,
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }
  }

  return entries;
}

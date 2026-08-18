// Phase 2 seed for the Pages CMS (pages / page_sections / page_prompts).
//
// Idempotent: pages are upserted by slug; sections for the pages this script
// owns are deleted and re-inserted on every run, so re-running yields a clean
// known state. Safe to run repeatedly until the admin UI takes over editing.
//
// Run: npx tsx scripts/seed-pages-cms.ts
//
// ---------------------------------------------------------------------------
// SECTION DATA CONTRACT (Phase 5 renderer must honor this)
// ---------------------------------------------------------------------------
// Every section row: { type, position, heading, body, data, status }.
// position orders containers top-to-bottom on the page.
//
//   type 'hero'       -> si-hero. data: { eyebrow, headline }
//   type 'prose'      -> si-section + Banner(heading) + si-prose(body as HTML).
//                        data: { anchor }
//   type 'research'   -> same markup as prose; body is HTML. data: { anchor }
//   type 'track-grid' -> ReleaseTrackGrid(heading). data: { anchor, source }
//                        source 'songs_over_5min' = live query duration>300.
//   type 'favorites'  -> si-section + Banner(heading) + favorites list.
//                        data: { anchor, items: [{artist,title,runtime,note}] }
//                        empty items -> the group's open prompts render instead.
//   type 'faq'        -> si-section + Banner(heading) + Q/A list. emits FAQ
//                        schema once answers are filled.
//                        data: { anchor, items: [{ question }] }
//   type 'prompt'     -> first-class open authoring task. status open|filled.
//                        body = the WRITE instruction (open) / the written copy
//                        (filled). Rendered INSIDE its group's si-prose box.
//                        data: {
//                          group,                 // anchor of the container it nests under
//                          placement?: 'before'|'after',  // vs the container body (default 'after')
//                          order?: number,        // sort within placement
//                          faqIndex?: number      // for group 'faq': which question it answers
//                        }
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(__dirname, "../.env.local");
fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
  const [k, ...rest] = line.split("=");
  if (k && rest.length) process.env[k.trim()] = rest.join("=").trim();
});

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const researchHtml = fs
  .readFileSync(path.resolve(__dirname, "seed-data/songs-over-5min-research.html"), "utf-8")
  .trim();

type SectionSeed = {
  type: string;
  position: number;
  heading?: string | null;
  body?: string | null;
  data?: Record<string, unknown>;
  status?: "open" | "filled" | null;
};

// ===========================================================================
// 1. Standalone pages
// ===========================================================================

// super-individual and songwriting keep their CODE renderers for now (light
// seed: record + SEO only). template 'managed' marks code-rendered pages whose
// pages.seo_* is informational until the renderer is migrated. songs-over-5
// -minutes is the DB-render target (template 'standard'); Phase 5 flips it.

const STANDALONE_PAGES: Array<{
  slug: string;
  title: string;
  template: string;
  status: string;
  parentSlug: string | null;
  seo_title: string | null;
  seo_description: string | null;
  sections?: SectionSeed[];
}> = [
  {
    slug: "super-individual",
    title: "Super Individual",
    template: "managed",
    status: "published",
    parentSlug: null,
    seo_title: "Super Individual - Take Back Your Power",
    // em dash in the source replaced with a hyphen (house style: no em dashes).
    seo_description:
      "Super Individual (noun): A sovereign human being that has fully reclaimed their power from and operates outside of the failing institutions of modernity. Chad Lewine's Super Individual Series - withdraw from institutional modernity, starting with your soundtrack.",
  },
  {
    slug: "songwriting",
    title: "Songwriting",
    template: "managed",
    status: "published",
    parentSlug: null,
    seo_title: "Songwriting - Sing My Songs or Complete Your Vision",
    seo_description:
      "Chad Lewine writes more songs than he can record and wants them sung. Sing one of his finished songs, or have him co-write and complete your own vision into a song. Positive, message-driven, genre-irrelevant.",
  },
  {
    slug: "music/songs-over-5-minutes",
    title: "Songs Over Five Minutes",
    template: "standard",
    status: "published",
    parentSlug: "music",
    // seo_title intentionally NULL: the bare title flows through the global
    // "%s - Chad Lewine" template for one suffix, matching current output.
    seo_title: null,
    seo_description:
      "Chad Lewine's songs that run longer than five minutes, with a look at the research on why a song needs runtime to move a listener into a state.",
    sections: buildSongsOver5Sections(),
  },

  // --- Alias history (PRIVATE working page, status 'draft'). One page holding
  // the whole arc: the cleaned spark outline for every era plus the open WRITE
  // prompts. Draft = not public (anon RLS blocks it; routes 404); edited in
  // /admin/pages. ---
  {
    slug: "alias-history",
    title: "Alias History",
    template: "standard",
    status: "draft",
    parentSlug: null,
    seo_title: "Alias History",
    seo_description: null,
    sections: buildAliasHistorySections(),
  },

  // --- Individual alias slug pages: stand on their own, EMPTY for now, and
  // PRIVATE (status 'draft'). Sections intentionally empty; fill + publish each
  // later in /admin/pages. ---
  {
    slug: "chad-d",
    title: "Chad D",
    template: "standard",
    status: "draft",
    parentSlug: null,
    seo_title: "Chad D",
    seo_description: null,
    sections: [],
  },
  {
    slug: "honeychrome",
    title: "HoneyChrome",
    template: "standard",
    status: "draft",
    parentSlug: null,
    seo_title: "HoneyChrome",
    seo_description: null,
    sections: [],
  },
  {
    slug: "chad-rising",
    title: "Chad Rising",
    template: "standard",
    status: "draft",
    parentSlug: null,
    seo_title: "Chad Rising",
    seo_description: null,
    sections: [],
  },
];

function buildSongsOver5Sections(): SectionSeed[] {
  return [
    {
      type: "hero",
      position: 0,
      heading: null,
      body: null,
      data: { eyebrow: "Chad Lewine's longer songs", headline: "Songs Over Five Minutes" },
    },

    // --- intro group (banner only; content is two open prompts) ---
    {
      type: "prose",
      position: 10,
      heading: "Why these songs run long",
      body: null,
      data: { anchor: "intro" },
    },
    {
      type: "prompt",
      position: 11,
      heading: "Citation line",
      status: "open",
      body:
        "The citation line. One sentence an AI engine can quote when someone asks about your long songs. Lead with the fact (your songs over five minutes) and your stance on why they run that long. This is the most important sentence on the page.",
      data: { group: "intro", placement: "after", order: 0 },
    },
    {
      type: "prompt",
      position: 12,
      heading: "The case for the runtime",
      status: "open",
      body:
        "The case for the runtime, in your voice. The machine / short-song critique, why you refuse to cut a song down to a clipped hook, what the extra minutes are actually for. A few paragraphs. Surface, thread, link.",
      data: { group: "intro", placement: "after", order: 1 },
    },

    // --- live track grid ---
    {
      type: "track-grid",
      position: 20,
      heading: "My Songs Over Five Minutes",
      body: null,
      data: { anchor: "songs", source: "songs_over_5min" },
    },

    // --- favorites group (empty list -> two open prompts) ---
    {
      type: "favorites",
      position: 30,
      heading: "Some Of My Favorite Songs Over Five Minutes",
      body: null,
      data: { anchor: "favorites", items: [] },
    },
    {
      type: "prompt",
      position: 31,
      heading: "Favorites intro line",
      status: "open",
      body:
        "One short intro line in your voice: these are other artists' songs over five minutes that you love, and what you look for in a long song that earns its length.",
      data: { group: "favorites", placement: "after", order: 0 },
    },
    {
      type: "prompt",
      position: 32,
      heading: "Populate the favorites list",
      status: "open",
      body:
        "Populate the favorites list (artist, title, runtime, and a line on why it works). They will render here as a list once you add them.",
      data: { group: "favorites", placement: "after", order: 1 },
    },

    // --- research group (framing prompt -> written prose -> closing prompt) ---
    {
      type: "research",
      position: 40,
      heading: "What The Research Says",
      body: researchHtml,
      data: { anchor: "research" },
    },
    {
      type: "prompt",
      position: 41,
      heading: "Your framing of the research",
      status: "open",
      body:
        "Your framing of the research below, in your voice. Tie it to your songs: the runtime is not indulgence, it is the mechanism. Use the studies as the proof, the way you show the math in your Observations.",
      data: { group: "research", placement: "before", order: 0 },
    },
    {
      type: "prompt",
      position: 42,
      heading: "Optional: the over-four-minutes study",
      status: "open",
      body:
        "Optional: add the one specific study you mentioned (the over-four-minutes one) once you have the exact citation, and I will wire it in here with the rest.",
      data: { group: "research", placement: "after", order: 0 },
    },

    // --- faq group (four questions, each answer an open prompt) ---
    {
      type: "faq",
      position: 50,
      heading: "Questions",
      body: null,
      data: {
        anchor: "faq",
        items: [
          { question: "What is the longest song Chad Lewine has released?" },
          { question: "Why are some of Chad Lewine's songs so long?" },
          { question: "What does the research say about long songs?" },
          { question: "Where can I listen to Chad Lewine's long songs?" },
        ],
      },
    },
    {
      type: "prompt",
      position: 51,
      heading: "FAQ: longest song",
      status: "open",
      body: "Answer in your voice. Name the song and its runtime, then one line on it.",
      data: { group: "faq", faqIndex: 0 },
    },
    {
      type: "prompt",
      position: 52,
      heading: "FAQ: why so long",
      status: "open",
      body: "Answer in your voice. The short-song critique, what the runtime is for.",
      data: { group: "faq", faqIndex: 1 },
    },
    {
      type: "prompt",
      position: 53,
      heading: "FAQ: what research says",
      status: "open",
      body: "Answer in your voice, drawing on the studies above. First sentence quotable.",
      data: { group: "faq", faqIndex: 2 },
    },
    {
      type: "prompt",
      position: 54,
      heading: "FAQ: where to listen",
      status: "open",
      body: "Answer in your voice. Point to the list on this page and the song pages.",
      data: { group: "faq", faqIndex: 3 },
    },

    // --- how the list is built (factual prose, no prompts) ---
    {
      type: "prose",
      position: 60,
      heading: "How This List Is Built",
      body:
        "<p>This page builds itself. Any song longer than five minutes shows up here automatically, ordered from longest to shortest, so the list stays current as the catalog grows. The favorites and the writing above are hand-kept.</p>",
      data: { anchor: "how" },
    },
  ];
}

// Alias History = hero + one block per era. Each era block is a prose container
// (the cleaned spark outline + that era's releases) followed by an open WRITE
// prompt nested in the same group. Prompts render as "WRITE:" scaffolds until
// filled in /admin/pages.
function buildAliasHistorySections(): SectionSeed[] {
  const eras = [
    {
      anchor: "chad-d",
      heading: "Chad D - The naive pop star",
      sparkHtml:
        "<ul>" +
        "<li>Rapper, tied to his mother, gay, full of agendas.</li>" +
        "<li>The blind spot: he claimed positive music as his differentiator, but had not actually vetted his own lyrics or lifestyle to match the claim.</li>" +
        "<li>Cutting his teeth.</li>" +
        "<li>Pure pop-industry stardom as the goal, with positive messages as the differentiator -- but outside the lyrics, nothing set him apart from any other dream-chaser.</li>" +
        "</ul>" +
        "<p><strong>Releases:</strong> Demoesque, The Human Link, Williamsburgadelphia, Life as a Student.</p>",
      promptBody:
        "Write the Chad D era in Chad's voice, expanding the notes above. This is the naive pop-star phase -- a rapper, still tied to his mother, gay, full of agendas, cutting his teeth, chasing pure pop-industry stardom. The defining tension is the blind spot: he sold 'positive music' as his edge but had not vetted his own lyrics or life to back the claim, so outside the lyrics he was indistinguishable from any other dream-chaser. Write it as honest hindsight, not nostalgia -- name the naivety directly. A few short paragraphs. Match the voice of the /chad-lewine about page.",
    },
    {
      anchor: "honeychrome",
      heading: "HoneyChrome - The DIY defector",
      sparkHtml:
        "<ul>" +
        "<li>Embracing the fact that he is alternative by nature.</li>" +
        "<li>EDM / trap / electronic-based DIY.</li>" +
        "<li>The starving artist.</li>" +
        "<li>Conscious now, but with ego, sex and substance still mixed in.</li>" +
        "</ul>" +
        "<p><strong>Releases:</strong> HoneyChrome (fka The Chocolate Album), Daylight Animal, All The Right Places, Sprout, Feeling High.</p>",
      promptBody:
        "Write the HoneyChrome era in Chad's voice, expanding the notes above. This is the DIY defector -- the moment he stopped fighting that he is alternative by nature and leaned in: electronic, EDM/trap, fully self-made, the starving artist. He was waking up, but ego, sex and substance were still in the mix -- growth and indulgence at once. Hold that contradiction honestly: more awake, still entangled. A few short paragraphs. Match the voice of the /chad-lewine about page.",
    },
    {
      anchor: "return",
      heading: "Brief return to Chad Lewine - The reset",
      sparkHtml:
        "<ul>" +
        "<li>Moving back to his hometown.</li>" +
        "<li>The reset -- but he still had not faced his demons.</li>" +
        "<li>He dropped the act, but the real person underneath was still deep in the theatrics of life.</li>" +
        "</ul>" +
        "<p><strong>Releases:</strong> Riptide, The Gap, 35, Dark Nights.</p>",
      promptBody:
        "Write the brief return-to-Chad-Lewine phase in Chad's voice, expanding the notes above. He moved back to his hometown and dropped the act, but it was an incomplete reset: he still had not faced his demons, and the real person underneath was still caught in the theatrics of life. The name went back to his own, but the transformation had not happened yet. Frame it as a false summit -- a return that looked like arrival but was not. A few short paragraphs. Match the voice of the /chad-lewine about page.",
    },
    {
      anchor: "chad-rising",
      heading: "Chad Rising - The bridge",
      sparkHtml:
        "<ul>" +
        "<li>A fusion of the two eras before, plus a new third element: maturity.</li>" +
        "<li>The product was finally commercially viable, and cheap enough to make regularly with real time and money behind it.</li>" +
        "<li>He stopped hiding the mission inside the lyrics alone and started fully embodying himself -- but kept a stage name, both to be cool and to separate his personal life from the music.</li>" +
        "<li>Business: accepting he has to play the game, but doing it his own way.</li>" +
        "</ul>" +
        "<p><strong>Releases:</strong> Pivotal Days, HYPERISING, Don't Blame Me.</p>",
      promptBody:
        "Write the Chad Rising era in Chad's voice, expanding the notes above. This is the bridge -- a fusion of the naive pop star and the DIY defector, plus a new third element, maturity. The product finally became commercially viable and cheap enough to make regularly with real time and money behind it. He stopped hiding the mission inside the lyrics alone and started embodying it, while still keeping a stage name to stay cool and to wall his personal life off from the music. The throughline: accepting he has to play the game, but on his own terms. A few short paragraphs. Match the voice of the /chad-lewine about page.",
    },
    {
      anchor: "chad-lewine",
      heading: "Chad Lewine - The deprogrammer",
      sparkHtml:
        "<ul>" +
        "<li>All of the above, now integrated.</li>" +
        "<li>Unshakable confidence in self, product and ability to execute.</li>" +
        "<li>Channel-level attunement in lyrical output.</li>" +
        "<li>Total withdrawal and disconnection from the game / the system / the industry.</li>" +
        "<li>Total rejection of institutional standards and precedents.</li>" +
        "</ul>" +
        "<p><strong>Releases:</strong> The Rising Trilogy (Transmuter, Translator, Transcender -- planned).</p>",
      promptBody:
        "Write the final, integrated Chad Lewine era in Chad's voice, expanding the notes above -- the deprogrammer. Every prior self is now integrated: unshakable confidence in himself, his product, and his ability to execute; channel-level attunement in his lyrical output; total withdrawal from the game, the system, the industry; total rejection of institutional standards and precedents. This is the culmination the other four eras built toward. The existing /chad-lewine bio already gestures at this -- build the arc on top of it without contradicting it. A few short paragraphs.",
    },
  ];

  const sections: SectionSeed[] = [
    {
      type: "hero",
      position: 0,
      heading: null,
      body: null,
      data: { eyebrow: "Former aliases", headline: "Alias History" },
    },
  ];

  eras.forEach((era, i) => {
    const base = 10 + i * 10;
    sections.push({
      type: "prose",
      position: base,
      heading: era.heading,
      body: era.sparkHtml,
      data: { anchor: era.anchor },
    });
    sections.push({
      type: "prompt",
      position: base + 1,
      heading: `Write: ${era.heading}`,
      status: "open",
      body: era.promptBody,
      data: { group: era.anchor, placement: "after", order: 0 },
    });
  });

  return sections;
}

// ===========================================================================
// 2. Managed-page inventory (MANAGED_PAGES) -- code-rendered; record + SEO only
// ===========================================================================
// Kept in sync with src/lib/managed-pages.ts. slug = route without the leading
// slash ('/' -> 'home'). SEO is carried only where page_meta has a real
// override (read from the DB below); otherwise left blank to fall back to each
// page's code DEFAULT_METADATA.

const MANAGED_PAGES: Array<{ route: string; label: string }> = [
  { route: "/", label: "Home" },
  { route: "/chad-lewine", label: "About (Chad Lewine)" },
  { route: "/radiant-arc", label: "Radiant Arc" },
  { route: "/foundations", label: "Foundations (index)" },
  { route: "/art", label: "Art" },
  { route: "/videos", label: "Videos" },
  // chad-rising / chad-d / honeychrome moved to STANDALONE_PAGES (CMS 'standard').
  { route: "/discography", label: "Discography" },
  { route: "/music", label: "Music" },
  { route: "/curation", label: "Curation (index)" },
  { route: "/curation/cl-stream", label: "CL Stream" },
  { route: "/archive/xanga", label: "Xanga Archive" },
  { route: "/business", label: "Business" },
  { route: "/merch", label: "Merch" },
  { route: "/observations", label: "Observations (index)" },
  { route: "/journal", label: "Journal (index)" },
  { route: "/lyrics", label: "Lyrics (index)" },
  { route: "/meditations", label: "Meditations (index)" },
];

function routeToPageSlug(route: string): string {
  return route === "/" ? "home" : route.replace(/^\//, "");
}

async function main() {
  console.log("Pages CMS seed\n");

  // --- carry page_meta overrides (read from DB; avoids hardcoding values) ---
  const { data: metaRows } = await db.from("page_meta").select("route, title, description, og_image_path");
  const metaByRoute = new Map<string, { title: string | null; description: string | null; og_image_path: string | null }>();
  for (const m of metaRows || []) metaByRoute.set(m.route, m);

  // --- upsert standalone pages ---
  for (const p of STANDALONE_PAGES) {
    const { error } = await db.from("pages").upsert(
      {
        slug: p.slug,
        title: p.title,
        template: p.template,
        status: p.status,
        seo_title: p.seo_title,
        seo_description: p.seo_description,
        sort_order: 0,
      },
      { onConflict: "slug" },
    );
    if (error) throw new Error(`upsert page ${p.slug}: ${error.message}`);
    console.log(`page  ${p.slug}`);
  }

  // --- upsert managed inventory pages ---
  for (let i = 0; i < MANAGED_PAGES.length; i++) {
    const mp = MANAGED_PAGES[i];
    const slug = routeToPageSlug(mp.route);
    const meta = metaByRoute.get(mp.route);
    const { error } = await db.from("pages").upsert(
      {
        slug,
        title: mp.label,
        template: "managed",
        status: "published",
        seo_title: meta?.title ?? null,
        seo_description: meta?.description ?? null,
        og_image_path: meta?.og_image_path ?? null,
        sort_order: 100 + i,
      },
      { onConflict: "slug" },
    );
    if (error) throw new Error(`upsert managed ${slug}: ${error.message}`);
  }
  console.log(`managed inventory: ${MANAGED_PAGES.length} pages`);

  // --- resolve parent_id by parentSlug (second pass; parents now exist) ---
  const { data: allPages } = await db.from("pages").select("id, slug");
  const idBySlug = new Map<string, string>();
  for (const row of allPages || []) idBySlug.set(row.slug, row.id);

  for (const p of STANDALONE_PAGES) {
    if (!p.parentSlug) continue;
    const parentId = idBySlug.get(p.parentSlug);
    if (!parentId) {
      console.log(`  (warn) parent '${p.parentSlug}' not found for ${p.slug}`);
      continue;
    }
    const { error } = await db.from("pages").update({ parent_id: parentId }).eq("slug", p.slug);
    if (error) throw new Error(`set parent ${p.slug}: ${error.message}`);
    console.log(`  parent ${p.slug} -> ${p.parentSlug}`);
  }
  // managed children: link curation/cl-stream and archive/xanga style slugs
  for (const mp of MANAGED_PAGES) {
    const slug = routeToPageSlug(mp.route);
    if (!slug.includes("/")) continue;
    const parentSlug = slug.slice(0, slug.lastIndexOf("/"));
    const parentId = idBySlug.get(parentSlug);
    if (!parentId) continue;
    await db.from("pages").update({ parent_id: parentId }).eq("slug", slug);
  }

  // --- seed sections for pages that carry them (delete + insert) ---
  for (const p of STANDALONE_PAGES) {
    if (!p.sections) continue;
    const pageId = idBySlug.get(p.slug);
    if (!pageId) throw new Error(`page id missing for ${p.slug}`);

    const { error: delErr } = await db.from("page_sections").delete().eq("page_id", pageId);
    if (delErr) throw new Error(`clear sections ${p.slug}: ${delErr.message}`);

    const rows = p.sections.map((s) => ({
      page_id: pageId,
      type: s.type,
      position: s.position,
      heading: s.heading ?? null,
      body: s.body ?? null,
      data: s.data ?? {},
      status: s.status ?? null,
    }));
    if (rows.length === 0) {
      console.log(`  sections ${p.slug}: 0 (cleared)`);
      continue;
    }
    const { error: insErr } = await db.from("page_sections").insert(rows);
    if (insErr) throw new Error(`insert sections ${p.slug}: ${insErr.message}`);
    console.log(`  sections ${p.slug}: ${rows.length} (${rows.filter((r) => r.type === "prompt").length} prompts)`);
  }

  // --- report ---
  const { data: prompts } = await db
    .from("page_prompts")
    .select("page_slug, status")
    .eq("status", "open");
  const openByPage = new Map<string, number>();
  for (const pr of prompts || []) openByPage.set(pr.page_slug, (openByPage.get(pr.page_slug) || 0) + 1);
  console.log("\nOpen prompts by page (via page_prompts view):");
  if (openByPage.size === 0) console.log("  (none)");
  for (const [slug, n] of openByPage) console.log(`  ${slug}: ${n}`);

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

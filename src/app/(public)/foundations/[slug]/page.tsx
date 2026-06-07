import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { SynapseDisplay } from "@/components/SynapseDisplay";

export const revalidate = 60;

async function getFoundation(slug: string) {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("foundations")
    .select("*")
    .eq("slug", slug)
    .single();
  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const f = await getFoundation(slug);
  if (!f) return {};
  // No dedicated summary column on foundations; fall back to a cleaned snippet
  // of the body (markdown stripped) when no meta description is set.
  const bodySnippet = (f.body || "")
    .replace(/[#>*_`~\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 155);
  const description = f.seo_description || bodySnippet || `${f.title} by Chad Lewine.`;
  // A set seo_title renders exactly (absolute bypasses the root brand template);
  // otherwise the bare title gets a single "- Chad Lewine" suffix.
  const seoTitle = f.seo_title?.trim();
  const ogTitle = seoTitle || `${f.title} — Chad Lewine`;
  return {
    title: seoTitle ? { absolute: seoTitle } : f.title,
    description,
    alternates: {
      canonical: `https://chadlewine.com/foundations/${slug}`,
    },
    openGraph: {
      type: "article",
      title: ogTitle,
      description,
      url: `https://chadlewine.com/foundations/${slug}`,
    },
  };
}

export default async function FoundationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const f = await getFoundation(slug);
  if (!f) notFound();

  return (
    <article id="page-foundation" className="page-static">
      <h1 className="page-static__title">
        {f.title}
      </h1>
      <MarkdownRenderer html={f.body} />
      <SynapseDisplay sourceType="foundation" sourceId={f.id} />
    </article>
  );
}

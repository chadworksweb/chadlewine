import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

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
  return {
    title: f.title,
    alternates: {
      canonical: `https://chadlewine.com/foundations/${slug}`,
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
    </article>
  );
}

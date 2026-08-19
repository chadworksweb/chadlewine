import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VideoLibrary } from "../library";
import { fetchVideo, fetchVideoSlugs, videoUrl } from "../data";

export const revalidate = 60;

// Every published video prerenders. A video published after the last build is
// still reachable -- it renders on first request and is cached from then on.
export async function generateStaticParams() {
  const slugs = await fetchVideoSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const video = await fetchVideo(slug);
  if (!video) return {};

  // absolute: the title already carries the brand, so the root
  // "%s - Chad Lewine" template must not append a second one.
  const title = video.seo_title?.trim() || `${video.title} by Chad Lewine`;
  const description =
    video.seo_description?.trim() ||
    video.description?.trim() ||
    `${video.title}, a video by Chad Lewine.`;
  const url = videoUrl(video.slug);

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "video.other",
      title,
      description,
      url,
      ...(video.thumbnail_path
        ? { images: [{ url: video.thumbnail_path, alt: video.title }] }
        : {}),
    },
  };
}

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // 404 rather than silently falling back to the library, so an unpublished or
  // renamed video does not quietly serve a 200 under its old URL.
  const video = await fetchVideo(slug);
  if (!video) notFound();

  return <VideoLibrary activeSlug={slug} />;
}

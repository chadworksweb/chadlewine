export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

/**
 * Generate a thumbnail URL from a Supabase Storage public URL.
 * Uses Supabase Image Transformation if the URL is from storage,
 * otherwise returns the original URL.
 */
export function thumbnailUrl(url: string, width = 300, height = 300): string {
  if (!url) return "";
  // Supabase storage public URLs: /storage/v1/object/public/bucket/file
  // Transform endpoint: /storage/v1/render/image/public/bucket/file?width=X&height=Y
  if (url.includes("/storage/v1/object/public/")) {
    return url.replace(
      "/storage/v1/object/public/",
      "/storage/v1/render/image/public/"
    ) + `?width=${width}&height=${height}&resize=contain`;
  }
  return url;
}

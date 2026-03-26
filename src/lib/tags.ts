import { createAdminClient, createPublicClient } from "@/lib/supabase-server";

export interface Tag {
  id: string;
  slug: string;
  label: string;
}

export async function getTags(): Promise<Tag[]> {
  const supabase = createPublicClient();
  const { data } = await supabase.from("tags").select("id, slug, label").order("label");
  return data || [];
}

export async function getTagsAdmin(): Promise<Tag[]> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("tags").select("id, slug, label").order("label");
  return data || [];
}

export function getTagLabel(id: string, tags: Tag[]): string {
  return tags.find((t) => t.id === id)?.label ?? id;
}

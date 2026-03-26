import { createAdminClient, createPublicClient } from "@/lib/supabase-server";

export interface Thoughtline {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  created_at: string;
}

export async function getThoughtlines(): Promise<Thoughtline[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("thoughtlines")
    .select("id, title, slug, description, created_at")
    .order("title");
  return data || [];
}

export async function getThoughtlinesAdmin(): Promise<Thoughtline[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("thoughtlines")
    .select("id, title, slug, description, created_at")
    .order("title");
  return data || [];
}

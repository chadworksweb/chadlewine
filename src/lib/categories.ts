import { createAdminClient, createPublicClient } from "@/lib/supabase-server";

export interface Category {
  id: string;
  title: string;
  slug: string;
  created_at: string;
}

export async function getCategories(): Promise<Category[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("categories")
    .select("id, title, slug, created_at")
    .order("title");
  return data || [];
}

export async function getCategoriesAdmin(): Promise<Category[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("categories")
    .select("id, title, slug, created_at")
    .order("title");
  return data || [];
}

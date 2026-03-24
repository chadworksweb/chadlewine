import { createAdminClient, createPublicClient } from "@/lib/supabase-server";

export interface Domain {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
}

/** Fetch all domains from Supabase (server-side, public read) */
export async function getDomains(): Promise<Domain[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("domains")
    .select("id, slug, label, sort_order")
    .order("sort_order");
  return data || [];
}

/** Fetch all domains using admin client (for API routes) */
export async function getDomainsAdmin(): Promise<Domain[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("domains")
    .select("id, slug, label, sort_order")
    .order("sort_order");
  return data || [];
}

export function getDomainLabel(slug: string, domains: Domain[]): string {
  const domain = domains.find((d) => d.slug === slug);
  return domain?.label ?? slug;
}

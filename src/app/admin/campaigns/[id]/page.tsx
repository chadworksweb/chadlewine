import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-server";
import { CampaignEditor, type CampaignData } from "@/components/CampaignEditor";

export const dynamic = "force-dynamic";

export default async function AdminCampaignEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  return <CampaignEditor initial={data as CampaignData} />;
}

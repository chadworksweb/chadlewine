import { createAdminClient } from "@/lib/supabase-server";

// TODO: Implement actual file delivery
// Flow: purchase webhook → generate token + expiry → store in purchases row → email buyer
// This route validates the token and redirects to the file

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, item_type, item_id, download_url, download_expires_at")
    .eq("id", token)
    .single();

  if (!purchase) {
    return new Response("Not found", { status: 404 });
  }

  if (!purchase.download_url) {
    return new Response("Download not yet available", { status: 202 });
  }

  if (purchase.download_expires_at && new Date(purchase.download_expires_at) < new Date()) {
    return new Response("Download link expired", { status: 410 });
  }

  return Response.redirect(purchase.download_url, 302);
}

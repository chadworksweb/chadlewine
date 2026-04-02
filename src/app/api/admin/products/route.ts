import { createAdminClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();

  const { data, error } = await supabase
    .from("products")
    .insert({
      tier: body.tier,
      fulfillment: body.fulfillment || "printify_curated",
      title: body.title,
      description: body.description || null,
      source_observation_id: body.source_observation_id || null,
      printify_product_id: body.printify_product_id || null,
      price: body.price || null,
      image_url: body.image_url || null,
      image_alt: body.image_alt || null,
      status: body.status || "active",
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}

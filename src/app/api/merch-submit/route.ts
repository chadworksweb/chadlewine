import { createPublicClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const body = await request.json();
  const { buyer_email, product_config } = body;

  if (!buyer_email || !product_config) {
    return Response.json({ error: "buyer_email and product_config required" }, { status: 400 });
  }

  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("product_submissions")
    .insert({
      buyer_email,
      product_config,
      status: "pending",
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}

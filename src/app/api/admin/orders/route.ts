import { createAdminClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));
  const search = (searchParams.get("search") || "").trim();
  const status = (searchParams.get("status") || "").trim();

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("orders")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (search) {
    const pattern = `%${search}%`;
    query = query.or(
      `buyer_email.ilike.${pattern},order_number.ilike.${pattern},buyer_name.ilike.${pattern}`,
    );
  }

  const { data, error, count } = await query.range(from, to);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    orders: data || [],
    page,
    limit,
    total: count || 0,
    pages: Math.ceil((count || 0) / limit),
  });
}

import { computeCrossSell, type CartRef } from "@/lib/cross-sell";

// POST /api/cross-sell { items: [{ type, id }] }  (the current cart)
export async function POST(request: Request) {
  let body: { items?: CartRef[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ products: [] });
  }
  const items = Array.isArray(body.items) ? body.items : [];
  return Response.json({ products: await computeCrossSell(items) });
}

import { getBlueprints, getShopProducts } from "@/lib/printify";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  try {
    if (action === "blueprints") {
      const blueprints = await getBlueprints();
      return Response.json(blueprints);
    }

    if (action === "shop-products") {
      const products = await getShopProducts();
      return Response.json(products);
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

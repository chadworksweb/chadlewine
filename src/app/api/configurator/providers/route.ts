import { getPrintProviders } from "@/lib/printify";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const blueprintId = searchParams.get("blueprint_id");

  if (!blueprintId) {
    return Response.json({ error: "blueprint_id required" }, { status: 400 });
  }

  try {
    const providers = await getPrintProviders(Number(blueprintId));
    return Response.json(providers);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

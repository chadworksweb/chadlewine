import { getVariants } from "@/lib/printify";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const blueprintId = searchParams.get("blueprint_id");
  const providerId = searchParams.get("provider_id");

  if (!blueprintId || !providerId) {
    return Response.json({ error: "blueprint_id and provider_id required" }, { status: 400 });
  }

  try {
    const result = await getVariants(Number(blueprintId), Number(providerId));
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

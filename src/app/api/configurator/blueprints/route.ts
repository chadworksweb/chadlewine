import { getBlueprints } from "@/lib/printify";

export async function GET() {
  try {
    const blueprints = await getBlueprints();
    return Response.json(blueprints);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

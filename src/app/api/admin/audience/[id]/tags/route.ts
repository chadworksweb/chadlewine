import { addTag, removeTag } from "@/lib/audience";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));
  const tag = typeof body.tag === "string" ? body.tag.trim() : "";
  if (!tag) return Response.json({ error: "Tag required" }, { status: 400 });
  await addTag(id, tag);
  return Response.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));
  const tag = typeof body.tag === "string" ? body.tag.trim() : "";
  if (!tag) return Response.json({ error: "Tag required" }, { status: 400 });
  await removeTag(id, tag);
  return Response.json({ ok: true });
}

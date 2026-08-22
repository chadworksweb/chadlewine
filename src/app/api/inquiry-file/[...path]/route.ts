import {
  inquiryFileContentType,
  readInquiryFile,
  verifyInquiryFileToken,
} from "@/lib/inquiry-files";

/* Serves inquiry attachments from the instance disk behind an HMAC-signed URL.
   Links are minted by signInquiryFileUrl (notification email, admin page);
   nothing here is browsable without a valid token. */

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const relPath = segments.map(decodeURIComponent).join("/");

  const url = new URL(req.url);
  const expires = Number(url.searchParams.get("expires"));
  const token = url.searchParams.get("token") || "";

  if (!verifyInquiryFileToken(relPath, expires, token)) {
    return new Response("Not found", { status: 404 });
  }

  const buf = await readInquiryFile(relPath);
  if (!buf) return new Response("Not found", { status: 404 });

  const name = relPath.split("/").pop() || "file";
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": inquiryFileContentType(relPath),
      "Content-Length": String(buf.length),
      "Content-Disposition": `inline; filename="${name.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

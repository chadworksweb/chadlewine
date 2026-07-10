import QRCode from "qrcode";
import { getEventForAdmin } from "@/lib/events";
import { siteOrigin } from "@/lib/resend";

export const runtime = "nodejs";

// GET /api/admin/events/[id]/qr -- PNG of the venue check-in QR. The payload is
// the ABSOLUTE production check-in URL so a printed code works at the door.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const event = await getEventForAdmin(id);
  if (!event) return Response.json({ error: "Event not found" }, { status: 404 });

  const url = `${siteOrigin()}/irl/checkin/${event.checkin_token}`;
  const png = await QRCode.toBuffer(url, {
    type: "png",
    width: 900,
    margin: 2,
    errorCorrectionLevel: "M",
  });

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
}

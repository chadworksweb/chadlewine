import { buildPopupIcsContent } from "@/components/SuperIndividualPopup";

export const dynamic = "force-static";

export async function GET() {
  const body = buildPopupIcsContent();
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="super-individual-pop-up.ics"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSubscribeModalConfig } from "@/lib/subscribe-modal";
import { getCurrentSession } from "@/lib/account";

// Eligibility gate for the subscribe modal. This logic used to run in the
// (public) layout, but reading session + IP there forced every public page into
// dynamic rendering. It lives here now (a dynamic route, which does not affect
// page caching) and the modal controller calls it client-side before arming.
// Logic is preserved exactly: privileged visitors (admin OR an admin IP) only
// see the modal in test mode; everyone else sees it unless signed in.
export const dynamic = "force-dynamic";

export async function GET() {
  const modalConfig = await getSubscribeModalConfig();
  if (!modalConfig.enabled) {
    return NextResponse.json({ eligible: false });
  }
  const session = await getCurrentSession();
  const fwd = (await headers()).get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0] : "").trim();
  const privileged =
    !!session?.isAdmin || (!!ip && modalConfig.adminIps.includes(ip));
  const eligible = privileged ? modalConfig.testMode : !session;
  return NextResponse.json({ eligible });
}

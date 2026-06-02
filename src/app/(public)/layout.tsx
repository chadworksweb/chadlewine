import { cookies, headers } from "next/headers";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { SubscribeSection } from "@/components/SubscribeSection";
import { SubscribeModalController } from "@/components/SubscribeModalController";
import { PatronageWidget } from "@/components/PatronageWidget";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";
import { PostHogProvider } from "@/components/PostHogProvider";
import { getVisibleNavItems } from "@/lib/nav-visibility";
import { getSubscribeModalConfig } from "@/lib/subscribe-modal";
import { getCurrentSession } from "@/lib/account";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const navItems = await getVisibleNavItems();
  // Cheap server-side hint: cookie presence implies signed in. The Nav still
  // verifies via /api/auth/me after hydration, so an expired token corrects
  // itself — but the Account/Login link renders in the first paint either way.
  const cookieStore = await cookies();
  const initialSignedIn = !!cookieStore.get("sb-access-token")?.value;

  // Decide server-side whether to mount the subscribe modal. Privileged
  // visitors (admins, or Chad's configured IPs) only see it in test mode;
  // everyone else sees it unless signed in (account holders already get email).
  const modalConfig = await getSubscribeModalConfig();
  let mountModal = false;
  if (modalConfig.enabled) {
    const session = await getCurrentSession();
    const fwd = (await headers()).get("x-forwarded-for");
    const ip = (fwd ? fwd.split(",")[0] : "").trim();
    const privileged =
      !!session?.isAdmin || (!!ip && modalConfig.adminIps.includes(ip));
    mountModal = privileged ? modalConfig.testMode : !session;
  }

  return (
    <PostHogProvider>
    <AnalyticsProvider>
      <Nav items={navItems} initialSignedIn={initialSignedIn} />
      <main>{children}</main>
      <SubscribeSection />
      <section className="site-patronage">
        <PatronageWidget />
      </section>
      <Footer />
      {mountModal && (
        <SubscribeModalController
          dwellSeconds={modalConfig.dwellSeconds}
          cartDwellSeconds={modalConfig.cartDwellSeconds}
          scrollDepthPct={modalConfig.scrollDepthPct}
          reshowDays={modalConfig.reshowDays}
        />
      )}
    </AnalyticsProvider>
    </PostHogProvider>
  );
}

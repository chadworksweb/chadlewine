import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { SubscribeSection } from "@/components/SubscribeSection";
import { SubscribeModalController } from "@/components/SubscribeModalController";
import { PatronageWidget } from "@/components/PatronageWidget";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";
import { PostHogProvider } from "@/components/PostHogProvider";
import { getVisibleNavItems } from "@/lib/nav-visibility";
import { getSubscribeModalConfig } from "@/lib/subscribe-modal";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // navItems + modalConfig are global config (nav table / site_settings) with no
  // per-visitor data, so awaiting them does NOT force dynamic rendering. The
  // per-visitor reads that used to live here were moved off the server render so
  // public pages can be statically cached (ISR) again:
  //   - signed-in hint     -> Nav resolves it client-side via /api/auth/me
  //   - modal eligibility  -> SubscribeModalController checks session/admin/IP
  //                           client-side via /api/subscribe-modal/eligible
  const [navItems, modalConfig] = await Promise.all([
    getVisibleNavItems(),
    getSubscribeModalConfig(),
  ]);

  return (
    <PostHogProvider>
    <AnalyticsProvider>
      <Nav items={navItems} />
      <main>{children}</main>
      <SubscribeSection />
      <section className="site-patronage">
        <PatronageWidget />
      </section>
      <Footer />
      {modalConfig.enabled && (
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

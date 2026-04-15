import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { SubscribeSection } from "@/components/SubscribeSection";
import { PatronageWidget } from "@/components/PatronageWidget";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";
import { PostHogProvider } from "@/components/PostHogProvider";
import { getVisibleNavItems } from "@/lib/nav-visibility";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const navItems = await getVisibleNavItems();
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
    </AnalyticsProvider>
    </PostHogProvider>
  );
}

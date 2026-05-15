import { cookies } from "next/headers";
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
  // Cheap server-side hint: cookie presence implies signed in. The Nav still
  // verifies via /api/auth/me after hydration, so an expired token corrects
  // itself — but the Account/Login link renders in the first paint either way.
  const cookieStore = await cookies();
  const initialSignedIn = !!cookieStore.get("sb-access-token")?.value;
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
    </AnalyticsProvider>
    </PostHogProvider>
  );
}

import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { SubscribeSection } from "@/components/SubscribeSection";
import { PatronageWidget } from "@/components/PatronageWidget";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";
import { PostHogProvider } from "@/components/PostHogProvider";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PostHogProvider>
    <AnalyticsProvider>
      <Nav />
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

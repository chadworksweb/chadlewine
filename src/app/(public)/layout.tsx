import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { SubscribeSection } from "@/components/SubscribeSection";
import { PatronageWidget } from "@/components/PatronageWidget";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AnalyticsProvider>
      <Nav />
      <main>{children}</main>
      <SubscribeSection />
      <section className="site-patronage">
        <PatronageWidget />
      </section>
      <Footer />
    </AnalyticsProvider>
  );
}

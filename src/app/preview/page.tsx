import { PreviewSlideshow } from "@/components/PreviewSlideshow";
import { SubscribeSection } from "@/components/SubscribeSection";

export default function PreviewPage() {
  return (
    <>
      <div className="placeholder-hero">
        <PreviewSlideshow />

        <div className="placeholder-hero__overlay">
          <h1 className="placeholder-hero__title">Chad Lewine</h1>
        </div>
      </div>
      <SubscribeSection />
    </>
  );
}

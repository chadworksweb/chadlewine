import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Thinking",
  description: "Applied thinking.",
  robots: { index: false },
};

export default function ThinkingPage() {
  return (
    <article id="page-thinking" className="page-static">
      <h1 className="page-static__title">
        Hire Chad to Think for You
      </h1>

      <div className="reading-column" style={{ maxWidth: "100%", padding: 0 }}>
        <p>
          The Observations are the proof. If you&apos;ve read them and you see
          what they see — connections no one else is drawing, patterns hiding in
          plain sight — then you already know what this is.
        </p>

        <h2>One Service</h2>
        <p>
          Thinking. Applied to your problem, your industry, your blind spot.
          Not consulting. Not advising. Not coaching. Thinking — the thing
          that produced the Observations, pointed at whatever you bring.
        </p>

        <h2>How It Works</h2>
        <p>
          It starts with a conversation. No pitch deck. No intake form. No
          scope document. You talk, I listen, and if there&apos;s something
          there — you&apos;ll know, and I&apos;ll know.
        </p>
        <p>
          No revision cycles. No retainers. No deliverables unless the
          thinking produces one. The thinking is the product.
        </p>

        <div
          id="voice-machine-placeholder"
          className="glass-panel"
          style={{
            padding: "var(--space-xl)",
            marginTop: "var(--space-2xl)",
            textAlign: "center",
          }}
        >
          <p className="voice-machine__status">
            Voice Machine coming soon.
          </p>
          <a href="mailto:chad@chadlewine.com" className="voice-machine__cta">
            chad@chadlewine.com
          </a>
        </div>
      </div>
    </article>
  );
}

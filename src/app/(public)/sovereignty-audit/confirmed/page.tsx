import type { Metadata } from "next";
import {
  AUDIT_CALLOUT_MINUTES,
  AUDIT_HOLD_MINUTES,
  AUDIT_MAX_MINUTES,
} from "@/lib/audit-rate";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Session held",
  robots: { index: false, follow: false },
};

function GlyphTitle({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <div className="si-banner-bar">
      <div className="glyph-title-bar glyph-title-bar--top">
        <span className="glyph-title-bar__label" aria-hidden="true">&#9617;&#9618;&#9619;&#9608;</span>
        <h2 className="glyph-title-bar__heading" id={id}>{children}</h2>
        <span className="glyph-title-bar__label" aria-hidden="true">&#9608;&#9619;&#9618;&#9617;</span>
      </div>
    </div>
  );
}

/** Post-hold. The calendar lives behind this page and nowhere else: the spot is
   not schedulable until the hold clears. */
export default function SovereigntyAuditConfirmedPage() {
  const [firstCall, secondCall] = AUDIT_CALLOUT_MINUTES;

  return (
    <div id="page-sovereignty-audit" className="page-songwriting page-sovereignty-audit">
      <section className="si-hero" aria-label="Session held">
        <div className="si-hero__inner">
          <h1 className="si-hero__eyebrow">The Sovereignty Audit</h1>
          <h2 className="si-hero__headline">Your session is held</h2>
          <div className="si-hero__sub">
            <p>
              Pick your time below. A receipt is on its way to your inbox.
            </p>
          </div>
        </div>
      </section>

      <section id="before" className="si-door si-door--lead" aria-labelledby="sa-before-heading">
        <GlyphTitle id="sa-before-heading">Before we talk</GlyphTitle>

        <div className="si-prose">
          <p style={{ fontSize: "1.3em" }}>
            You have {AUDIT_HOLD_MINUTES} minutes paid for. Past that, the clock runs at the rate you
            agreed to, and it stops when you say stop. {AUDIT_MAX_MINUTES} minutes is the ceiling.
          </p>
          <p>
            You are tracking your own time. There is nothing counting down in front of you, and that
            is deliberate: a timer on screen is a timer you perform for. I will say something at the{" "}
            {firstCall} minute mark and again at {secondCall}, and past that it is yours to watch.
          </p>
          <p>
            When we finish, the balance settles against the card you just used. Within 24 hours your
            blueprint lands in your inbox: the raw session notes, your linguistic leak analysis, and
            your exit parameters.
          </p>
          <p>
            <strong>Come ready to look directly at what you have been avoiding.</strong>
          </p>
        </div>
      </section>

      <section id="schedule" className="si-door si-door--rc" aria-labelledby="sa-schedule-heading">
        <GlyphTitle id="sa-schedule-heading">Pick your time</GlyphTitle>
        {/* TODO: scheduling widget. Not picked yet -- Calendly / TidyCal /
           custom is open decision 3 in the build plan. The gate is what
           matters and it already works: this page is only reachable after the
           hold clears. */}
        <div className="si-prose">
          <p>
            Scheduling is being wired up. Reply to your receipt email with a couple of times that
            work and Chad will lock one in.
          </p>
        </div>
      </section>
    </div>
  );
}

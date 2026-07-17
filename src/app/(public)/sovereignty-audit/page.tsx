import type { Metadata } from "next";
import Link from "next/link";
import { mergeMetadata } from "@/lib/page-meta";
import { AuditHoldForm } from "@/components/AuditHoldForm";
import { AUDIT_EXIT_LINE, auditAgreementTerms } from "@/lib/audit-agreement";
import {
  AUDIT_LAUNCH_ACTIVE,
  AUDIT_MAX_MINUTES,
  auditTotalCents,
  formatAuditCents,
} from "@/lib/audit-rate";

export const dynamic = "force-static";

const DESCRIPTION =
  "One on one with Chad Lewine. Relentless metaphysical inquiry, billed by the minute at $5.25. Ten minutes up front holds the spot, and it ends when you say it ends.";

const DEFAULT_METADATA: Metadata = {
  title: "The Sovereignty Audit",
  description: DESCRIPTION,
  alternates: { canonical: "https://chadlewine.com/sovereignty-audit" },
  openGraph: {
    title: "The Sovereignty Audit - Chad Lewine",
    description: DESCRIPTION,
    url: "https://chadlewine.com/sovereignty-audit",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/sovereignty-audit", DEFAULT_METADATA);
}

const SUPER_INDIVIDUAL_URL = "/super-individual";

// Stepped light-to-dark block glyph. Lifted from the Super Individual Night
// acts -- four IDENTICAL full-block chars (U+2588) so every block shares one
// font + baseline; the gradient is opacity, not shade characters.
function ActGlyph() {
  return (
    <span className="bk-act__glyph" aria-hidden="true">
      <span style={{ opacity: 0.22 }}>&#9608;</span>
      <span style={{ opacity: 0.45 }}>&#9608;</span>
      <span style={{ opacity: 0.7 }}>&#9608;</span>
      <span>&#9608;</span>
    </span>
  );
}

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

/** Rate rows. Computed from audit-rate.ts, never typed in, so the page cannot
   drift from what actually gets charged. */
const RATE_ROWS: { label: string; minutes: number }[] = [
  { label: "10 minutes (the hold)", minutes: 10 },
  { label: "30 minutes", minutes: 30 },
  { label: "60 minutes", minutes: 60 },
  { label: `${AUDIT_MAX_MINUTES} minutes (the ceiling)`, minutes: AUDIT_MAX_MINUTES },
];

export default function SovereigntyAuditPage() {
  const launch = AUDIT_LAUNCH_ACTIVE;
  const terms = auditAgreementTerms(launch);

  return (
    <div id="page-sovereignty-audit" className="page-songwriting page-sovereignty-audit">
      {/* ============================================================
          HERO -- the reframe, in one move. Chad's thesis line does the
          whole job: what it is by saying what it is not.
          ============================================================ */}
      <section className="si-hero" aria-label="The Sovereignty Audit">
        <div className="si-hero__inner">
          <h1 className="si-hero__eyebrow">One on one with Chad Lewine</h1>
          <h2 className="si-hero__headline">The Sovereignty Audit</h2>
          <div className="si-hero__sub">
            <p>
              <strong>
                It&rsquo;s not therapy, and it&rsquo;s not coaching. It&rsquo;s the hard conversation
                you need to have with yourself, facilitated through me.
              </strong>{" "}
              Relentless metaphysical inquiry, for as long as you want it and not a
              minute longer. You decide when it ends.
            </p>
          </div>
        </div>
      </section>

      {/* ============================================================
          THE ACTS -- the shape of the session at a glance. These are the
          four movements from the session design, with the clock times
          deliberately stripped: the session no longer has a fixed length,
          so they are movements, not slots.
          ============================================================ */}
      <section className="si-section bk-program" aria-label="The session in five movements">
        <ol className="bk-acts bk-acts--5up">
          <li className="bk-act">
            <ActGlyph />
            <span className="bk-act__kind">The mirage</span>
            <h3 className="bk-act__title">Piercing the Mirage</h3>
            <p className="bk-act__desc">
              We take away the reasonable story you arrived with. The polished, well-rehearsed
              explanation for why you are stuck goes first.
            </p>
          </li>
          <li className="bk-act">
            <ActGlyph />
            <span className="bk-act__kind">The core move</span>
            <h3 className="bk-act__title">The Untangle</h3>
            <p className="bk-act__desc">
              The reliable provider, the successful professional, the compliant partner, the good
              child. In your head that pile is &ldquo;me.&rdquo; It is not. We pull it apart and find
              out which one is actually you.
            </p>
          </li>
          <li className="bk-act">
            <ActGlyph />
            <span className="bk-act__kind">The click</span>
            <h3 className="bk-act__title">The Click</h3>
            <p className="bk-act__desc">
              The moment you see how the pieces fit and say the sentence yourself. I
              don&rsquo;t manufacture it and I don&rsquo;t hand it to you. I write it down word for
              word.
            </p>
          </li>
          <li className="bk-act">
            <ActGlyph />
            <span className="bk-act__kind">The extraction</span>
            <h3 className="bk-act__title">Naming the Extraction</h3>
            <p className="bk-act__desc">
              The invisible made visible: who is taking your energy, how, and through which agreement
              you never consciously signed.
            </p>
          </li>
          <li className="bk-act">
            <ActGlyph />
            <span className="bk-act__kind">The reclamation</span>
            <h3 className="bk-act__title">Reclaiming the Energy</h3>
            <p className="bk-act__desc">
              A direct, tactical exit framework. Not a mindset. The specific moves available to you
              right now to pull your lifeforce back out of the machine.
            </p>
          </li>
        </ol>
        <div className="bk-cta">
          <a href="#book" className="bk-cta__btn">
            Book a session
          </a>
        </div>
      </section>

      {/* ============================================================
          THE ONE RULE -- the Socratic frame. This is the method, and it
          is the trust argument: a person TOLD their blind spot argues
          with it; a person who arrives at it themselves cannot.
          ============================================================ */}
      <section id="rule" className="si-section" aria-labelledby="sa-rule-heading">
        <GlyphTitle id="sa-rule-heading">The one rule</GlyphTitle>

        <div className="si-prose">
          <p className="sa-rule__line">I help you discover. I don&rsquo;t dictate.</p>
          <p>
            The audit is Socratic, and not as a flourish. It is the actual mechanic. Anything I hand
            you, you can hand back to me. Anything you reach yourself, you have to live with. So I
            don&rsquo;t give you my conclusion about your life. I ask until you reach your own, and
            then I hold you to it.
          </p>
          <p>
            That is what the relentlessness is for. I will not let a rehearsed answer stand, I will
            not fill the silence for you, and I will not upgrade your words into mine. You will not
            leave with my read on you. You will leave with yours, written down in your own language,
            which is the only version your conditioning cannot talk you out of later.
          </p>
        </div>
      </section>

      {/* ============================================================
          WHAT IT IS -- let them picture the hour. Checklist + art, the
          si-door--lead treatment.
          ============================================================ */}
      <section id="what" className="si-door si-door--lead" aria-labelledby="sa-what-heading">
        <GlyphTitle id="sa-what-heading">What is a Sovereignty Audit?</GlyphTitle>

        <div className="si-prose">
          <p style={{ fontSize: "1.3em", marginBottom: 0 }}>
            Modern life is a sophisticated extraction machine. It hands you roles from birth, the
            reliable provider, the successful professional, the compliant partner, and quietly drains
            your individual lifeforce while you perform them. Most people feel that as a heavy,
            invisible stuckness, and mistake it for a strategy problem.
          </p>
        </div>

        <div className="bk-what__row">
          <div className="bk-what__half">
            <ul className="bk-checklist">
              <li>
                <strong>An existential sounding board, not a clinician.</strong> No diagnosis, no
                treatment plan, no generic lifestyle checklist.
              </li>
              <li>
                <strong>Every word held accountable in the moment.</strong> I track the pronouns, the
                inflections, and the rehearsed lines, and I ask about them until you hear it
                yourself.
              </li>
              <li>
                <strong>No ego placation.</strong> If the answer lands on you being the one at fault,
                I will not steer you around it. You will get there, and I will not pretend you
                didn&rsquo;t.
              </li>
              <li>
                <strong>For people who already did the baseline work.</strong> Therapy done, bleeding
                stopped, still frozen in front of the thing you actually want.
              </li>
            </ul>
          </div>
          <div className="bk-what__art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/urgent-arbiter.webp"
              alt="Urgent Arbiter -- digital art by Chad Lewine"
              width={1920}
              height={980}
            />
          </div>
        </div>

        <div
          className="si-prose"
          style={{ marginTop: "var(--space-xl)", marginBottom: "var(--space-xl)" }}
        >
          <p>
            You do not pay me for a state license, a corporate resume, or a weekend certificate. You
            pay me for the raw clarity that strips the programming away so you can take your power
            back. For context, a <Link href={SUPER_INDIVIDUAL_URL}>Super Individual</Link> is a
            sovereign human being who has reclaimed their power from the extractive institutions of
            modernity and operates outside of them. This is the hour where we find out what is still
            holding you inside them.
          </p>
        </div>

        <div className="si-door__footer si-door__footer--center">
          <a href="#rate" className="explore-songs__cta">See what it costs &rarr;</a>
        </div>
      </section>

      {/* ============================================================
          WHO IT IS FOR -- the three silos, as their own act row.
          ============================================================ */}
      <section id="who" className="si-section" aria-labelledby="sa-who-heading">
        <GlyphTitle id="sa-who-heading">The types of people that I work with</GlyphTitle>

        <ol className="bk-acts">
          <li className="bk-act">
            <ActGlyph />
            <span className="bk-act__kind">Silo one</span>
            <h3 className="bk-act__title">The Sovereign Shift</h3>
            <p className="bk-act__desc">
              You cleared the past and built the outward success, and now you are suffocating under
              the ceiling of standard linear society. Everyone around you calls your real goals
              impossible, and you need a perspective that does not live in the realistic.
            </p>
          </li>
          <li className="bk-act">
            <ActGlyph />
            <span className="bk-act__kind">Silo two</span>
            <h3 className="bk-act__title">The Core Cleanse</h3>
            <p className="bk-act__desc">
              You walked away from the machine, the trap, or the person, but you still run every
              choice through their ghost filter. Someone is gaslighting you or draining you, and
              there is not one person in your circle you can say it to.
            </p>
          </li>
          <li className="bk-act">
            <ActGlyph />
            <span className="bk-act__kind">Silo three</span>
            <h3 className="bk-act__title">Radical Alignment</h3>
            <p className="bk-act__desc">
              Same bottleneck, same loop, and you are exhausted by your own pattern. You want someone
              who will speak the deadpan reality and hold you accountable without calling you crazy.
            </p>
          </li>
        </ol>
      </section>

      {/* ============================================================
          WHY IT EXISTS -- the credentials, as the honest version. Callout
          + portrait, the bk-why treatment.
          ============================================================ */}
      <section id="why" className="si-section" aria-labelledby="sa-why-heading">
        <GlyphTitle id="sa-why-heading">Why you would let me do this</GlyphTitle>

        <div className="bk-why__row">
          <div className="bk-why__body">
            <div className="bk-callout">
              <p>
                My credentials are not typical. I don&rsquo;t have a degree or a certification. My
                credentials are a living archive of self-determination: my art, my written catalog,
                and the philosophy I used to dismantle my own programming.
              </p>
              <p>
                I have faced the same invisible matrices currently locking you in place, from
                systemic family conditioning to the extractive digital traps. I did the structural
                work on myself first. <strong>That is my qualification.</strong>
              </p>
              <p>
                If you want to understand the exact lens we will use on your reality, read the{" "}
                <Link href={SUPER_INDIVIDUAL_URL}>Super Individual</Link> series, look through the{" "}
                <Link href="/observations">Observations</Link> where I take the cultural traps apart
                in public, read the <Link href="/journal">Journal</Link> for the work as it actually
                happens, or listen to <Link href="/music/songs">the catalog</Link>. The songs are the
                raw material this work runs on.
              </p>
              <p>
                When you have a session with me, you are putting yourself under an uncompromised,
                battle-tested lens, pointed straight at what you have been avoiding.
              </p>
            </div>
            <div className="si-door__footer">
              <Link href="/chad-lewine" className="explore-songs__cta">
                Learn more about me &rarr;
              </Link>
            </div>
          </div>
          <aside className="bk-why__portrait">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/super-individual/chad-lewine_the-deprogrammer_blue-glow.webp"
              alt="Chad Lewine -- portrait"
              width={806}
              height={1865}
            />
          </aside>
        </div>
      </section>

      {/* ============================================================
          WHAT YOU LEAVE WITH -- the blueprint. Art on the left, checklist
          on the right (the alternating bk-what row).
          ============================================================ */}
      <section id="blueprint" className="si-door" aria-labelledby="sa-blueprint-heading">
        <GlyphTitle id="sa-blueprint-heading">What you leave with</GlyphTitle>

        <div className="bk-what__row">
          <div className="bk-what__art bk-what__art--natural">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/clarity-modified.webp"
              alt="Clarity -- digital art by Chad Lewine"
              width={1649}
              height={813}
            />
          </div>
          <div className="bk-what__half">
            <ul className="bk-checklist bk-checklist--alt">
              <li>
                <strong>Your Sovereignty Blueprint, within 24 hours.</strong> Emailed straight to
                you, built around the sentence you said at the click, word for word.
              </li>
              <li>
                <strong>Your untangled role map.</strong> The pieces that felt like one thing, pulled
                apart and named, with the one that is actually you marked.
              </li>
              <li>
                <strong>The linguistic leak analysis.</strong> The exact words, pronouns, and
                inflections that exposed the conditioning while you were talking.
              </li>
              <li>
                <strong>Your exit parameters.</strong> The practical, unconventional choices actually
                available to you right now, including the ones you were trained to ignore.
              </li>
              <li>
                <strong>A &ldquo;sonic prescription.&rdquo;</strong> The tracks assigned to your
                specific reading, and why those ones. The quotation marks are load-bearing. It is
                music.
              </li>
            </ul>
          </div>
        </div>

        <div className="si-prose" style={{ marginTop: "var(--space-xl)" }}>
          <p>
            The blueprint exists because an intense conversation fades. When your old conditioning
            starts dragging you back, you need the deadpan reality written down in black and white,
            in your own words, from the hour you were most awake. <strong>Your words are the whole
            point.</strong> A reading I hand you is one you can argue with later. A sentence you said
            yourself is not.
          </p>
        </div>
      </section>

      {/* ============================================================
          THE RATE -- real numbers on the table before the decision, with
          the math showing. Same posture as the chadworks rates page.
          ============================================================ */}
      <section id="rate" className="si-door si-door--rc" aria-labelledby="sa-rate-heading">
        <GlyphTitle id="sa-rate-heading">The rate</GlyphTitle>

        {/* Prose left, the math right. Reuses bk-what__row so it sits in
           the same rhythm as the other two-column rows on the page. */}
        <div className="bk-what__row">
          <div className="bk-what__half">
            <div className="si-prose">
              <p style={{ fontSize: "1.3em" }}>
                $5.25 a minute, the same rate my development work bills at. You pay for 10 minutes
                up front to hold the spot, and that 10 minutes counts toward your total. From there
                the clock runs on what we actually use. Two hours is the hard ceiling.
              </p>
            </div>
          </div>

          <div className="bk-what__half">
            <div className="sa-rate__table-wrap">
              <table className="sa-rate__table">
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Full rate</th>
                    {launch && (
                      <th scope="col" className="sa-rate__launch-col">
                        Launch
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {RATE_ROWS.map((row) => (
                    <tr key={row.minutes}>
                      <th scope="row">{row.label}</th>
                      <td className={launch ? "sa-rate__was" : undefined}>
                        {formatAuditCents(auditTotalCents(row.minutes, false))}
                      </td>
                      {launch && (
                        <td className="sa-rate__launch-col sa-rate__launch-cell">
                          {formatAuditCents(auditTotalCents(row.minutes, true))}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* The offer, sold. Full-width row of its own, immediately before the
           button. Every figure computed from audit-rate.ts so the pitch cannot
           drift from what actually gets charged. */}
        {launch && (
          <div className="sa-launch">
            <div className="sa-launch__head">
              <span className="sa-launch__badge">Launch offer</span>
              <p className="sa-launch__pitch">
                <span className="sa-launch__pct">50%</span> off
              </p>
            </div>
            <ul className="sa-launch__lines">
              {[
                { label: "The 10-minute hold", minutes: 10 },
                { label: "A full hour", minutes: 60 },
              ].map((row) => (
                <li key={row.minutes} className="sa-launch__line">
                  <span className="sa-launch__label">{row.label}</span>
                  <s className="sa-launch__was">
                    {formatAuditCents(auditTotalCents(row.minutes, false))}
                  </s>
                  <span className="sa-launch__now">
                    {formatAuditCents(auditTotalCents(row.minutes, true))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="bk-cta">
          <a href="#book" className="bk-cta__btn">
            Book a session
          </a>
        </div>
      </section>

      {/* ============================================================
          THE TERMS -- its own section, above the booking. This is the
          only place the client is told the clock is theirs to watch, so
          it does not get buried beside a form.
          ============================================================ */}
      <section id="terms" className="si-section" aria-labelledby="sa-terms-heading">
        <GlyphTitle id="sa-terms-heading">What you are agreeing to</GlyphTitle>

        <ul className="sa-agreement__list">
          {terms.map((term, i) => (
            <li key={i}>{term}</li>
          ))}
        </ul>

        <p className="sa-agreement__exit">{AUDIT_EXIT_LINE}</p>
      </section>

      {/* ============================================================
          THE BOOKING -- the close. The checkbox is a hard gate: the hold
          route rejects any submit without it.
          ============================================================ */}
      <section id="book" className="si-door si-door--lead bk-start--cover" aria-labelledby="sa-book-heading">
        <GlyphTitle id="sa-book-heading">Book your session</GlyphTitle>
        <AuditHoldForm />
      </section>

      {/* ============================================================
          FINE PRINT + CRISIS. The legal block is subordinate on purpose,
          but the crisis paragraph is NOT: someone reading it may be
          having the worst day of their life, and they should not have to
          squint at a phone number. Hence sa-disclaimer__crisis.
          ============================================================ */}
      <section className="si-section" aria-label="Disclaimer and safety information">
        <div className="sa-disclaimer">
          <p>
            <strong>Disclaimer:</strong> A Sovereignty Audit is a philosophical, existential, and
            personal inquiry dialogue. Chad Lewine is an independent advisor and artist, not a
            licensed mental health counselor, clinical psychologist, psychiatrist, physician, or
            medical therapist. He holds no clinical license and provides no clinical service.
          </p>
          <p>
            This session does not diagnose, treat, prevent, or cure any mental health illness,
            clinical condition, or psychological disorder, including depression, anxiety disorders,
            bipolar disorder, PTSD, psychosis, personality disorders, eating disorders, or substance
            use disorders. Nothing said during a session is medical, psychological, psychiatric,
            legal, or financial advice, and nothing said during a session is a reason to start,
            stop, or change any treatment or medication you are receiving. If you are under the care
            of a licensed professional, keep it. This is not a replacement for that care, a second
            opinion on it, or a crisis service.
          </p>
          <p>
            A Sovereignty Audit is strictly intended for functional individuals seeking deep
            personal perspective, self-awareness, and personal energy optimization. It is
            deliberately confrontational by design. Chad may end a session at any point and refer
            you to a licensed professional if the conversation moves into territory that calls for
            clinical care, and that decision is a judgment call rather than a diagnosis. You take
            part voluntarily and remain responsible for your own choices, actions, and wellbeing
            during and after the session.
          </p>
          <p>
            <strong>The &ldquo;sonic prescription&rdquo; in your blueprint is music.</strong> The
            quotation marks are there because the word is a joke at the expense of an industry that
            has a pill for every human problem. It is a list of songs and the reasons they are on
            it. It is not a medical prescription, it prescribes nothing, it treats nothing, it cures
            nothing, and it is not a substitute for care from somebody licensed to give it.
          </p>

          <p className="sa-disclaimer__crisis">
            <strong>If you are in crisis, this is not the place.</strong> If you are thinking about
            suicide or self-harm, or you are worried about your own safety or someone else&rsquo;s,
            please stop and reach someone who can actually help right now. In the US, call or text{" "}
            <a href="tel:988">988</a> to reach the Suicide &amp; Crisis Lifeline, free and staffed 24
            hours a day. If anyone is in immediate danger, call <a href="tel:911">911</a> or go to
            your nearest emergency room. Please do not wait for a session, and please do not use one
            instead.
          </p>
        </div>
      </section>
    </div>
  );
}

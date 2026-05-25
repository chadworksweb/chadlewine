"use client";

import Link from "next/link";
import posthog from "posthog-js";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExploreGrid, type ExploreGridItem } from "@/components/ExploreGrid";
import { PostPurchaseCrossSell } from "@/components/PostPurchaseCrossSell";

type EligibilityState =
  | { status: "loading" }
  | { status: "claimable"; expires_in_days: number }
  | { status: "guest" }
  | { status: "must_sign_in" }
  | { status: "already_claimed"; coupon: { code: string; percent_off: number; granted_at: string; expires_at: string; redeemed_at: string | null } }
  | { status: "not_eligible" };

type ClaimState =
  | { kind: "idle" }
  | { kind: "claiming" }
  | { kind: "claimed"; code: string; expires_at: string; percent_off: number }
  | { kind: "error"; message: string };

/* Chad-Lewine-styled celebration burst. Pops from the center of the coupon
   card when claim resolves: a shockwave ring + ~24 glowing dots radiating
   outward + a layer of faster sparks. Palette stays in the chadlewine
   hyperlink-blue spectrum. CSS does all the motion; we just stamp the
   particles with per-element angle/distance/delay/hue inline. */
function FireworksBurst() {
  // Stamp particles once on mount. Math.random() during render is impure and
  // would re-generate positions on every re-render, restarting the CSS
  // animations. useState's lazy initializer runs only on first render.
  const [{ dots, sparks }] = useState(() => ({
    dots: Array.from({ length: 24 }, (_, i) => {
      const angle = (360 / 24) * i + (Math.random() * 6 - 3);
      const dist = 110 + Math.random() * 70;
      const delay = Math.random() * 120;
      const hueKey = i % 3;
      const hue = hueKey === 0 ? "139, 156, 247" : hueKey === 1 ? "168, 182, 255" : "64, 96, 255";
      return { angle, dist, delay, hue, key: `d${i}` };
    }),
    sparks: Array.from({ length: 14 }, (_, i) => {
      const angle = Math.random() * 360;
      const dist = 60 + Math.random() * 50;
      const delay = 40 + Math.random() * 220;
      return { angle, dist, delay, key: `s${i}` };
    }),
  }));
  return (
    <div className="coupon-offer__fireworks" aria-hidden="true">
      <span className="coupon-offer__shockwave" />
      <span className="coupon-offer__flash" />
      {dots.map((d) => (
        <span
          key={d.key}
          className="coupon-offer__firework"
          style={
            {
              "--angle": `${d.angle}deg`,
              "--dist": `${d.dist}px`,
              "--delay": `${d.delay}ms`,
              "--hue": d.hue,
            } as React.CSSProperties
          }
        />
      ))}
      {sparks.map((s) => (
        <span
          key={s.key}
          className="coupon-offer__spark"
          style={
            {
              "--angle": `${s.angle}deg`,
              "--dist": `${s.dist}px`,
              "--delay": `${s.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

function formatExpiresShort(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

function MemberCouponOffer({
  sessionId,
  onResolved,
}: {
  sessionId: string;
  onResolved?: () => void;
}) {
  const [eligibility, setEligibility] = useState<EligibilityState>({ status: "loading" });
  const [claim, setClaim] = useState<ClaimState>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/member-coupons/eligibility?session_id=${encodeURIComponent(sessionId)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (!cancelled) {
          setEligibility(data);
          onResolved?.();
        }
      } catch {
        if (!cancelled) {
          setEligibility({ status: "not_eligible" });
          onResolved?.();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, onResolved]);

  const onClaim = useCallback(async () => {
    if (claim.kind === "claiming" || claim.kind === "claimed") return;
    setClaim({ kind: "claiming" });
    try {
      const res = await fetch("/api/member-coupons/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = await res.json();
      if (!res.ok || !data?.coupon) {
        setClaim({ kind: "error", message: data?.error || "Could not claim. Try again." });
        return;
      }
      setClaim({
        kind: "claimed",
        code: data.coupon.code,
        expires_at: data.coupon.expires_at,
        percent_off: data.coupon.percent_off,
      });
    } catch {
      setClaim({ kind: "error", message: "Network error. Try again." });
    }
  }, [claim.kind, sessionId]);

  if (eligibility.status === "loading") {
    return <section className="coupon-offer coupon-offer--placeholder" aria-busy="true" />;
  }
  if (eligibility.status === "not_eligible") {
    return null;
  }

  const returnUrl =
    typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : `/thank-you?session_id=${sessionId}`;

  if (eligibility.status === "guest") {
    return (
      <section className="coupon-offer">
        <p className="coupon-offer__kicker">Member reward</p>
        <h2 className="coupon-offer__title">20% off your next order</h2>
        <p className="coupon-offer__body">
          Members get a one-time 20% off coupon. Create an account in 30 seconds and claim yours.
        </p>
        <Link
          href={`/account/register?next=${encodeURIComponent(returnUrl)}`}
          className="coupon-offer__cta coupon-offer__cta--secondary"
        >
          Create an account to claim
        </Link>
        <p className="coupon-offer__fine">Expires 7 days after claim. One coupon per member.</p>
      </section>
    );
  }

  if (eligibility.status === "must_sign_in") {
    return (
      <section className="coupon-offer">
        <p className="coupon-offer__kicker">Member reward</p>
        <h2 className="coupon-offer__title">20% off your next order</h2>
        <p className="coupon-offer__body">
          Sign in to the account that placed this order to claim your one-time 20% off coupon.
        </p>
        <Link
          href={`/account/login?next=${encodeURIComponent(returnUrl)}`}
          className="coupon-offer__cta coupon-offer__cta--secondary"
        >
          Sign in to claim
        </Link>
        <p className="coupon-offer__fine">Expires 7 days after claim. One coupon per member.</p>
      </section>
    );
  }

  if (eligibility.status === "already_claimed") {
    const c = eligibility.coupon;
    return (
      <section className="coupon-offer coupon-offer--claimed">
        <p className="coupon-offer__kicker">Coupon on your account</p>
        <h2 className="coupon-offer__title">
          {c.percent_off}% off {c.redeemed_at ? "(used)" : "ready to use"}
        </h2>
        <p className="coupon-offer__code">{c.code}</p>
        {!c.redeemed_at && (
          <p className="coupon-offer__body">
            Expires {formatExpiresShort(c.expires_at)}. Paste at checkout.
          </p>
        )}
        <Link href="/account" className="coupon-offer__cta coupon-offer__cta--secondary">
          View on your account
        </Link>
      </section>
    );
  }

  // status === "claimable"
  if (claim.kind === "claimed") {
    return (
      <section className="coupon-offer coupon-offer--claimed">
        <FireworksBurst />
        <p className="coupon-offer__kicker">Claimed</p>
        <h2 className="coupon-offer__title">{claim.percent_off}% off is yours</h2>
        <p className="coupon-offer__code coupon-offer__code--pop">{claim.code}</p>
        <p className="coupon-offer__body">
          Saved to your account and emailed. Expires {formatExpiresShort(claim.expires_at)}.
        </p>
        <a href="#explore" className="coupon-offer__cta coupon-offer__cta--secondary">
          Explore more below
        </a>
      </section>
    );
  }

  return (
    <section className="coupon-offer">
      <p className="coupon-offer__kicker">Member reward</p>
      <h2 className="coupon-offer__title">20% off your next order</h2>
      <p className="coupon-offer__body">
        Use on all music in your cart, or one merch item &mdash; whichever
        saves more. Expires in 7 days.
      </p>
      <button
        type="button"
        className={`coupon-offer__cta${claim.kind === "claiming" ? " is-claiming" : ""}`}
        onClick={onClaim}
        disabled={claim.kind === "claiming"}
      >
        <span className="coupon-offer__cta-label">
          {claim.kind === "claiming" ? "Claiming..." : "CLAIM COUPON"}
        </span>
      </button>
      {claim.kind === "error" && (
        <p className="coupon-offer__error" role="alert">
          {claim.message}
        </p>
      )}
      <p className="coupon-offer__fine">Expires 7 days after claim. One coupon per member.</p>
    </section>
  );
}

// 3-across grid on the thank-you page: paint 2 rows (6), Load more
// adds 1 row (3) at a time, cap at 5 rows total (15). After the cap,
// hide the Load more button and let the page just keep scrolling.
const FIRST_PAGE = 6;
const PAGE_INCREMENT = 3;
const MAX_ITEMS = 15;

function ThankYouExplore() {
  const [items, setItems] = useState<ExploreGridItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const seenKeys = useRef<Set<string>>(new Set());

  const fetchPage = useCallback(
    async (size: number) => {
      if (loading || !hasMore) return;
      setLoading(true);
      try {
        const url = new URL("/api/explore/products", window.location.origin);
        const exclude = Array.from(seenKeys.current).join(",");
        if (exclude) url.searchParams.set("exclude", exclude);
        url.searchParams.set("limit", String(size));
        const res = await fetch(url.toString(), { cache: "no-store" });
        const data = (await res.json()) as {
          items: (ExploreGridItem & { sort_at: string })[];
          next_cursor: string | null;
          has_more: boolean;
        };
        const fresh = (data.items || []).filter((i) => {
          if (seenKeys.current.has(i.key)) return false;
          seenKeys.current.add(i.key);
          return true;
        });
        setItems((prev) => [...prev, ...fresh]);
        setHasMore(!!data.has_more);
      } catch {
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [hasMore, loading],
  );

  useEffect(() => {
    void fetchPage(FIRST_PAGE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (items.length === 0 && !loading) return null;

  const atCap = items.length >= MAX_ITEMS;
  const showLoadMore = !atCap && hasMore;

  return (
    <section className="explore-strip" id="explore">
      <div className="explore-strip__frame">
        <span className="explore-strip__frame-label" aria-hidden="true">░▒▓█</span>
        <h2 className="explore-strip__heading">Explore</h2>
        <span className="explore-strip__frame-label" aria-hidden="true">█▓▒░</span>
      </div>
      <ExploreGrid items={items} />
      <div className="explore-grid__more">
        {showLoadMore && (
          <button
            type="button"
            className="explore-grid__more-btn"
            onClick={() => void fetchPage(PAGE_INCREMENT)}
            disabled={loading}
          >
            {loading ? "Loading..." : "Load more"}
          </button>
        )}
      </div>
    </section>
  );
}

function CartThankYouContent() {
  const params = useSearchParams();
  const sessionId = params.get("session_id") || "";
  const [couponResolved, setCouponResolved] = useState(!sessionId);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("chadlewine_cart");
      if (raw) {
        try {
          const items = JSON.parse(raw);
          if (Array.isArray(items) && items.length > 0) {
            const subtotal = items.reduce(
              (s: number, it: { price?: number }) => s + (Number(it.price) || 0),
              0,
            );
            posthog.capture("purchase_complete", {
              channel: "music",
              item_count: items.length,
              subtotal,
              song_ids: items.filter((it: { type?: string }) => it.type === "song").map((it: { id: string }) => it.id),
              release_ids: items.filter((it: { type?: string }) => it.type === "release").map((it: { id: string }) => it.id),
              ringtone_ids: items.filter((it: { type?: string }) => it.type === "ringtone").map((it: { id: string }) => it.id),
              items: items.map((it: { type?: string; id?: string; slug?: string; title?: string; price?: number; format?: string | null }) => ({
                type: it.type,
                id: it.id,
                slug: it.slug,
                title: it.title,
                price: it.price,
                format: it.format ?? null,
              })),
            });
          }
        } catch {}
      }
      localStorage.removeItem("chadlewine_cart");
      window.dispatchEvent(new StorageEvent("storage", { key: "chadlewine_cart", newValue: null }));
    } catch {}
  }, []);

  return (
    <div id="page-thank-you" className="page-static cart-thank-you-page">
      <div className="cart-thank-you__layout">
        <div className="cart-thank-you__main">
          <div className="cart-thank-you__top">
            <div className="cart-thank-you__greeting">
              <h1 className="page-static__title">Thank You</h1>
              <p className="cart-thank-you__greeting-line">
                Your order is confirmed. A receipt is on its way to your email
                &mdash; with download links for anything digital, and tracking
                for anything we ship.
              </p>
            </div>
            <div className="cart-thank-you__coupon-col">
              {sessionId && (
                <MemberCouponOffer
                  sessionId={sessionId}
                  onResolved={() => setCouponResolved(true)}
                />
              )}
            </div>
          </div>

          {sessionId && <PostPurchaseCrossSell sessionId={sessionId} />}

          {couponResolved && <ThankYouExplore />}
        </div>

        <aside className="cart-thank-you__rail" aria-hidden="true">
          <div className="cart-thank-you__portrait">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/chad-lewine_thank-you-page-portrait.webp"
              alt=""
              className="cart-thank-you__portrait-img"
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function CartThankYouPage() {
  return (
    <Suspense fallback={<div className="page-static"><p style={{ color: "var(--text-tertiary)" }}>Loading...</p></div>}>
      <CartThankYouContent />
    </Suspense>
  );
}

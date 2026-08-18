"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { CrossSellStrip } from "@/components/CrossSellStrip";

const CART_KEY = "chadlewine_cart";
const AUTO_CLOSE_MS = 5000;

export type CartItem = {
  // "art" = art_skus-backed line (original or limited print, sku_id required).
  // "art_original" is the legacy merch-backed original.
  type: "song" | "release" | "ringtone" | "merch" | "art_original" | "art";
  id: string;
  title: string;
  slug: string;
  price: number;
  // Format applies only to song/album (selected at delivery for albums).
  // Ringtones are their own SKU and always deliver M4R + MP3 — format is null.
  format: "mp3" | "flac" | "wav" | null;
  cover_art_path: string | null;
  // Merch-only fields. variant_label shows under the title in the cart drawer
  // ("Print", etc.). product_config carries the chosen curated variant
  // (size/color) so different variants are distinct cart lines.
  variant_label?: string | null;
  product_config?: Record<string, unknown> | null;
  // SKU layer. sku_id selects a release_skus / song_skus row; sku_variant_id
  // selects a sku_variants child. Both optional during the transition — old
  // cart lines that predate the SKU layer remain valid.
  sku_id?: string | null;
  sku_variant_id?: string | null;
};

function configHash(config: Record<string, unknown> | null | undefined): string {
  if (!config) return "na";
  return JSON.stringify(
    Object.entries(config)
      .filter(([, v]) => v !== undefined && v !== null)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

function lineKey(
  item: Pick<CartItem, "type" | "id" | "format" | "product_config" | "sku_id" | "sku_variant_id">,
): string {
  return `${item.type}:${item.id}:${item.format ?? "na"}:${item.sku_id ?? "na"}:${item.sku_variant_id ?? "na"}:${configHash(item.product_config)}`;
}

type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotal: number;
  hasItem: (
    item: Pick<CartItem, "type" | "id" | "format" | "product_config" | "sku_id" | "sku_variant_id">,
  ) => boolean;
  add: (item: CartItem) => void;
  remove: (key: string) => void;
  clear: () => void;
  isOpen: boolean;
  open: () => void;
  close: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let initial: CartItem[] = [];
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) initial = parsed;
      }
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is an external system; one-shot hydration on mount
    setItems(initial);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch {}
  }, [items, hydrated]);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== CART_KEY) return;
      try {
        const parsed = e.newValue ? JSON.parse(e.newValue) : [];
        setItems(Array.isArray(parsed) ? parsed : []);
      } catch {
        setItems([]);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const clearAutoClose = () => {
    if (autoCloseRef.current) {
      clearTimeout(autoCloseRef.current);
      autoCloseRef.current = null;
    }
  };

  const open = useCallback(() => {
    clearAutoClose();
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    clearAutoClose();
    setIsOpen(false);
  }, []);

  const hasItem = useCallback(
    (
      probe: Pick<
        CartItem,
        "type" | "id" | "format" | "product_config" | "sku_id" | "sku_variant_id"
      >,
    ) => items.some((i) => lineKey(i) === lineKey(probe)),
    [items],
  );

  const add = useCallback((newItem: CartItem) => {
    const key = lineKey(newItem);
    setItems((prev) => {
      // Digital goods — no quantities. If already in cart, no-op (still pop drawer for visibility).
      if (prev.some((i) => lineKey(i) === key)) return prev;
      return [...prev, newItem];
    });
    setIsOpen(true);
    clearAutoClose();
    autoCloseRef.current = setTimeout(() => {
      setIsOpen(false);
      autoCloseRef.current = null;
    }, AUTO_CLOSE_MS);
  }, []);

  const remove = useCallback((key: string) => {
    setItems((prev) => prev.filter((i) => lineKey(i) !== key));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  useEffect(() => {
    if (isOpen) document.body.classList.add("cart-open");
    else document.body.classList.remove("cart-open");
    return () => document.body.classList.remove("cart-open");
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  const count = items.length;
  const subtotal = items.reduce((sum, i) => sum + i.price, 0);

  return (
    <CartContext.Provider
      value={{ items, count, subtotal, hasItem, add, remove, clear, isOpen, open, close }}
    >
      {children}
    </CartContext.Provider>
  );
}

function fmtPrice(dollars: number): string {
  return "$" + dollars.toFixed(2);
}

export function CartUI() {
  const { items, subtotal, count, isOpen, open, close, remove } = useCart();
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Auth-aware checkout: signed-out users see a 3-option gate (sign in /
  // create account / guest) before we redirect to Stripe. Avoids creating
  // duplicate audience rows when the user already has an account.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [showAuthGate, setShowAuthGate] = useState(false);

  // Member coupon detection. If the signed-in buyer has an unredeemed
  // coupon on their account, surface an "Apply 20% off" toggle. The
  // discount itself is computed server-side at cart-checkout.
  const [availableCoupon, setAvailableCoupon] = useState<{
    code: string;
    percent_off: number;
    expires_at: string;
  } | null>(null);
  const [applyCoupon, setApplyCoupon] = useState(false);
  const [couponInfoOpen, setCouponInfoOpen] = useState(false);

  // Terms of purchase live as fine print only. Clicking "terms of purchase"
  // opens an in-drawer slide-over panel with the short disclaimer; no
  // explicit consent gate.
  const [termsOpen, setTermsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setSignedIn(!!d.user);
      })
      .catch(() => {
        if (!cancelled) setSignedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Look up the buyer's eligible coupon whenever the cart opens and they
  // appear to be signed in. Cheap (one row) and uncached so it reflects a
  // claim that just happened in another tab.
  useEffect(() => {
    if (!isOpen || signedIn !== true) return;
    let cancelled = false;
    fetch("/api/member-coupons/available", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setAvailableCoupon(d.coupon || null);
      })
      .catch(() => {
        if (!cancelled) setAvailableCoupon(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, signedIn]);

  function nextParam(): string {
    // After login/register, send them to /checkout — a thin client page that
    // reads the cart and redirects straight to Stripe. Otherwise they'd land
    // on the album page and have to re-open the cart and click again.
    return "/checkout";
  }

  async function handleCheckoutClick() {
    if (items.length === 0 || checkingOut) return;
    if (signedIn === false) {
      setShowAuthGate(true);
      return;
    }
    // signedIn === true OR null (best-effort) → straight to Stripe.
    await handleCheckout();
  }

  async function handleCheckout() {
    if (items.length === 0 || checkingOut) return;
    setCheckingOut(true);
    setError(null);
    try {
      const res = await fetch("/api/cart-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            type: i.type,
            id: i.id,
            format: i.format,
            product_config: i.product_config ?? null,
            // SKU IDs pass through transparently. cart-checkout will start
            // using them in task 5; until then they're ignored server-side.
            sku_id: i.sku_id ?? null,
            sku_variant_id: i.sku_variant_id ?? null,
          })),
          marketing_opt_in: true,
          apply_coupon: applyCoupon && !!availableCoupon,
        }),
      });
      const data = await res.json();
      if (data.url) {
        // Digital-only cart -> hosted Stripe Checkout redirect.
        window.location.href = data.url;
        return;
      }
      if (data.client_secret) {
        // Physical cart -> embedded checkout on /checkout (needs an address
        // for shipping). Hand the secret to that page via sessionStorage.
        try {
          sessionStorage.setItem("cl_checkout_secret", data.client_secret);
        } catch {}
        window.location.href = "/checkout";
        return;
      }
      setError(data.error || "Could not start checkout. Please try again.");
    } catch {
      setError("Could not start checkout. Please try again.");
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <>
      <div
        className={`cl-cart-overlay${isOpen ? " open" : ""}`}
        onClick={close}
        aria-hidden={!isOpen}
      />

      <aside
        className={`cl-cart-drawer${isOpen ? " open" : ""}`}
        aria-label="Shopping cart"
        aria-hidden={!isOpen}
      >
        <div className="cl-cart-drawer__header">
          <h2 className="cl-cart-drawer__title">Your Cart</h2>
          <button
            type="button"
            className="cl-cart-drawer__close"
            aria-label="Close cart"
            onClick={close}
          >
            ×
          </button>
        </div>

        <div className="cl-cart-drawer__body">
          {!isOpen ? null : items.length === 0 ? (
            <div className="cl-cart-empty">
              <p>Your cart is empty.</p>
              <p className="cl-cart-empty__sub">Browse the music catalog to find a track.</p>
              <Link href="/music" className="cl-cart-btn cl-cart-btn--ghost" onClick={close}>
                Browse music
              </Link>
            </div>
          ) : (
            <ul className="cl-cart-items">
              {items.map((item) => {
                const key = lineKey(item);
                return (
                  <li key={key} className="cl-cart-item">
                    {item.cover_art_path && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className="cl-cart-item__thumb"
                        src={item.cover_art_path}
                        alt=""
                        width={50}
                        height={50}
                        loading="lazy"
                      />
                    )}
                    <div className="cl-cart-item__info">
                      <span className="cl-cart-item__name">{item.title}</span>
                      <span className="cl-cart-item__variant">
                        {item.variant_label
                          ? item.variant_label
                          : item.type === "release"
                            ? "Release"
                            : item.type === "ringtone"
                              ? "Ringtone (M4R + MP3)"
                              : item.type === "song"
                                ? "Song"
                                : item.type === "art_original"
                                  ? "Original artwork"
                                  : "Merch"}
                        {item.format ? ` · ${item.format.toUpperCase()}` : ""}
                      </span>
                    </div>
                    <div className="cl-cart-item__controls">
                      <span className="cl-cart-item__total">
                        {fmtPrice(item.price)}
                      </span>
                      <button
                        type="button"
                        className="cl-cart-item__remove"
                        aria-label="Remove item"
                        onClick={() => remove(key)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {items.length > 0 && <CrossSellStrip variant="drawer" />}
        </div>

        {items.length > 0 && (
          <div className="cl-cart-drawer__footer">
            {(() => {
              const musicTotal = items
                .filter((i) => i.type === "song" || i.type === "release" || i.type === "ringtone")
                .reduce((s, i) => s + i.price, 0);
              const merchPrices = items
                .filter((i) => i.type === "merch" || i.type === "art_original")
                .map((i) => i.price);
              const merchMax = merchPrices.length > 0 ? Math.max(...merchPrices) : 0;
              const pct = (availableCoupon?.percent_off || 20) / 100;
              const previewDiscount = applyCoupon
                ? Math.max(musicTotal * pct, merchMax * pct)
                : 0;
              const total = Math.max(subtotal - previewDiscount, 0);
              return (
                <div className="cl-cart-totals-area">
                  {availableCoupon && (
                    <div
                      className={`cl-cart-toast cl-cart-toast--coupon${couponInfoOpen ? " cl-cart-toast--open" : ""}${applyCoupon ? " cl-cart-toast--on" : ""}`}
                    >
                      <button
                        type="button"
                        className="cl-cart-toast__expand"
                        onClick={() => setCouponInfoOpen((v) => !v)}
                        aria-expanded={couponInfoOpen}
                      >
                        <span className="cl-cart-toast__label">
                          Apply your <strong>{availableCoupon.percent_off}% member coupon</strong>
                        </span>
                        <span className="cl-cart-toast__caret" aria-hidden="true">{couponInfoOpen ? "−" : "+"}</span>
                      </button>
                      <label className="cl-cart-toast__toggle" aria-label="Toggle member coupon">
                        <input
                          type="checkbox"
                          checked={applyCoupon}
                          onChange={(e) => setApplyCoupon(e.target.checked)}
                        />
                        <span className="cl-cart-coupon-toggle__switch" aria-hidden="true" />
                      </label>
                      {couponInfoOpen && (
                        <div className="cl-cart-toast__info">
                          Discounts all music in your cart, or your most expensive merch item &mdash; whichever saves more.
                        </div>
                      )}
                    </div>
                  )}
                  <div className="cl-cart-totals">
                    <div className="cl-cart-subtotal">
                      <span className="cl-cart-subtotal__label">Subtotal</span>
                      <span className="cl-cart-subtotal__amount">{fmtPrice(subtotal)}</span>
                    </div>
                    {previewDiscount > 0 && (
                      <>
                        <div className="cl-cart-subtotal cl-cart-subtotal--discount">
                          <span className="cl-cart-subtotal__label">Member coupon</span>
                          <span className="cl-cart-subtotal__amount">-{fmtPrice(previewDiscount)}</span>
                        </div>
                        <div className="cl-cart-subtotal cl-cart-subtotal--total">
                          <span className="cl-cart-subtotal__label">Total</span>
                          <span className="cl-cart-subtotal__amount">{fmtPrice(total)}</span>
                        </div>
                      </>
                    )}
                  </div>

                </div>
              );
            })()}
            {error && <p className="cl-cart-error">{error}</p>}
            {showAuthGate ? (
              <div className="cl-cart-auth-gate">
                <p className="cl-cart-auth-gate__heading">Do you have an account?</p>
                <p className="cl-cart-auth-gate__hint">
                  Signing in attaches this order to your account so downloads
                  and order history stay in one place. Guest checkout still
                  works — you&rsquo;ll just get your downloads by email.
                </p>
                <a
                  href={`/account/login?next=${encodeURIComponent(nextParam())}`}
                  className="cl-cart-btn cl-cart-btn--primary"
                >
                  Sign in to your account
                </a>
                <a
                  href={`/account/register?next=${encodeURIComponent(nextParam())}`}
                  className="cl-cart-btn cl-cart-btn--ghost"
                >
                  Create an account
                </a>
                <button
                  type="button"
                  className="cl-cart-btn cl-cart-btn--ghost"
                  disabled={checkingOut}
                  onClick={handleCheckout}
                >
                  {checkingOut ? "..." : "Continue as guest"}
                </button>
                <button
                  type="button"
                  className="cl-cart-auth-gate__back"
                  onClick={() => setShowAuthGate(false)}
                >
                  ← Back to cart
                </button>
              </div>
            ) : (
              <>
                <p className="cl-cart-fineprint">
                  By purchasing you agree to the{" "}
                  <button
                    type="button"
                    className="cl-cart-fineprint__link"
                    onClick={() => setTermsOpen(true)}
                  >
                    terms of purchase
                  </button>
                  .
                </p>
                <button
                  type="button"
                  className="cl-cart-btn cl-cart-btn--primary"
                  disabled={checkingOut}
                  onClick={handleCheckoutClick}
                >
                  {checkingOut ? "..." : "Proceed to Checkout"}
                </button>
                <button
                  type="button"
                  className="cl-cart-btn cl-cart-btn--ghost"
                  onClick={close}
                >
                  Continue Browsing
                </button>
              </>
            )}
          </div>
        )}

        {termsOpen && (
          <>
            <div
              className="cl-cart-terms__backdrop"
              onClick={() => setTermsOpen(false)}
              aria-hidden="true"
            />
            <div
              className="cl-cart-terms"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cl-cart-terms-title"
            >
              <div className="cl-cart-terms__header">
                <h3 id="cl-cart-terms-title" className="cl-cart-terms__title">
                  Terms of purchase
                </h3>
                <button
                  type="button"
                  className="cl-cart-terms__close"
                  aria-label="Close"
                  onClick={() => setTermsOpen(false)}
                >
                  ×
                </button>
              </div>
              <div className="cl-cart-terms__body">
                <p>
                  By completing this purchase you&rsquo;ll receive
                  transactional emails (receipt, downloads, shipping).
                  I&rsquo;ll also send the occasional update about new
                  music, art, and pop-ups.{" "}
                  <strong>One-click unsubscribe in every email.</strong>
                </p>
                <p>
                  Full{" "}
                  <a href="/terms-of-service" target="_blank" rel="noreferrer">
                    terms of service
                  </a>
                  {" "}and{" "}
                  <a href="/privacy-policy" target="_blank" rel="noreferrer">
                    privacy policy
                  </a>
                  .
                </p>
              </div>
            </div>
          </>
        )}
      </aside>

      {count > 0 && !isOpen && (
        <button
          type="button"
          className="cl-cart-toggle"
          aria-label={`Open cart, ${count} item${count === 1 ? "" : "s"}`}
          onClick={open}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="9" cy="21" r="1.5" />
            <circle cx="18" cy="21" r="1.5" />
            <path d="M3 3h2l3 12h11l3-9H6" />
          </svg>
          <span className="cl-cart-toggle__badge">{count}</span>
        </button>
      )}
    </>
  );
}

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

const CART_KEY = "chadlewine_cart";
const AUTO_CLOSE_MS = 5000;

export type CartItem = {
  type: "song" | "album" | "ringtone" | "merch" | "art_original";
  id: string;
  title: string;
  slug: string;
  price: number;
  // Format applies only to song/album (selected at delivery for albums).
  // Ringtones are their own SKU and always deliver M4R + MP3 — format is null.
  format: "mp3" | "flac" | "wav" | null;
  cover_art_path: string | null;
  // Merch-only fields. variant_label shows under the title in the cart drawer
  // ("Print", "The Art tee", etc.). product_config carries configurator state
  // so the same blueprint with different sources is a distinct cart line.
  variant_label?: string | null;
  product_config?: Record<string, unknown> | null;
};

function configHash(config: Record<string, unknown> | null | undefined): string {
  if (!config) return "na";
  return JSON.stringify(
    Object.entries(config)
      .filter(([, v]) => v !== undefined && v !== null)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

function lineKey(item: Pick<CartItem, "type" | "id" | "format" | "product_config">): string {
  return `${item.type}:${item.id}:${item.format ?? "na"}:${configHash(item.product_config)}`;
}

type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotal: number;
  hasItem: (item: Pick<CartItem, "type" | "id" | "format" | "product_config">) => boolean;
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
    (probe: Pick<CartItem, "type" | "id" | "format" | "product_config">) =>
      items.some((i) => lineKey(i) === lineKey(probe)),
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
          })),
          marketing_opt_in: true,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
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
          {items.length === 0 ? (
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
                        {item.type === "album"
                          ? "Album download"
                          : item.type === "ringtone"
                            ? "Ringtone (M4R + MP3)"
                            : item.type === "song"
                              ? "Song download"
                              : item.type === "art_original"
                                ? "Original artwork"
                                : item.variant_label || "Merch"}
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
        </div>

        {items.length > 0 && (
          <div className="cl-cart-drawer__footer">
            <div className="cl-cart-subtotal">
              <span className="cl-cart-subtotal__label">Subtotal</span>
              <span className="cl-cart-subtotal__amount">{fmtPrice(subtotal)}</span>
            </div>
            {error && <p className="cl-cart-error">{error}</p>}
            <p className="cl-cart-disclaimer">
              By completing this purchase you&rsquo;ll receive transactional
              emails (receipt, downloads, shipping). I&rsquo;ll also send the
              occasional update about new music, art, and pop-ups.
              {" "}<strong>One-click unsubscribe in every email.</strong>
            </p>
            <button
              type="button"
              className="cl-cart-btn cl-cart-btn--primary"
              disabled={checkingOut}
              onClick={handleCheckout}
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
          </div>
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

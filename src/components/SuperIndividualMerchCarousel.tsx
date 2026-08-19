"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { MerchNewBadge } from "@/components/MerchNewBadge";

export interface CarouselProduct {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  image_alt: string | null;
  price: number | null;
  is_new?: boolean | null;
}

interface Props {
  products: CarouselProduct[];
}

const TRANSITION_MS = 1000;

export function SuperIndividualMerchCarousel({ products }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const lockoutRef = useRef(false);
  const total = products.length;

  const advance = useCallback(
    (dir: 1 | -1) => {
      if (lockoutRef.current || total <= 1) return;
      lockoutRef.current = true;
      setIsLocked(true);
      setCurrentIndex((i) => (i + dir + total) % total);
      setTimeout(() => {
        lockoutRef.current = false;
        setIsLocked(false);
      }, TRANSITION_MS);
    },
    [total]
  );

  const advanceRef = useRef(advance);
  useEffect(() => {
    advanceRef.current = advance;
  }, [advance]);

  useEffect(() => {
    if (total <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || e.target.isContentEditable) return;
      }
      if (e.key === "ArrowRight") advanceRef.current(1);
      else if (e.key === "ArrowLeft") advanceRef.current(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  if (total === 0) return null;

  const current = products[currentIndex];
  const href = `/merch/${current.slug || current.id}`;

  return (
    <div className="si-merch-carousel">
      <div className="si-merch-carousel__stage">
        {total > 1 && (
          <button
            type="button"
            className="si-merch-carousel__nav si-merch-carousel__nav--prev"
            onClick={() => advance(-1)}
            disabled={isLocked}
            aria-label="Previous product"
          >
            <span aria-hidden>‹</span>
          </button>
        )}

        <div className="si-merch-carousel__viewport">
        {products.map((p, i) => {
          let offset = i - currentIndex;
          if (offset > total / 2) offset -= total;
          else if (offset < -total / 2) offset += total;
          if (Math.abs(offset) > 1) return null;

          const role = offset === 0 ? "current" : offset < 0 ? "prev" : "next";
          const baseTranslate = role === "current" ? "0%" : role === "next" ? "100%" : "-100%";
          const productHref = `/merch/${p.slug || p.id}`;

          return (
            <div
              key={p.id}
              className={`si-merch-carousel__slide si-merch-carousel__slide--${role}`}
              style={{ transform: `translateX(${baseTranslate})` }}
              aria-hidden={role !== "current"}
            >
              <Link
                href={productHref}
                className="si-merch-carousel__image-link"
                aria-label={p.title}
                tabIndex={role === "current" ? 0 : -1}
              >
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image_url}
                    alt={p.image_alt || p.title}
                    className="si-merch-carousel__image"
                  />
                ) : (
                  <div className="si-merch-carousel__image si-merch-carousel__image--empty" />
                )}
                {p.is_new && <MerchNewBadge seed={p.slug || p.id} />}
              </Link>
            </div>
          );
        })}

        </div>

        {total > 1 && (
          <button
            type="button"
            className="si-merch-carousel__nav si-merch-carousel__nav--next"
            onClick={() => advance(1)}
            disabled={isLocked}
            aria-label="Next product"
          >
            <span aria-hidden>›</span>
          </button>
        )}
      </div>

      <div className="si-merch-carousel__meta">
        <h3 className="si-merch-carousel__title">
          <Link href={href} className="si-merch-carousel__title-link">
            {current.title}
          </Link>
        </h3>
        {current.price != null && (
          <span className="si-merch-carousel__price">${current.price}</span>
        )}
        <Link href={href} className="si-merch-carousel__cta">
          View product →
        </Link>
      </div>

      {total > 1 && (
        <div className="si-merch-carousel__indicator" role="tablist" aria-label="Product selector">
          {products.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={i === currentIndex}
              aria-label={p.title}
              className={`si-merch-carousel__dot${i === currentIndex ? " si-merch-carousel__dot--active" : ""}`}
              onClick={() => {
                if (i === currentIndex || lockoutRef.current) return;
                lockoutRef.current = true;
                setCurrentIndex(i);
                setTimeout(() => {
                  lockoutRef.current = false;
                }, TRANSITION_MS);
              }}
            />
          ))}
        </div>
      )}

      <div className="si-merch-carousel__counter">
        {currentIndex + 1} / {total}
      </div>
    </div>
  );
}

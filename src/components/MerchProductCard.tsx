import Link from "next/link";
import { MerchNewBadge } from "@/components/MerchNewBadge";

export interface ProductVariant {
  id: number;
  title: string;
  size: string | null;
  color: string | null;
  price_cents: number;
}

interface Props {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  image_alt: string | null;
  href?: string;
  /** Draws the NEW badge over the top-left of the image. Toggled per product in the admin. */
  isNew?: boolean;
}

export function MerchProductCard({ id, slug, title, image_url, image_alt, href: hrefProp, isNew }: Props) {
  const href = hrefProp || `/merch/${slug || id}`;

  return (
    <div className="merch-shop__card">
      {image_url && (
        <Link href={href} className="merch-shop__card-img-link">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image_url}
            alt={image_alt || title}
            className="merch-shop__card-img"
          />
          {isNew && <MerchNewBadge seed={slug || id} />}
        </Link>
      )}
      <h2 className="merch-shop__card-title">
        <Link href={href} className="merch-shop__card-title-link">
          {title}
        </Link>
      </h2>
    </div>
  );
}

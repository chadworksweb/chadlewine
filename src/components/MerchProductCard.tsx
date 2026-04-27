import Link from "next/link";

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
}

export function MerchProductCard({ id, slug, title, image_url, image_alt, href: hrefProp }: Props) {
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
        </Link>
      )}
      <h3 className="merch-shop__card-title">
        <Link href={href} className="merch-shop__card-title-link">
          {title}
        </Link>
      </h3>
    </div>
  );
}

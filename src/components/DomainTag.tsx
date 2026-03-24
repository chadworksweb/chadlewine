import Link from "next/link";
import { getDomains, getDomainLabel } from "@/lib/domains";

interface DomainTagProps {
  slug: string;
  label?: string;
  size?: "sm" | "md";
}

export async function DomainTag({ slug, label, size = "sm" }: DomainTagProps) {
  const displayLabel = label ?? getDomainLabel(slug, await getDomains());

  return (
    <Link
      href={`/domains/${slug}`}
      className={`domain-tag domain-tag--${size}`}
      data-domain={slug}
    >
      {displayLabel}
    </Link>
  );
}

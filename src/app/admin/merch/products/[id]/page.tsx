"use client";

import { useParams } from "next/navigation";
import { MerchProductEditor } from "@/components/admin/MerchProductEditor";

export default function EditProductPage() {
  const params = useParams();
  const idOrSlug = params.id as string;
  return <MerchProductEditor idOrSlug={idOrSlug} />;
}

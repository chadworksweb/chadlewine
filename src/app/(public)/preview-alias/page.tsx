import { notFound } from "next/navigation";
import { getPageWithSections } from "@/lib/pages";
import { PageSections } from "@/components/PageSections";

// TEMP, LOCAL-ONLY preview of the private (draft) alias-history page. Uses the
// admin/service read so it renders regardless of status. Disabled in production
// as a safety net. Delete when done eyeballing.
export const dynamic = "force-dynamic";

export default async function PreviewAliasPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const result = await getPageWithSections("alias-history");
  if (!result) notFound();

  return (
    <PageSections
      page={result.page}
      sections={result.sections}
      wrapperId="page-alias-history"
      wrapperClassName="page-super-individual"
    />
  );
}

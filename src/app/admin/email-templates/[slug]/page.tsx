import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-server";
import { EmailTemplateEditor } from "@/components/EmailTemplateEditor";
import type { EmailBlock } from "@/lib/email-blocks";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function EmailTemplateEditPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const { data: tpl } = await supabase
    .from("email_templates")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!tpl) notFound();

  return (
    <EmailTemplateEditor
      slug={tpl.slug}
      initial={{
        name: tpl.name,
        kind: tpl.kind,
        subject_template: tpl.subject_template,
        preheader_template: tpl.preheader_template,
        body_blocks: (tpl.body_blocks as EmailBlock[]) || [],
      }}
    />
  );
}

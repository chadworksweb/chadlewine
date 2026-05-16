import { createAdminClient } from "@/lib/supabase-server";
import { EmailGlobalsEditor } from "@/components/EmailGlobalsEditor";
import type { EmailBlock } from "@/lib/email-blocks";

export const dynamic = "force-dynamic";

export default async function EmailGlobalsPage() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("email_globals")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  return (
    <EmailGlobalsEditor
      initial={{
        header_blocks: (data?.header_blocks as EmailBlock[]) || [],
        footer_blocks: (data?.footer_blocks as EmailBlock[]) || [],
      }}
    />
  );
}

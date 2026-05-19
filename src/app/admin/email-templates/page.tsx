import Link from "next/link";
import { createAdminClient } from "@/lib/supabase-server";
import { NewEmailTemplateButton } from "@/components/NewEmailTemplateButton";

export const dynamic = "force-dynamic";

interface TemplateRow {
  slug: string;
  name: string;
  kind: string;
  subject_template: string;
  updated_at: string;
}

export default async function EmailTemplatesIndex() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("email_templates")
    .select("slug, name, kind, subject_template, updated_at")
    .order("name");
  const templates = (data || []) as TemplateRow[];

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Email templates</h1>
        <div className="admin-page__header-actions">
          <Link
            href="/admin/email-templates/globals"
            className="admin-btn admin-btn--secondary"
          >
            Edit header / footer
          </Link>
          <NewEmailTemplateButton />
        </div>
      </div>

      {templates.length === 0 ? (
        <p style={{ color: "var(--text-tertiary)", padding: "var(--space-lg) 0" }}>
          No templates yet. Click &ldquo;New template&rdquo; to add one.
        </p>
      ) : (
        <div className="template-list">
          {templates.map((t) => (
            <Link
              key={t.slug}
              href={`/admin/email-templates/${t.slug}`}
              className="template-list__card"
            >
              <div className="template-list__card-body">
                <p className="template-list__card-title">{t.name}</p>
                <p className="template-list__card-meta">
                  <code>{t.slug}</code> &middot; {t.kind} &middot; subject:{" "}
                  <em>{t.subject_template || "(no subject)"}</em>
                </p>
              </div>
              <span className="template-list__card-arrow" aria-hidden>&rarr;</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

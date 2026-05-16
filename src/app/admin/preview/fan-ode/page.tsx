import Link from "next/link";
import { renderTemplateBySlug } from "@/lib/email-blocks";

export const dynamic = "force-dynamic";

interface FanOdePreviewProps {
  searchParams: Promise<{ first_name?: string; token?: string }>;
}

export default async function FanOdePreview({ searchParams }: FanOdePreviewProps) {
  const sp = await searchParams;
  const firstName = sp.first_name ?? "Chad";
  const token = sp.token ?? "preview-token-aabbccddeeff0011";

  const rendered = await renderTemplateBySlug("fan-ode", {
    first_name: firstName,
    token,
  });

  if (!rendered) {
    return (
      <div className="admin-page">
        <div className="admin-page__header">
          <h1 className="admin-page__title">Fan-ode template missing</h1>
        </div>
        <p style={{ color: "var(--text-tertiary)" }}>
          The <code>fan-ode</code> template hasn&rsquo;t been seeded yet. Run the
          {" "}<code>20260516140000_email_blocks.sql</code> migration in
          Supabase SQL Editor.
        </p>
      </div>
    );
  }

  const html = rendered.html;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Fan-ode email preview</h1>
      </div>

      <form method="get" className="email-preview__controls">
        <label className="email-preview__label">
          First name
          <input
            type="text"
            name="first_name"
            defaultValue={firstName}
            className="email-preview__input"
            placeholder="(leave blank to test no-greeting fallback)"
          />
        </label>
        <label className="email-preview__label">
          Token
          <input
            type="text"
            name="token"
            defaultValue={token}
            className="email-preview__input"
          />
        </label>
        <button type="submit" className="admin-btn admin-btn--secondary">
          Re-render
        </button>
      </form>

      <p className="email-preview__hint">
        Edit blocks in{" "}
        <Link href="/admin/email-templates/fan-ode" className="admin-table__link">
          the block editor
        </Link>
        . Globals (header + footer) live{" "}
        <Link href="/admin/email-templates/globals" className="admin-table__link">
          here
        </Link>
        .
      </p>

      <iframe
        title="Fan-ode email preview"
        srcDoc={html}
        className="email-preview__frame"
      />
    </div>
  );
}

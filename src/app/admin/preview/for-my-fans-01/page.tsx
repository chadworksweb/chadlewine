import Link from "next/link";
import { renderTemplateBySlug } from "@/lib/email-blocks";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    first_name?: string;
    token?: string;
    track_url?: string;
  }>;
}

const SLUG = "for-my-fans-01";

export default async function ForMyFans01Preview({ searchParams }: Props) {
  const sp = await searchParams;
  const firstName = sp.first_name ?? "Chad";
  const token = sp.token ?? "preview-token-aabbccddeeff0011";
  const trackUrl =
    sp.track_url ??
    `https://chadlewine.com/${SLUG}?token=${encodeURIComponent(token)}`;

  const rendered = await renderTemplateBySlug(SLUG, {
    first_name: firstName,
    token,
    track_url: trackUrl,
  });

  if (!rendered) {
    return (
      <div className="admin-page">
        <div className="admin-page__header">
          <h1 className="admin-page__title">for-my-fans-01 template missing</h1>
        </div>
        <p style={{ color: "var(--text-tertiary)" }}>
          The <code>for-my-fans-01</code> template hasn&rsquo;t been seeded yet.
          Run <code>20260519130100_fan_track_email_template.sql</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">For-my-fans-01 email preview</h1>
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
        <label className="email-preview__label">
          Track URL
          <input
            type="text"
            name="track_url"
            defaultValue={trackUrl}
            className="email-preview__input"
          />
        </label>
        <button type="submit" className="admin-btn admin-btn--secondary">
          Re-render
        </button>
      </form>

      <p className="email-preview__hint">
        Edit blocks in{" "}
        <Link href={`/admin/email-templates/${SLUG}`} className="admin-table__link">
          the block editor
        </Link>
        . Globals (header + footer) live{" "}
        <Link href="/admin/email-templates/globals" className="admin-table__link">
          here
        </Link>
        .
      </p>

      <iframe
        title="For-my-fans-01 email preview"
        srcDoc={rendered.html}
        className="email-preview__frame"
      />
    </div>
  );
}

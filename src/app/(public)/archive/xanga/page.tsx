import type { Metadata } from "next";
import * as fs from "fs";
import * as path from "path";

export const metadata: Metadata = {
  title: "Xanga Archive (2004–2011)",
  description: "Archive of blog entries from Xanga, 2004–2011.",
  alternates: { canonical: "https://chadlewine.com/archive/xanga" },
};

function parseXangaMarkdown(md: string): string {
  return md
    .replace(/^## (.+)$/gm, '<h2 class="xanga-title">$1</h2>')
    .replace(/^\*(.+)\*$/gm, '<em class="xanga-date">$1</em>')
    .replace(/^---$/gm, "<hr />")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<)(.+)$/gm, "<p>$1</p>")
    .replace(/<p><\/p>/g, "");
}

export default function XangaArchivePage() {
  const archivePath = path.resolve(
    "C:/Users/chad/Local Sites/chadlewine-astro/src/data/xanga-archive.md"
  );

  let html = "<p>Xanga archive not found.</p>";

  if (fs.existsSync(archivePath)) {
    const md = fs.readFileSync(archivePath, "utf-8");
    html = parseXangaMarkdown(md);
  }

  return (
    <article id="page-xanga-archive" className="page-static">
      <h1 className="page-static__title">
        Xanga Archive (2004–2011)
      </h1>

      <div
        id="xanga-entries"
        className="reading-column"
        style={{ maxWidth: "100%", padding: 0 }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}

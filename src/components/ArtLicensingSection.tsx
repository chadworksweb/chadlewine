export function ArtLicensingSection({
  directAnswer,
  contentHtml,
  keyPoints,
  title,
}: {
  directAnswer: string | null;
  contentHtml: string | null;
  keyPoints: string[] | null;
  title: string;
}) {
  const hasContent = !!(directAnswer || contentHtml || (keyPoints && keyPoints.length > 0));
  if (!hasContent) return null;

  return (
    <section className="art-detail__section art-detail__licensing">
      <h2>Where could &ldquo;{title}&rdquo; be placed?</h2>
      {directAnswer && <p className="art-detail__licensing-direct">{directAnswer}</p>}
      {contentHtml && (
        <div className="art-detail__licensing-prose" dangerouslySetInnerHTML={{ __html: contentHtml }} />
      )}
      {keyPoints && keyPoints.length > 0 && (
        <ul className="art-detail__licensing-points">
          {keyPoints.map((pt, i) => (
            <li key={i}>{pt}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

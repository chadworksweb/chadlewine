interface MarkdownRendererProps {
  html: string;
}

export function MarkdownRenderer({ html }: MarkdownRendererProps) {
  return (
    <div
      className="reading-column"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

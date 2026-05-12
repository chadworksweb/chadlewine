// Visible TO-WRITE block. Renders an amber-tinted box with a label and the
// prompt body so unwritten copy is impossible to miss in dev or on the live
// page. Replace the <Prompt> with the real prose when copy is ready.

interface Props {
  label: string;
  children: React.ReactNode;
}

export function Prompt({ label, children }: Props) {
  return (
    <div className="prompt-block" role="note" aria-label={`Writing prompt: ${label}`}>
      <span className="prompt-block__label">TO WRITE — {label}</span>
      <div className="prompt-block__body">{children}</div>
    </div>
  );
}

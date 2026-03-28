"use client";

interface SocialShareProps {
  url: string;
  text: string;
}

export function SocialShare({ url, text }: SocialShareProps) {
  const encoded = encodeURIComponent(text);
  const encodedUrl = encodeURIComponent(url);

  const links = [
    { label: "X", href: `https://x.com/intent/tweet?text=${encoded}&url=${encodedUrl}` },
    { label: "Threads", href: `https://threads.net/intent/post?text=${encoded}%0A${encodedUrl}` },
    { label: "Bluesky", href: `https://bsky.app/intent/compose?text=${encoded}%0A${encodedUrl}` },
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}` },
  ];

  return (
    <div className="social-share">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="social-share__link"
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}

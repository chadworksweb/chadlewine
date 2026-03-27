import { cookies } from "next/headers";

interface AdminEditButtonProps {
  href: string;
}

export async function AdminEditButton({ href }: AdminEditButtonProps) {
  const cookieStore = await cookies();
  const isAdmin = cookieStore.has("sb-access-token");

  if (!isAdmin) return null;

  return (
    <a
      href={href}
      className="admin-edit-btn"
      title="Edit in admin"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M11.5 1.5L14.5 4.5L5 14H2V11L11.5 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M9.5 3.5L12.5 6.5" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    </a>
  );
}

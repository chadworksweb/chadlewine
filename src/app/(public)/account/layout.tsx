// Account pages (login / register / forgot + reset password / claim) read
// per-request URL params (redirect targets, reset tokens) via useSearchParams
// and are inherently per-visitor -- not cacheable content. Forcing dynamic for
// the whole account subtree keeps them rendering as before, now that the root
// layout no longer makes every route dynamic.
export const dynamic = "force-dynamic";

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

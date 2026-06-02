import { AdminSidebar } from "@/components/AdminSidebar";

// Admin is per-user and auth-gated (proxy.ts) -- it must never be statically
// prerendered. Forcing dynamic for the whole /admin subtree in one place keeps
// it rendering as before, now that the root layout no longer reads
// cookies()/headers() (which used to make every route dynamic implicitly).
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin — Chad Lewine",
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="admin">
      <AdminSidebar />
      <div className="admin__main">
        {children}
      </div>
    </div>
  );
}

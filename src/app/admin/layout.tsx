import { AdminSidebar } from "@/components/AdminSidebar";

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

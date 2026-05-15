import { redirect } from "next/navigation";

// /admin/subscribers is now /admin/audience — the master contact view
// (subscribers are a filtered slice of audience now). This redirect keeps
// muscle memory + any bookmarks working.
export default function AdminSubscribersRedirect() {
  redirect("/admin/audience");
}

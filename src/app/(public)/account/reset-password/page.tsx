import type { Metadata } from "next";
import { AccountAuthForm } from "@/components/AccountAuthForm";

export const metadata: Metadata = {
  title: "Reset password - Chad Lewine",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return <AccountAuthForm mode="reset" />;
}

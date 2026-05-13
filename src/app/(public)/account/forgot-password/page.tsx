import type { Metadata } from "next";
import { AccountAuthForm } from "@/components/AccountAuthForm";

export const metadata: Metadata = {
  title: "Forgot password - Chad Lewine",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return <AccountAuthForm mode="forgot" />;
}

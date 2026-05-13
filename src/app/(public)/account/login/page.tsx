import type { Metadata } from "next";
import { AccountAuthForm } from "@/components/AccountAuthForm";

export const metadata: Metadata = {
  title: "Sign in - Chad Lewine",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <AccountAuthForm mode="login" />;
}
